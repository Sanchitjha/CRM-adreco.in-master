"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import {
  confirmPhrase,
  describeRange,
  monthKey,
  protectionOf,
  rangeBounds,
  rangeFromInput,
  type CleanupRange,
  type Protection,
} from "@/lib/data-cleanup";
import type { ActionState } from "@/lib/action-state";

export type CleanupReport = {
  /** In words, e.g. "created before 2026-08-13 (more than 3 months ago)". */
  rangeText: string;
  scopeText: string;
  /** Leads in the period and scope. */
  inRange: number;
  /** Of those, the ones that will be deleted. */
  deletable: number;
  /** Of those, the ones kept, and why. */
  kept: Record<Protection, number>;
  /** Leads to be deleted, by the month they were created. */
  months: { month: string; count: number }[];
  /** What to type to confirm. */
  phrase: string;
  /** Set once the deletion has run. */
  deleted?: number;
  failed?: number;
};

export type CleanupState = ActionState & { report?: CleanupReport };

type Scope = { kind: "all" } | { kind: "imports" } | { kind: "batch"; id: string };

const DENIED: CleanupState = { error: "Only an administrator can clear data." };
const CHUNK = 200;

function scopeFromInput(raw: string): Scope {
  if (raw === "imports") return { kind: "imports" };
  if (raw.startsWith("batch:") && raw.length > 6) return { kind: "batch", id: raw.slice(6) };
  return { kind: "all" };
}

/** The same question is asked when previewing and when deleting, so the preview is exactly what the delete does. */
async function findLeads(range: CleanupRange, scope: Scope, includeQuoted: boolean) {
  const { from, before } = rangeBounds(range);
  const where: Prisma.LeadWhereInput = {
    createdAt: { ...(from ? { gte: from } : {}), lt: before },
    ...(scope.kind === "imports" ? { importBatchId: { not: null } } : scope.kind === "batch" ? { importBatchId: scope.id } : {}),
  };
  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      status: true,
      convertedAt: true,
      currentDepartmentId: true,
      _count: {
        select: {
          salesOrders: true,
          installations: true,
          tickets: true,
          serialNumbers: true,
          amcContracts: true,
          quotations: true,
          siteSurveys: true,
        },
      },
    },
  });

  const kept: Record<Protection, number> = { converted: 0, business: 0, quotes: 0 };
  const ids: string[] = [];
  const perMonth = new Map<string, number>();
  for (const l of leads) {
    const why = protectionOf(
      {
        status: l.status,
        convertedAt: l.convertedAt,
        currentDepartmentId: l.currentDepartmentId,
        orders: l._count.salesOrders,
        installations: l._count.installations,
        tickets: l._count.tickets,
        serials: l._count.serialNumbers,
        amcContracts: l._count.amcContracts,
        quotations: l._count.quotations,
        surveys: l._count.siteSurveys,
      },
      includeQuoted,
    );
    if (why) {
      kept[why] += 1;
      continue;
    }
    ids.push(l.id);
    const key = monthKey(l.createdAt);
    perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
  }
  const months = [...perMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
  return { ids, inRange: leads.length, kept, months };
}

async function describeScope(scope: Scope): Promise<string> {
  if (scope.kind === "all") return "all leads";
  if (scope.kind === "imports") return "leads that came in through an import";
  const batch = await prisma.importBatch.findUnique({ where: { id: scope.id }, select: { fileName: true, createdAt: true } });
  return batch ? `leads imported from “${batch.fileName}”` : "a past import";
}

function readInput(formData: FormData) {
  const range = rangeFromInput({
    mode: String(formData.get("mode") ?? ""),
    months: String(formData.get("months") ?? ""),
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
  });
  const scope = scopeFromInput(String(formData.get("scope") ?? "all"));
  const includeQuoted = formData.get("includeQuoted") === "on";
  return { range, scope, includeQuoted };
}

/** Shows what would be deleted. Nothing is changed. */
export async function previewCleanup(_prev: CleanupState, formData: FormData): Promise<CleanupState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return DENIED;

  const { range, scope, includeQuoted } = readInput(formData);
  if (!range.ok) return { error: range.error };
  if (range.range.kind === "all" && scope.kind !== "batch") {
    return { error: "“Any date” can only be used to clear one specific import. Choose a period instead." };
  }

  const found = await findLeads(range.range, scope, includeQuoted);
  const report: CleanupReport = {
    rangeText: describeRange(range.range),
    scopeText: await describeScope(scope),
    inRange: found.inRange,
    deletable: found.ids.length,
    kept: found.kept,
    months: found.months,
    phrase: confirmPhrase(found.ids.length),
  };
  return {
    message: found.ids.length > 0 ? `${found.ids.length} lead(s) would be deleted.` : "Nothing would be deleted.",
    report,
  };
}

/** Deletes what the preview showed, after the administrator has typed the confirmation. */
export async function runCleanup(_prev: CleanupState, formData: FormData): Promise<CleanupState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return DENIED;

  const { range, scope, includeQuoted } = readInput(formData);
  if (!range.ok) return { error: range.error };
  if (range.range.kind === "all" && scope.kind !== "batch") {
    return { error: "“Any date” can only be used to clear one specific import. Choose a period instead." };
  }

  const found = await findLeads(range.range, scope, includeQuoted);
  if (found.ids.length === 0) return { error: "There is nothing to delete for this choice." };

  const expected = Number(formData.get("expected"));
  if (expected !== found.ids.length) {
    return { error: `The number of leads changed since the preview (now ${found.ids.length}). Preview again before deleting.` };
  }
  const typed = String(formData.get("confirm") ?? "").trim();
  if (typed !== confirmPhrase(found.ids.length)) {
    return { error: `Type ${confirmPhrase(found.ids.length)} exactly to confirm.` };
  }

  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < found.ids.length; i += CHUNK) {
    const chunk = found.ids.slice(i, i + CHUNK);
    try {
      const result = await prisma.lead.deleteMany({ where: { id: { in: chunk } } });
      deleted += result.count;
    } catch {
      failed += chunk.length;
    }
  }

  const scopeText = await describeScope(scope);
  await logActivity({
    userId: user.id,
    action: "LEADS_CLEARED",
    entityType: "Lead",
    entityId: "cleanup",
    details: {
      period: describeRange(range.range),
      scope: scopeText,
      deleted,
      failed,
      keptConverted: found.kept.converted,
      keptWithBusiness: found.kept.business,
      keptWithQuotes: found.kept.quotes,
    },
  });
  revalidatePath("/leads");
  revalidatePath("/admin/data");

  return {
    message: failed > 0 ? `Deleted ${deleted} lead(s). ${failed} could not be deleted.` : `Deleted ${deleted} lead(s).`,
    report: {
      rangeText: describeRange(range.range),
      scopeText,
      inRange: found.inRange,
      deletable: found.ids.length,
      kept: found.kept,
      months: found.months,
      phrase: confirmPhrase(found.ids.length),
      deleted,
      failed,
    },
  };
}

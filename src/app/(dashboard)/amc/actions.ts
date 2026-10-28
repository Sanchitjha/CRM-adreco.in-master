"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser, type SessionUser } from "@/lib/action-auth";
import { FIELD_ROLES, canManage } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { isFieldTechnician } from "@/lib/people";
import { nextNumber } from "@/lib/sequence";
import { addDaysUtc, buildVisitSchedule, daysBetween } from "@/lib/lifecycle";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import {
  amcIdSchema,
  completeVisitSchema,
  createAmcSchema,
  rescheduleVisitSchema,
  visitIdSchema,
} from "@/lib/validation/amc";

const DENIED: ActionState = { error: "You do not have permission to manage maintenance contracts." };

function revalidateAmc(id?: string) {
  revalidatePath("/amc");
  if (id) revalidatePath(`/amc/${id}`);
}

/** Units that already sit on another active contract overlapping these dates. */
async function overlappingUnits(serialIds: string[], start: Date, end: Date, ignoreAmcId?: string): Promise<string[]> {
  const clashes = await prisma.amcUnit.findMany({
    where: {
      serialNumberId: { in: serialIds },
      amc: {
        status: "ACTIVE",
        startDate: { lte: end },
        endDate: { gte: start },
        ...(ignoreAmcId ? { id: { not: ignoreAmcId } } : {}),
      },
    },
    include: { serialNumber: { select: { serialNo: true } } },
  });
  return clashes.map((c) => c.serialNumber.serialNo);
}

export async function createAmc(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "amc")) return DENIED;

  const parsed = createAmcSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const serialIds = [...new Set(formData.getAll("serialIds").map(String).filter(Boolean))];
  if (serialIds.length === 0) return { error: "Choose at least one machine to cover." };

  const start = dateOrNull(d.startDate);
  const end = dateOrNull(d.endDate);
  if (!start || !end) return { error: "Enter valid dates." };
  if (end.getTime() <= start.getTime()) return { error: "The contract must end after it starts." };

  const lead = await prisma.lead.findUnique({ where: { id: d.leadId } });
  if (!lead) return { error: "That customer no longer exists." };
  if (!canSeeLead(user.role, user.id, lead)) return { error: "You do not have access to this customer." };

  const units = await prisma.serialNumber.findMany({ where: { id: { in: serialIds } } });
  if (units.length !== serialIds.length || units.some((u) => u.leadId !== lead.id)) {
    return { error: "Every covered machine must belong to this customer." };
  }
  if (units.some((u) => u.status === "SCRAPPED" || u.status === "IN_STOCK")) {
    return { error: "Only machines that are with the customer can be covered." };
  }

  const clash = await overlappingUnits(serialIds, start, end);
  if (clash.length > 0) {
    return { error: `Already covered by an active contract in these dates: ${clash.slice(0, 5).join(", ")}.` };
  }

  const contract = await prisma.$transaction(async (tx) =>
    tx.amcContract.create({
      data: {
        contractNumber: await nextNumber("AMC", tx),
        leadId: lead.id,
        createdById: user.id,
        startDate: start,
        endDate: end,
        visitsPerYear: d.visitsPerYear,
        amount: d.amount,
        coveredParts: textOrNull(d.coveredParts),
        notes: textOrNull(d.notes),
        units: { create: serialIds.map((serialNumberId) => ({ serialNumberId })) },
        visits: { create: buildVisitSchedule(start, end, d.visitsPerYear).map((scheduledFor) => ({ scheduledFor })) },
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "AMC_CREATED",
    entityType: "AmcContract",
    entityId: contract.id,
    details: { contractNumber: contract.contractNumber, units: serialIds.length },
  });

  revalidateAmc(contract.id);
  revalidatePath("/warranty");
  redirect(`/amc/${contract.id}`);
}

export async function cancelAmc(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "amc")) return DENIED;

  const parsed = amcIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const contract = await prisma.amcContract.findUnique({ where: { id: parsed.data.amcId }, include: { lead: true } });
  if (!contract) return { error: "Contract not found." };
  if (!canSeeLead(user.role, user.id, contract.lead)) return { error: "You do not have access to this contract." };
  if (contract.status === "CANCELLED") return { error: "This contract is already cancelled." };

  await prisma.$transaction([
    prisma.amcContract.update({ where: { id: contract.id }, data: { status: "CANCELLED" } }),
    prisma.amcVisit.updateMany({ where: { amcId: contract.id, status: "SCHEDULED" }, data: { status: "SKIPPED" } }),
  ]);
  await logActivity({
    userId: user.id,
    action: "AMC_CANCELLED",
    entityType: "AmcContract",
    entityId: contract.id,
    details: { from: "ACTIVE", to: "CANCELLED" },
  });

  revalidateAmc(contract.id);
  return {};
}

/** Starts the next term the day after this one ends, covering the same machines on the same terms. */
export async function renewAmc(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "amc")) return DENIED;

  const parsed = amcIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const old = await prisma.amcContract.findUnique({
    where: { id: parsed.data.amcId },
    include: { lead: true, units: true, renewals: { select: { id: true } } },
  });
  if (!old) return { error: "Contract not found." };
  if (!canSeeLead(user.role, user.id, old.lead)) return { error: "You do not have access to this contract." };
  if (old.status === "CANCELLED") return { error: "A cancelled contract cannot be renewed." };
  if (old.renewals.length > 0) return { error: "This contract has already been renewed." };

  const lengthDays = daysBetween(old.startDate, old.endDate);
  const start = addDaysUtc(old.endDate, 1);
  const end = addDaysUtc(start, lengthDays);

  const clash = await overlappingUnits(old.units.map((u) => u.serialNumberId), start, end, old.id);
  if (clash.length > 0) return { error: `Already covered from ${start.toLocaleDateString("en-IN")}: ${clash.slice(0, 5).join(", ")}.` };

  const renewal = await prisma.$transaction(async (tx) =>
    tx.amcContract.create({
      data: {
        contractNumber: await nextNumber("AMC", tx),
        leadId: old.leadId,
        createdById: user.id,
        startDate: start,
        endDate: end,
        visitsPerYear: old.visitsPerYear,
        amount: old.amount,
        coveredParts: old.coveredParts,
        notes: old.notes,
        renewedFromId: old.id,
        units: { create: old.units.map((u) => ({ serialNumberId: u.serialNumberId })) },
        visits: { create: buildVisitSchedule(start, end, old.visitsPerYear).map((scheduledFor) => ({ scheduledFor })) },
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "AMC_RENEWED",
    entityType: "AmcContract",
    entityId: old.id,
    details: { note: renewal.contractNumber },
  });
  await logActivity({
    userId: user.id,
    action: "AMC_CREATED",
    entityType: "AmcContract",
    entityId: renewal.id,
    details: { contractNumber: renewal.contractNumber, units: old.units.length },
  });

  revalidateAmc(old.id);
  redirect(`/amc/${renewal.id}`);
}

/** Loads a visit and the contract it belongs to, checking the user may act on it. */
async function loadVisit(visitId: string, user: SessionUser) {
  const visit = await prisma.amcVisit.findUnique({ where: { id: visitId }, include: { amc: { include: { lead: true } } } });
  if (!visit) return { visit: null, error: "Visit not found." } as const;
  if (!canSeeLead(user.role, user.id, visit.amc.lead)) return { visit: null, error: "You do not have access to this visit." } as const;
  if (!canManage(user.role, "amc") && visit.technicianId !== user.id) {
    return { visit: null, error: "You do not have permission to change this visit." } as const;
  }
  if (visit.amc.status === "CANCELLED") return { visit: null, error: "This contract is cancelled." } as const;
  return { visit, error: null } as const;
}

export async function completeVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = completeVisitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const { visit, error } = await loadVisit(d.visitId, user);
  if (!visit) return { error };
  if (visit.status === "COMPLETED") return { error: "This visit is already recorded." };

  const technicianId = textOrNull(d.technicianId) ?? visit.technicianId ?? (FIELD_ROLES.includes(user.role) ? user.id : null);
  if (technicianId && technicianId !== visit.technicianId && !(await isFieldTechnician(technicianId))) {
    return { error: "Choose an active service or installation team member." };
  }

  await prisma.amcVisit.update({
    where: { id: visit.id },
    data: { status: "COMPLETED", completedAt: new Date(), technicianId, notes: textOrNull(d.notes) },
  });
  await logActivity({
    userId: user.id,
    action: "AMC_VISIT_COMPLETED",
    entityType: "AmcContract",
    entityId: visit.amcId,
    details: { note: textOrNull(d.notes) ?? "" },
  });

  revalidateAmc(visit.amcId);
  return {};
}

export async function skipVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = visitIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const { visit, error } = await loadVisit(parsed.data.visitId, user);
  if (!visit) return { error };
  if (visit.status !== "SCHEDULED") return { error: "Only a scheduled visit can be skipped." };

  await prisma.amcVisit.update({ where: { id: visit.id }, data: { status: "SKIPPED" } });
  await logActivity({ userId: user.id, action: "AMC_VISIT_SKIPPED", entityType: "AmcContract", entityId: visit.amcId });

  revalidateAmc(visit.amcId);
  return {};
}

export async function rescheduleVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = rescheduleVisitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const { visit, error } = await loadVisit(parsed.data.visitId, user);
  if (!visit) return { error };
  if (visit.status !== "SCHEDULED") return { error: "Only a scheduled visit can be moved." };

  const date = dateOrNull(parsed.data.scheduledFor);
  if (!date) return { error: "Enter a valid date." };

  await prisma.amcVisit.update({ where: { id: visit.id }, data: { scheduledFor: date } });
  await logActivity({ userId: user.id, action: "AMC_VISIT_RESCHEDULED", entityType: "AmcContract", entityId: visit.amcId });

  revalidateAmc(visit.amcId);
  return { message: "Visit moved." };
}

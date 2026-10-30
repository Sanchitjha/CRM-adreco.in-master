"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { phoneKey } from "@/lib/lead-dedupe";
import { parseLeadCsv, type ImportProblem, type ImportRow } from "@/lib/lead-import";
import type { ActionState } from "@/lib/action-state";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ImportDuplicate = { line: number; customerName: string; phone: string; reason: string };

export type ImportReport = {
  mode: "check" | "import";
  totalRows: number;
  /** Rows that will be added (check) or were added (import). */
  ready: number;
  duplicates: ImportDuplicate[];
  problems: ImportProblem[];
};

export type ImportState = ActionState & { report?: ImportReport };

export async function importLeads(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { role, id: userId } = session.user;
  if (role !== "ADMIN" && role !== "SALES") return { error: "You do not have permission to import leads." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to upload." };
  if (file.size > MAX_FILE_BYTES) return { error: "That file is larger than 2 MB. Split it into smaller files." };
  const mode = formData.get("mode") === "import" ? "import" : "check";

  const parsed = parseLeadCsv(await file.text());
  if (parsed.fatal) return { error: parsed.fatal };

  // Only administrators can hand leads to someone else; a salesperson's imports always belong to them.
  const owners =
    role === "ADMIN"
      ? await prisma.user.findMany({
          where: { active: true, role: { in: ["ADMIN", "SALES"] } },
          select: { id: true, email: true },
        })
      : [];
  const ownerByEmail = new Map(owners.map((u) => [u.email.toLowerCase(), u.id]));

  // Compare against every lead in the CRM, not just the importer's, so the same customer isn't chased twice.
  const existing = await prisma.lead.findMany({ select: { customerName: true, phone: true, email: true } });
  const nameByPhone = new Map<string, string>();
  const nameByEmail = new Map<string, string>();
  for (const l of existing) {
    const key = phoneKey(l.phone);
    if (key.length >= 7 && !nameByPhone.has(key)) nameByPhone.set(key, l.customerName);
    if (l.email) nameByEmail.set(l.email.trim().toLowerCase(), l.customerName);
  }

  const problems = [...parsed.problems];
  const duplicates: ImportDuplicate[] = [];
  const toCreate: { row: ImportRow; assignedToId: string | null }[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const row of parsed.rows) {
    let assignedToId: string | null = role === "SALES" ? userId : null;
    if (role === "ADMIN" && row.assignedTo) {
      assignedToId = ownerByEmail.get(row.assignedTo) ?? null;
      if (!assignedToId) {
        problems.push({ line: row.line, message: `No active salesperson has the email ${row.assignedTo}.` });
        continue;
      }
    }

    const key = phoneKey(row.phone);
    const emailKey = row.email?.toLowerCase();
    const existingName = nameByPhone.get(key) ?? (emailKey ? nameByEmail.get(emailKey) : undefined);
    const repeated = seenPhones.has(key) || (emailKey ? seenEmails.has(emailKey) : false);

    if (existingName || repeated) {
      duplicates.push({
        line: row.line,
        customerName: row.customerName,
        phone: row.phone,
        reason: existingName ? `Already in the CRM as “${existingName}”` : "Repeated earlier in this file",
      });
      continue;
    }

    seenPhones.add(key);
    if (emailKey) seenEmails.add(emailKey);
    toCreate.push({ row, assignedToId });
  }

  problems.sort((a, b) => a.line - b.line);
  const report: ImportReport = { mode, totalRows: parsed.totalRows, ready: toCreate.length, duplicates, problems };

  if (mode === "check") {
    return {
      message: toCreate.length > 0 ? `File checked. ${toCreate.length} lead(s) are ready to import.` : "File checked. Nothing new to import.",
      report,
    };
  }

  if (toCreate.length > 0) {
    await prisma.lead.createMany({
      data: toCreate.map(({ row, assignedToId }) => ({
        customerName: row.customerName,
        phone: row.phone,
        email: row.email,
        address: row.address,
        productCategory: row.productCategory,
        requirementNotes: row.requirementNotes,
        budget: row.budget,
        source: row.source ?? "Imported",
        assignedToId,
        createdById: userId,
      })),
    });
    await logActivity({
      userId,
      action: "LEADS_IMPORTED",
      entityType: "Lead",
      entityId: "import",
      details: { fileName: file.name, created: toCreate.length, duplicates: duplicates.length, problems: problems.length },
    });
    revalidatePath("/leads");
  }

  return { message: `Imported ${toCreate.length} lead(s).`, report };
}

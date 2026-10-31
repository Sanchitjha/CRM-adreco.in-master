"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { parseCsv } from "@/lib/csv";
import { phoneKey } from "@/lib/lead-dedupe";
import { parseLeadTable, type ImportProblem, type ImportRow } from "@/lib/lead-import";
import { looksLikeXlsx, readXlsx } from "@/lib/xlsx-lite";
import type { ActionState } from "@/lib/action-state";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ImportDuplicate = { line: number; customerName: string; phone: string; reason: string };

export type ImportReport = {
  mode: "check" | "import";
  totalRows: number;
  /** Prospects that will be (check) or were (import) added. */
  ready: number;
  /** Other people on those prospects that will be, or were, saved with them. */
  contacts: number;
  /** Prospects that come with a follow-up (call notes and a next date). */
  followUps: number;
  duplicates: ImportDuplicate[];
  problems: ImportProblem[];
};

export type ImportState = ActionState & { report?: ImportReport };

const atMidnightUtc = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

export async function importLeads(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { role, id: userId } = session.user;
  if (role !== "ADMIN" && role !== "SALES") return { error: "You do not have permission to import leads." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or Excel file to upload." };
  if (file.size > MAX_FILE_BYTES) return { error: "That file is larger than 2 MB. Split it into smaller files." };
  const mode = formData.get("mode") === "import" ? "import" : "check";

  const bytes = new Uint8Array(await file.arrayBuffer());
  let table: string[][];
  if (looksLikeXlsx(bytes)) {
    try {
      table = readXlsx(bytes).rows;
    } catch {
      return { error: "That Excel file could not be read. Save it again as .xlsx (or as CSV) and try once more." };
    }
  } else {
    table = parseCsv(new TextDecoder("utf-8").decode(bytes));
  }

  const parsed = parseLeadTable(table);
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

  // Compare against every lead in the CRM, and the contacts saved on them, so the same customer isn't chased twice.
  const [existing, existingContacts] = await Promise.all([
    prisma.lead.findMany({ select: { customerName: true, phone: true, email: true } }),
    prisma.leadContact.findMany({ where: { phone: { not: null } }, select: { phone: true, lead: { select: { customerName: true } } } }),
  ]);
  const reasonByPhone = new Map<string, string>();
  const reasonByEmail = new Map<string, string>();
  for (const l of existing) {
    const key = phoneKey(l.phone);
    if (key.length >= 7 && !reasonByPhone.has(key)) reasonByPhone.set(key, `Already in the CRM as “${l.customerName}”`);
    if (l.email) reasonByEmail.set(l.email.trim().toLowerCase(), `Already in the CRM as “${l.customerName}”`);
  }
  for (const c of existingContacts) {
    const key = phoneKey(c.phone ?? "");
    if (key.length >= 7 && !reasonByPhone.has(key)) reasonByPhone.set(key, `Already in the CRM as a contact on “${c.lead.customerName}”`);
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
    const existingReason = reasonByPhone.get(key) ?? (emailKey ? reasonByEmail.get(emailKey) : undefined);
    const repeated = seenPhones.has(key) || (emailKey ? seenEmails.has(emailKey) : false);

    if (existingReason || repeated) {
      duplicates.push({
        line: row.line,
        customerName: row.customerName,
        phone: row.phone,
        reason: existingReason ?? "Repeated earlier in this file",
      });
      continue;
    }

    seenPhones.add(key);
    if (emailKey) seenEmails.add(emailKey);
    toCreate.push({ row, assignedToId });
  }

  problems.sort((a, b) => a.line - b.line);
  const report: ImportReport = {
    mode,
    totalRows: parsed.totalRows,
    ready: toCreate.length,
    contacts: toCreate.reduce((n, { row }) => n + row.contacts.length, 0),
    followUps: toCreate.filter(({ row }) => row.followUp).length,
    duplicates,
    problems,
  };

  if (mode === "check") {
    return {
      message: toCreate.length > 0 ? `File checked. ${toCreate.length} lead(s) are ready to import.` : "File checked. Nothing new to import.",
      report,
    };
  }

  if (toCreate.length > 0) {
    // Each prospect is saved together with its other contacts and its follow-up, all or nothing.
    await prisma.$transaction(
      async (tx) => {
        for (const { row, assignedToId } of toCreate) {
          await tx.lead.create({
            data: {
              customerName: row.customerName,
              contactRole: row.contactRole,
              phone: row.phone,
              email: row.email,
              address: row.address,
              productCategory: row.productCategory,
              requirementNotes: row.requirementNotes,
              budget: row.budget,
              source: row.source ?? "Imported",
              referredBy: row.referredBy,
              status: row.status,
              assignedToId,
              createdById: userId,
              ...(row.enquiryDate ? { createdAt: atMidnightUtc(row.enquiryDate) } : {}),
              contacts: {
                create: row.contacts.map((c) => ({ name: c.name, role: c.role, phone: c.phone, email: c.email })),
              },
              followUps: row.followUp
                ? {
                    create: [
                      {
                        userId,
                        note: row.followUp.note,
                        nextFollowUpDate: row.followUp.nextDate ? atMidnightUtc(row.followUp.nextDate) : null,
                      },
                    ],
                  }
                : undefined,
            },
          });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    await logActivity({
      userId,
      action: "LEADS_IMPORTED",
      entityType: "Lead",
      entityId: "import",
      details: {
        fileName: file.name,
        created: toCreate.length,
        contacts: report.contacts,
        followUps: report.followUps,
        duplicates: duplicates.length,
        problems: problems.length,
      },
    });
    revalidatePath("/leads");
  }

  return { message: `Imported ${toCreate.length} lead(s).`, report };
}

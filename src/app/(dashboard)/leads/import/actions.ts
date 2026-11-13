"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { getAiConfig } from "@/lib/ai";
import { headingsSafeToSend, suggestColumns } from "@/lib/column-ai";
import { parseCsv } from "@/lib/csv";
import { today } from "@/lib/dates";
import { applyPeriod, describePeriod, periodFromInput, periodProblem } from "@/lib/import-period";
import { resolveOwner } from "@/lib/import-owners";
import { phoneKey } from "@/lib/lead-dedupe";
import {
  IMPORT_BATCH_SIZE,
  IMPORT_FIELDS,
  MAX_IMPORT_FILE_BYTES,
  detectColumns,
  parseLeadTable,
  type ColumnInfo,
  type ImportField,
  type ImportRow,
} from "@/lib/lead-import";
import { leadFromImportRow } from "@/lib/lead-import-save";
import { looksLikeXlsx, readXlsxSheets, type SheetData } from "@/lib/xlsx-lite";
import type { ActionState } from "@/lib/action-state";

export type ImportSheetReport = {
  index: number;
  name: string;
  /** Data rows in the sheet, including contact rows. */
  rows: number;
  /** Prospects found in it. */
  prospects: number;
  columns: ColumnInfo[];
  /** Why the sheet was left out, when it was. */
  skipped: string | null;
};

export type ImportDuplicate = { sheet: string; line: number; customerName: string; phone: string; reason: string };
export type ImportProblemRow = { sheet: string; line: number; message: string };
export type OwnerWarning = { owner: string; count: number; reason: string };

export type ImportReport = {
  mode: "check" | "import";
  /** Data rows in the file, over all sheets. */
  totalRows: number;
  sheets: ImportSheetReport[];
  /** In words: "everything in the file", "the last 3 months (from 2026-08-13)". */
  period: string;
  /** Prospects the period leaves in, which is what an import goes through. */
  inPeriod: number;
  outsidePeriod: number;
  /** Prospects with no date, left out when a period is chosen. */
  undated: number;
  /** Prospects that will be (check) or were (this step of the import) added. */
  ready: number;
  /** Other people on those prospects that will be, or were, saved with them. */
  contacts: number;
  /** Prospects that come with a follow-up (call notes and a next date). */
  followUps: number;
  duplicates: ImportDuplicate[];
  problems: ImportProblemRow[];
  /** Owners named in the sheet that could not be matched to a person, so those leads were left unassigned. */
  ownerWarnings: OwnerWarning[];
  /** What the AI did with the column headings, or why it did not. */
  aiNote: string | null;
  /** The import this step belongs to, once it has started. */
  batchId: string | null;
  /** Where this step started in the list of prospects, where the next one starts, and whether this was the last. */
  offset: number;
  nextOffset: number;
  done: boolean;
};

export type ImportState = ActionState & { report?: ImportReport };

type ColumnChoice = Map<number, Map<number, ImportField | "">>;

const FIELD_NAMES = new Set<string>(IMPORT_FIELDS.map((f) => f.field));

/** The columns a person confirmed, as { sheet: { column: field } }. Anything malformed is ignored. */
function readColumnChoice(raw: FormDataEntryValue | null): ColumnChoice {
  const out: ColumnChoice = new Map();
  if (typeof raw !== "string" || raw === "") return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    for (const [sheet, columns] of Object.entries(parsed ?? {})) {
      const sheetIndex = Number(sheet);
      if (!Number.isInteger(sheetIndex) || typeof columns !== "object" || columns === null) continue;
      const inner = new Map<number, ImportField | "">();
      for (const [col, field] of Object.entries(columns)) {
        const colIndex = Number(col);
        if (!Number.isInteger(colIndex) || colIndex < 0) continue;
        if (field === "" || (typeof field === "string" && FIELD_NAMES.has(field))) inner.set(colIndex, field as ImportField | "");
      }
      out.set(sheetIndex, inner);
    }
  } catch {
    // A bad value is treated as "no choice made".
  }
  return out;
}

const emptyReport = (mode: "check" | "import", over: Partial<ImportReport> = {}): ImportReport => ({
  mode,
  totalRows: 0,
  sheets: [],
  period: "everything in the file",
  inPeriod: 0,
  outsidePeriod: 0,
  undated: 0,
  ready: 0,
  contacts: 0,
  followUps: 0,
  duplicates: [],
  problems: [],
  ownerWarnings: [],
  aiNote: null,
  batchId: null,
  offset: 0,
  nextOffset: 0,
  done: true,
  ...over,
});

export async function importLeads(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { role, id: userId } = session.user;
  if (role !== "ADMIN" && role !== "SALES") return { error: "You do not have permission to import leads." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or Excel file to upload." };
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: `That file is larger than ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB. Split it into smaller files.` };
  }
  const mode = formData.get("mode") === "import" ? "import" : "check";
  const offset = Math.max(0, Math.floor(Number(formData.get("offset")) || 0));
  const todayDate = today();

  const period = periodFromInput({
    months: String(formData.get("months") ?? ""),
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
  });
  const periodError = periodProblem(period);
  if (periodError) return { error: periodError };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let sheets: SheetData[];
  if (looksLikeXlsx(bytes)) {
    try {
      sheets = readXlsxSheets(bytes);
    } catch {
      return { error: "That Excel file could not be read. Save it again as .xlsx (or as CSV) and try once more." };
    }
  } else {
    sheets = [{ sheetName: "", rows: parseCsv(new TextDecoder("utf-8").decode(bytes)) }];
  }

  // Read every sheet with its own columns: from the person's choice if there is one, else from the headings, with
  // the AI's help for headings that are not the usual ones. Only the headings ever go to the AI.
  const chosen = readColumnChoice(formData.get("columnMap"));
  const aiConfig = getAiConfig();
  const sheetReports: ImportSheetReport[] = [];
  const tagged: { row: ImportRow; sheet: string }[] = [];
  const problems: ImportProblemRow[] = [];
  const aiNotes: string[] = [];
  let totalRows = 0;
  let firstFatal: string | null = null;

  for (const [index, sheet] of sheets.entries()) {
    const table = sheet.rows;
    const header = table[0] ?? [];
    const label = sheet.sheetName || "the file";

    let columns: Map<ImportField, number>;
    const decidedBy = new Map<number, "ai" | "you">();
    const choice = chosen.get(index);

    if (choice) {
      const detected = detectColumns(header);
      columns = new Map();
      for (const [col, field] of choice) if (field !== "" && !columns.has(field)) columns.set(field, col);
      for (const [field, col] of columns) if (detected.get(field) !== col) decidedBy.set(col, "you");
    } else {
      columns = detectColumns(header);
      const known = new Set(columns.values());
      const unrecognised = header.filter((h, i) => h.trim() !== "" && !known.has(i));
      if (aiConfig && table.length > 1 && unrecognised.length > 0) {
        if (headingsSafeToSend(header)) {
          const answer = await suggestColumns(aiConfig, header);
          if (answer.ok) {
            let matched = 0;
            for (const [col, field] of answer.map) {
              if (known.has(col) || columns.has(field)) continue;
              columns.set(field, col);
              decidedBy.set(col, "ai");
              matched += 1;
            }
            if (matched > 0) aiNotes.push(`${label}: the AI matched ${matched} column${matched === 1 ? "" : "s"} from their headings.`);
          } else {
            aiNotes.push(`${label}: the AI could not help (${answer.reason}).`);
          }
        } else {
          aiNotes.push(`${label}: the first row looks like data rather than headings, so it was not sent to the AI.`);
        }
      }
    }

    const parsed = parseLeadTable(table, { columns, decidedBy });
    totalRows += table.length > 0 ? table.length - 1 : 0;

    if (parsed.fatal) {
      firstFatal ??= sheets.length > 1 ? `${label}: ${parsed.fatal}` : parsed.fatal;
      sheetReports.push({ index, name: sheet.sheetName, rows: Math.max(0, table.length - 1), prospects: 0, columns: parsed.columns, skipped: parsed.fatal });
      continue;
    }

    sheetReports.push({ index, name: sheet.sheetName, rows: parsed.totalRows, prospects: parsed.rows.length, columns: parsed.columns, skipped: null });
    for (const row of parsed.rows) tagged.push({ row, sheet: sheet.sheetName });
    for (const p of parsed.problems) problems.push({ sheet: sheet.sheetName, line: p.line, message: p.message });
  }

  const aiNote = aiNotes.length > 0 ? aiNotes.join(" ") : null;
  if (sheetReports.every((s) => s.skipped !== null)) {
    return { error: firstFatal ?? "The file has nothing to import.", report: emptyReport(mode, { sheets: sheetReports, totalRows, aiNote }) };
  }

  // Which part of the file to bring in, by each prospect's enquiry date.
  const sheetOf = new Map<ImportRow, string>(tagged.map((t) => [t.row, t.sheet]));
  const { kept, outside, undated } = applyPeriod(
    tagged.map((t) => t.row),
    period,
    todayDate,
  );

  // Only administrators can hand leads to someone else; a salesperson's imports always belong to them.
  const people =
    role === "ADMIN"
      ? await prisma.user.findMany({
          where: { active: true, role: { in: ["ADMIN", "SALES"] } },
          select: { id: true, email: true, name: true },
        })
      : [];

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

  // A check goes through every prospect; an import goes through one step of them at a time.
  const stepRows = mode === "check" ? kept : kept.slice(offset, offset + IMPORT_BATCH_SIZE);
  const duplicates: ImportDuplicate[] = [];
  const toCreate: { row: ImportRow; assignedToId: string | null }[] = [];
  const ownerProblems = new Map<string, OwnerWarning>();
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const row of stepRows) {
    let assignedToId: string | null = role === "SALES" ? userId : null;
    if (role === "ADMIN" && row.assignedTo) {
      const match = resolveOwner(row.assignedTo, people);
      if (match.ok) {
        assignedToId = match.id;
      } else {
        const entry = ownerProblems.get(row.assignedTo) ?? { owner: row.assignedTo, count: 0, reason: match.reason };
        entry.count += 1;
        ownerProblems.set(row.assignedTo, entry);
      }
    }

    const key = phoneKey(row.phone);
    const emailKey = row.email?.toLowerCase();
    const existingReason = reasonByPhone.get(key) ?? (emailKey ? reasonByEmail.get(emailKey) : undefined);
    const repeated = seenPhones.has(key) || (emailKey ? seenEmails.has(emailKey) : false);

    if (existingReason || repeated) {
      duplicates.push({
        sheet: sheetOf.get(row) ?? "",
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

  problems.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.line - b.line);
  const nextOffset = mode === "check" ? 0 : Math.min(kept.length, offset + IMPORT_BATCH_SIZE);
  const report: ImportReport = {
    mode,
    totalRows,
    sheets: sheetReports,
    period: describePeriod(period, todayDate),
    inPeriod: kept.length,
    outsidePeriod: outside,
    undated,
    ready: toCreate.length,
    contacts: toCreate.reduce((n, { row }) => n + row.contacts.length, 0),
    followUps: toCreate.filter(({ row }) => row.followUp).length,
    duplicates,
    problems,
    ownerWarnings: [...ownerProblems.values()].sort((a, b) => b.count - a.count),
    aiNote,
    batchId: null,
    offset,
    nextOffset,
    done: mode === "check" ? true : nextOffset >= kept.length,
  };

  if (mode === "check") {
    return {
      message: toCreate.length > 0 ? `File checked. ${toCreate.length} lead(s) are ready to import.` : "File checked. Nothing new to import.",
      report,
    };
  }

  let batchId = String(formData.get("batchId") ?? "") || null;
  if (batchId && !(await prisma.importBatch.findUnique({ where: { id: batchId }, select: { id: true } }))) batchId = null;

  if (toCreate.length > 0) {
    if (!batchId) {
      const batch = await prisma.importBatch.create({
        data: { fileName: file.name.slice(0, 200), createdById: userId, period: describePeriod(period, todayDate) },
        select: { id: true },
      });
      batchId = batch.id;
    }
    const importBatchId = batchId;

    // Each prospect is saved together with its other contacts and its follow-up, all or nothing for the whole step.
    await prisma.$transaction(
      async (tx) => {
        for (const { row, assignedToId } of toCreate) {
          await tx.lead.create({ data: leadFromImportRow(row, userId, assignedToId, importBatchId) });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    await prisma.importBatch.update({
      where: { id: importBatchId },
      data: {
        leadsAdded: { increment: toCreate.length },
        contacts: { increment: report.contacts },
        followUps: { increment: report.followUps },
      },
    });
    await logActivity({
      userId,
      action: "LEADS_IMPORTED",
      entityType: "Lead",
      entityId: importBatchId,
      details: {
        fileName: file.name,
        created: toCreate.length,
        contacts: report.contacts,
        followUps: report.followUps,
        duplicates: duplicates.length,
        problems: problems.length,
        period: report.period,
      },
    });
    revalidatePath("/leads");
    revalidatePath("/admin/data");
  }

  report.batchId = batchId;
  return { message: `Imported ${toCreate.length} lead(s).`, report };
}

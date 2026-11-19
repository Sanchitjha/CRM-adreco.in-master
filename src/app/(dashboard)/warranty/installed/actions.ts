"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import { canRecordInstalledBase } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { getAiConfig } from "@/lib/ai";
import { headingsSafeToSend, suggestColumns, type ColumnTarget } from "@/lib/column-ai";
import { parseCsv } from "@/lib/csv";
import { toDateInput } from "@/lib/dates";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/lead-import";
import { looksLikeXlsx, readXlsxSheets, type SheetData } from "@/lib/xlsx-lite";
import {
  EMPTY_RAW_ROW,
  INSTALLED_BATCH_SIZE,
  INSTALLED_FIELDS,
  checkInstalledRow,
  detectInstalledColumns,
  parseInstalledTable,
  type InstalledColumnInfo,
  type InstalledField,
  type InstalledProblem,
  type InstalledRow,
  type RawInstalledRow,
} from "@/lib/installed-base";
import { buildPlan } from "@/lib/installed-plan";
import { loadKnown, planRows, savePlan } from "@/lib/installed-save";
import type { ActionState } from "@/lib/action-state";
import { firstIssueMessage } from "@/lib/validation/common";
import { addInstalledSchema } from "@/lib/validation/installed";

const DENIED: ActionState = { error: "You do not have permission to record installed machines." };

function revalidateAfterSave() {
  revalidatePath("/warranty");
  revalidatePath("/amc");
  revalidatePath("/serial-numbers");
  revalidatePath("/leads");
}

/* ---------------------------------------------------------------------------------------------------------------
 * The form: one customer, one model
 * ------------------------------------------------------------------------------------------------------------- */

export async function addInstalled(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canRecordInstalledBase(user.role)) return DENIED;

  const parsed = addInstalledSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  // The customer: one chosen from the CRM, or a new one that must not already be there.
  let chosen: { id: string; customerName: string; phone: string; address: string | null; assignedToId: string | null } | null = null;
  if (d.customerMode === "existing") {
    if (!d.leadId) return { error: "Choose the customer from the list." };
    chosen = await prisma.lead.findUnique({ where: { id: d.leadId }, select: { id: true, customerName: true, phone: true, address: true, assignedToId: true } });
    if (!chosen) return { error: "That customer no longer exists." };
    if (!canSeeLead(user.role, user.id, chosen)) return { error: "You do not have access to this customer." };
  } else if (!d.customerName) {
    return { error: "Enter the customer's name." };
  }

  // The machine: a catalogue model, or text for one that is not in the catalogue.
  let model = d.model ?? "";
  let capacityKw = d.capacityKw ?? "";
  if (d.productId && d.productId !== "other") {
    const product = await prisma.product.findUnique({ where: { id: d.productId }, select: { modelCode: true, isSparePart: true } });
    if (!product || product.isSparePart) return { error: "Choose a machine model from the list." };
    model = product.modelCode;
    capacityKw = "";
  }

  // The warranty: the model's usual period, a number of months, or an exact end date.
  let warranty = "";
  let warrantyEnds = "";
  if (d.warrantyChoice === "custom") {
    warrantyEnds = d.warrantyEndsOn ?? "";
    if (!warrantyEnds) return { error: "Enter the day the warranty ends." };
  } else if (d.warrantyChoice && d.warrantyChoice !== "default") {
    warranty = `${d.warrantyChoice} months`;
  }

  // The maintenance contract: only when it was switched on.
  const withAmc = d.hasAmc === "on";
  let amcTerm = "";
  let amcEnd = "";
  if (withAmc) {
    if (d.amcTerm === "custom") {
      amcEnd = d.amcEnd ?? "";
      if (!amcEnd) return { error: "Enter the day the AMC ends." };
    } else {
      amcTerm = d.amcTerm ? `${d.amcTerm} months` : "";
    }
  }

  const raw: RawInstalledRow = {
    ...EMPTY_RAW_ROW,
    customerName: chosen?.customerName ?? d.customerName ?? "",
    phone: chosen?.phone ?? d.phone ?? "",
    email: chosen ? "" : (d.email ?? ""),
    address: chosen?.address ?? d.address ?? "",
    contactPerson: chosen ? "" : (d.contactPerson ?? ""),
    model,
    capacityKw,
    quantity: d.quantity ?? "",
    serials: d.serials ?? "",
    installedOn: d.installedOn ?? "",
    warranty,
    warrantyEnds,
    amcStart: withAmc ? (d.amcStart ?? "") : "",
    amcEnd,
    amcTerm,
    amcAmount: withAmc ? (d.amcAmount ?? "") : "",
    amcVisits: withAmc ? (d.amcVisits ?? "") : "",
    amcParts: withAmc ? (d.amcParts ?? "") : "",
    notes: d.notes ?? "",
  };
  if (withAmc && !raw.amcStart.trim()) return { error: "Enter the day the AMC starts." };

  const checked = checkInstalledRow(raw, 1, toDateInput(new Date()));
  if (!checked.ok) return { error: checked.message };

  const known = await loadKnown([checked.row]);
  // A customer chosen from the list is the only one the machine can go to; a new one is checked against all of them.
  const plan = buildPlan([checked.row], chosen ? { ...known, customers: known.customers.filter((c) => c.id === chosen.id) } : known);
  if (plan.problems.length > 0) return { error: plan.problems[0].message };
  if (plan.items.length === 0) return { error: plan.skipped[0]?.message ?? "Nothing was added." };
  if (!chosen && plan.items[0].customer.kind === "existing") {
    const found = plan.items[0].customer;
    return {
      error: `“${found.name}” is already in the CRM. Choose it under “Customer already in the CRM”, or change the name or the place if this is another site.`,
    };
  }

  let summary;
  try {
    summary = await savePlan(plan, { userId: user.id, role: user.role });
  } catch {
    return { error: "The machines could not be saved. Please try again." };
  }

  revalidateAfterSave();
  redirect(`/warranty/installed/new?saved=${summary.machines}&lead=${summary.leadIds[0] ?? ""}`);
}

/* ---------------------------------------------------------------------------------------------------------------
 * The file: many customers
 * ------------------------------------------------------------------------------------------------------------- */

export type InstalledSheetReport = {
  index: number;
  name: string;
  rows: number;
  /** Rows of the sheet that can be imported. */
  usable: number;
  columns: InstalledColumnInfo[];
  /** Why the sheet was left out, when it was. */
  skipped: string | null;
};

export type InstalledReport = {
  mode: "check" | "import";
  /** Data rows in the file, over all sheets. */
  totalRows: number;
  sheets: InstalledSheetReport[];
  /** Rows that passed their checks, which is what an import goes through. */
  usableRows: number;
  /** Machines that will be (check) or were (this step of the import) added. */
  machines: number;
  customersNew: number;
  customersMatched: number;
  amcContracts: number;
  newModels: number;
  /** Rows left out because the CRM already has them. */
  skipped: InstalledProblem[];
  /** Rows that cannot be used, and why. */
  problems: InstalledProblem[];
  /** What the AI did with the column headings, or why it did not. */
  aiNote: string | null;
  /** Where this step started in the list of rows, where the next one starts, and whether this was the last. */
  offset: number;
  nextOffset: number;
  done: boolean;
};

export type InstalledImportState = ActionState & { report?: InstalledReport };

type ColumnChoice = Map<number, Map<number, InstalledField | "">>;

const FIELD_NAMES = new Set<string>(INSTALLED_FIELDS.map((f) => f.field));

const TARGET: ColumnTarget = {
  intro: "You match the column headings of a spreadsheet that lists heat pumps installed at customer sites, with their warranty and maintenance contract (AMC) details, to the fields of a CRM.",
  fields: INSTALLED_FIELDS,
};

/** The columns a person confirmed, as { sheet: { column: field } }. Anything malformed is ignored. */
function readColumnChoice(raw: FormDataEntryValue | null): ColumnChoice {
  const out: ColumnChoice = new Map();
  if (typeof raw !== "string" || raw === "") return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    for (const [sheet, columns] of Object.entries(parsed ?? {})) {
      const sheetIndex = Number(sheet);
      if (!Number.isInteger(sheetIndex) || typeof columns !== "object" || columns === null) continue;
      const inner = new Map<number, InstalledField | "">();
      for (const [col, field] of Object.entries(columns)) {
        const colIndex = Number(col);
        if (!Number.isInteger(colIndex) || colIndex < 0) continue;
        if (field === "" || (typeof field === "string" && FIELD_NAMES.has(field))) inner.set(colIndex, field as InstalledField | "");
      }
      out.set(sheetIndex, inner);
    }
  } catch {
    // A bad value is treated as "no choice made".
  }
  return out;
}

const emptyReport = (mode: "check" | "import", over: Partial<InstalledReport> = {}): InstalledReport => ({
  mode,
  totalRows: 0,
  sheets: [],
  usableRows: 0,
  machines: 0,
  customersNew: 0,
  customersMatched: 0,
  amcContracts: 0,
  newModels: 0,
  skipped: [],
  problems: [],
  aiNote: null,
  offset: 0,
  nextOffset: 0,
  done: true,
  ...over,
});

export async function importInstalled(_prev: InstalledImportState, formData: FormData): Promise<InstalledImportState> {
  const user = await requireUser();
  if (!canRecordInstalledBase(user.role)) return DENIED;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or Excel file to upload." };
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: `That file is larger than ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB. Split it into smaller files.` };
  }
  const mode = formData.get("mode") === "import" ? "import" : "check";
  const offset = Math.max(0, Math.floor(Number(formData.get("offset")) || 0));
  const todayIso = toDateInput(new Date());

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

  // Each sheet is read with its own columns: the person's choice if there is one, else the headings, with the AI's
  // help for headings that are not the usual ones. Only the headings ever go to the AI.
  const chosen = readColumnChoice(formData.get("columnMap"));
  const aiConfig = getAiConfig();
  const sheetReports: InstalledSheetReport[] = [];
  const allRows: InstalledRow[] = [];
  const problems: InstalledProblem[] = [];
  const aiNotes: string[] = [];
  let totalRows = 0;
  let firstFatal: string | null = null;

  for (const [index, sheet] of sheets.entries()) {
    const table = sheet.rows;
    const header = table[0] ?? [];
    const lead = sheet.sheetName ? `${sheet.sheetName}: ` : "";

    let columns: Map<InstalledField, number>;
    const decidedBy = new Map<number, "ai" | "you">();
    const choice = chosen.get(index);

    if (choice) {
      const detected = detectInstalledColumns(header);
      columns = new Map();
      for (const [col, field] of choice) if (field !== "" && !columns.has(field)) columns.set(field, col);
      for (const [field, col] of columns) if (detected.get(field) !== col) decidedBy.set(col, "you");
    } else {
      columns = detectInstalledColumns(header);
      const known = new Set(columns.values());
      const unrecognised = header.filter((h, i) => h.trim() !== "" && !known.has(i));
      if (aiConfig && table.length > 1 && unrecognised.length > 0) {
        if (headingsSafeToSend(header)) {
          const answer = await suggestColumns<InstalledField>(aiConfig, header, { target: TARGET });
          if (answer.ok) {
            let matched = 0;
            for (const [col, field] of answer.map) {
              if (known.has(col) || columns.has(field)) continue;
              columns.set(field, col);
              decidedBy.set(col, "ai");
              matched += 1;
            }
            if (matched > 0) aiNotes.push(`${lead}The AI matched ${matched} column${matched === 1 ? "" : "s"} from their headings.`);
          } else {
            aiNotes.push(`${lead}The AI could not help (${answer.reason}).`);
          }
        } else {
          aiNotes.push(`${lead}The first row looks like data rather than headings, so it was not sent to the AI.`);
        }
      }
    }

    const parsed = parseInstalledTable(table, todayIso, { columns, decidedBy });
    totalRows += parsed.totalRows;
    if (parsed.fatal) {
      firstFatal ??= sheets.length > 1 ? `${sheet.sheetName || "Sheet"}: ${parsed.fatal}` : parsed.fatal;
      sheetReports.push({ index, name: sheet.sheetName, rows: Math.max(0, table.length - 1), usable: 0, columns: parsed.columns, skipped: parsed.fatal });
      continue;
    }
    sheetReports.push({ index, name: sheet.sheetName, rows: parsed.totalRows, usable: parsed.rows.length, columns: parsed.columns, skipped: null });
    for (const row of parsed.rows) allRows.push({ ...row, sheet: sheet.sheetName });
    for (const p of parsed.problems) problems.push({ ...p, sheet: sheet.sheetName });
  }

  const aiNote = aiNotes.length > 0 ? aiNotes.join(" ") : null;
  if (sheetReports.every((s) => s.skipped !== null)) {
    return { error: firstFatal ?? "The file has nothing to import.", report: emptyReport(mode, { sheets: sheetReports, totalRows, aiNote }) };
  }

  // A check goes through every row; an import goes through one step of them at a time.
  const stepRows = mode === "check" ? allRows : allRows.slice(offset, offset + INSTALLED_BATCH_SIZE);
  const plan = await planRows(stepRows, user.role, user.id);
  const nextOffset = mode === "check" ? 0 : Math.min(allRows.length, offset + INSTALLED_BATCH_SIZE);

  const report: InstalledReport = {
    mode,
    totalRows,
    sheets: sheetReports,
    usableRows: allRows.length,
    machines: plan.totals.machines,
    customersNew: plan.totals.customersNew,
    customersMatched: plan.totals.customersMatched,
    amcContracts: plan.totals.amcContracts,
    newModels: plan.totals.newModels,
    skipped: plan.skipped,
    problems: [...problems, ...plan.problems].sort((a, b) => (a.sheet ?? "").localeCompare(b.sheet ?? "") || a.line - b.line),
    aiNote,
    offset,
    nextOffset,
    done: mode === "check" ? true : nextOffset >= allRows.length,
  };

  if (mode === "check") {
    return {
      message: plan.totals.machines > 0 ? `File checked. ${plan.totals.machines} machine(s) are ready to import.` : "File checked. Nothing new to import.",
      report,
    };
  }

  if (plan.items.length > 0) {
    let summary;
    try {
      summary = await savePlan(plan, { userId: user.id, role: user.role });
    } catch {
      return { error: "This step could not be saved. Nothing from it was recorded; run the same file again and the earlier steps are skipped.", report };
    }
    await logActivity({
      userId: user.id,
      action: "INSTALLED_IMPORTED",
      entityType: "User",
      entityId: user.id,
      details: { fileName: file.name, machines: summary.machines, customers: summary.customers, amcContracts: summary.amcContracts, models: summary.models },
    });
    revalidateAfterSave();
  }

  return { message: `Imported ${plan.totals.machines} machine(s).`, report };
}

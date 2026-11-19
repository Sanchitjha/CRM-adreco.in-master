/**
 * Machines that were installed before the CRM, as a customer's team writes them down: one row per customer and
 * model, with the installation date, the warranty and (perhaps) a maintenance contract. This file reads such rows
 * (typed in the form or taken from an Excel or CSV sheet) and checks them. It has no database or framework imports,
 * so every rule here can be tested on its own. The matching against what is already in the CRM is in
 * installed-plan.ts, and the saving in installed-save.ts.
 */
import { parseCsv } from "@/lib/csv";
import { parseFlexibleDate } from "@/lib/prospect-parse";
import { parseSerialList } from "@/lib/lifecycle";

/** Rows in one sheet. */
export const MAX_INSTALLED_ROWS = 5000;
/** Rows saved per request, so a big file is imported in steps that each finish in a few seconds. */
export const INSTALLED_BATCH_SIZE = 100;
/** Most machines a single row may stand for. */
export const MAX_MACHINES_PER_ROW = 200;

export type InstalledAmc = {
  startDate: string;
  endDate: string;
  /** What the customer pays for the contract (the annual maintenance charge). */
  amount: number;
  visitsPerYear: number;
  coveredParts: string | null;
};

export type InstalledRow = {
  /** Line in the file, counting the header as line 1, so people can find the row in their spreadsheet. */
  line: number;
  customerName: string;
  phone: string;
  email: string | null;
  address: string | null;
  contactPerson: string | null;
  /** The model as written: a catalogue name or code, or any text. */
  model: string | null;
  capacityKw: number | null;
  quantity: number;
  /** Serial numbers when the sheet has them; when it does not, the CRM gives each machine a reference number. */
  serials: string[];
  /** The day the machines were installed and handed over, "YYYY-MM-DD". The warranty runs from it. */
  installedOn: string;
  /** A warranty period in months (0 means no warranty), or null to use the model's usual period. */
  warrantyMonths: number | null;
  /** An exact warranty end date, which wins over the period. */
  warrantyEndsOn: string | null;
  amc: InstalledAmc | null;
  notes: string | null;
  /** The sheet of a workbook the row came from, set when a file is read. */
  sheet?: string;
};

export type InstalledProblem = { line: number; message: string; /** The sheet of a workbook the row came from. */ sheet?: string };

/* ---------------------------------------------------------------------------------------------------------------
 * Reading single values
 * ------------------------------------------------------------------------------------------------------------- */

const MONTH_PREFIXES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The first or the last day of a month, "YYYY-MM-DD", or null when the month or year is impossible. */
const monthEdge = (year: number, month: number, edge: "start" | "end"): string | null => {
  if (year < 1990 || year > 2100 || month < 1 || month > 12) return null;
  const day = edge === "start" ? 1 : new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/**
 * A date as "YYYY-MM-DD". Accepts everything parseFlexibleDate does (18/11/2026, 18-Nov-26, 2026-11-18). When only a
 * month and year are known ("Mar 2022", "03/2022", "2022-03"), the first day of that month is used, or the last day
 * when the date is where something ends (`edge` "end").
 */
export function parseInstallDate(text: string, edge: "start" | "end" = "start"): string | null {
  const full = parseFlexibleDate(text);
  if (full) return full;
  const s = text.trim();
  if (!s) return null;

  let m = s.match(/^([A-Za-z]{3,9})\.?[\s,/-]+(\d{4}|\d{2})$/);
  if (m) {
    const month = MONTH_PREFIXES.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return month === 0 ? null : monthEdge(year, month, edge);
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (m) return monthEdge(Number(m[2]), Number(m[1]), edge);
  m = s.match(/^(\d{4})[/\-.](\d{1,2})$/);
  if (m) return monthEdge(Number(m[1]), Number(m[2]), edge);
  return null;
}

const NUMBER_WORDS: [RegExp, string][] = [
  [/\bone\b/g, "1"],
  [/\btwo\b/g, "2"],
  [/\bthree\b/g, "3"],
  [/\bfour\b/g, "4"],
  [/\bfive\b/g, "5"],
  [/\bsix\b/g, "6"],
  [/\bten\b/g, "10"],
];

/**
 * A length of time in months: "2 years", "2 yrs", "1.5 years", "18 months", "one year". A bare number below 6 is
 * years and 6 or more is months ("2" is two years, "24" is 24 months). "none", "nil", "na" and "expired" mean no
 * warranty (0). Null for a blank cell, "invalid" for anything else.
 */
export function parseDurationMonths(text: string): number | null | "invalid" {
  let s = text.trim().toLowerCase();
  if (!s) return null;
  if (/^(none|nil|no|na|n\/a|-+|expired|out of warranty)$/.test(s)) return 0;
  for (const [pattern, digit] of NUMBER_WORDS) s = s.replace(pattern, digit);

  const m = s.match(/^(\d+(?:\.\d+)?)\s*(years?|yrs?|y|months?|mos?|m)?\.?$/);
  if (!m) return "invalid";
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return "invalid";
  const months = Math.round(m[2] ? (m[2].startsWith("y") ? n * 12 : n) : n < 6 ? n * 12 : n);
  return months >= 0 && months <= 240 ? months : "invalid";
}

/** A warranty cell holds either a period ("2 years") or the day it ends ("18/11/2027"). */
export function parseWarrantyCell(text: string): { months: number } | { endsOn: string } | null | "invalid" {
  const s = text.trim();
  if (!s) return null;
  const date = parseInstallDate(s, "end");
  if (date) return { endsOn: date };
  const months = parseDurationMonths(s);
  if (months === null) return null;
  return months === "invalid" ? "invalid" : { months };
}

/** Heating capacity in kW from "33", "33 kW", "33KW" or "7.5 kw". Null when blank, "invalid" for anything else. */
export function parseCapacityKw(text: string): number | null | "invalid" {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:kw|kilowatts?)?$/);
  if (!m) return "invalid";
  const n = Number(m[1]);
  return n > 0 && n <= 2000 ? n : "invalid";
}

/** "₹ 85,000", "Rs. 85000/-" and "85000 only" become numbers; "nil" and "free" are 0. Null when blank, "invalid" for anything else. */
export function parseMoney(text: string): number | null | "invalid" {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[₹,\s]/g, "")
    .replace(/^rs\.?/, "")
    .replace(/\/-$/, "")
    .replace(/only$/, "");
  if (cleaned === "") return null;
  if (cleaned === "nil" || cleaned === "free") return 0;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return "invalid";
  return Number(cleaned);
}

/** A whole number such as a quantity. Null when blank, "invalid" for anything else. */
export function parseWholeNumber(text: string): number | null | "invalid" {
  const s = text.trim().replace(/,/g, "");
  if (!s) return null;
  if (!/^\d+$/.test(s)) return "invalid";
  return Number(s);
}

/** The machine's capacity written inside the model text, for example "Commercial heat pump 33 kW". */
export function capacityFromModel(model: string): number | null {
  const m = model.match(/(\d+(?:\.\d+)?)\s*kw\b/i);
  return m ? Number(m[1]) : null;
}

/** The last day of a contract that starts on `start` and runs `months` months: the day before the same date later. */
export function endOfTerm(start: string, months: number): string {
  const d = new Date(`${start}T00:00:00.000Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------------------------------------------------------
 * Checking one row
 * ------------------------------------------------------------------------------------------------------------- */

/** What a row looks like before it is checked: every value as the text a person typed. */
export type RawInstalledRow = {
  customerName: string;
  phone: string;
  email: string;
  address: string;
  contactPerson: string;
  model: string;
  capacityKw: string;
  quantity: string;
  serials: string;
  installedOn: string;
  warranty: string;
  warrantyEnds: string;
  amcStart: string;
  amcEnd: string;
  amcTerm: string;
  amcAmount: string;
  amcVisits: string;
  amcParts: string;
  notes: string;
};

export const EMPTY_RAW_ROW: RawInstalledRow = {
  customerName: "",
  phone: "",
  email: "",
  address: "",
  contactPerson: "",
  model: "",
  capacityKw: "",
  quantity: "",
  serials: "",
  installedOn: "",
  warranty: "",
  warrantyEnds: "",
  amcStart: "",
  amcEnd: "",
  amcTerm: "",
  amcAmount: "",
  amcVisits: "",
  amcParts: "",
  notes: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Checks one row and turns it into an InstalledRow, or says what is wrong with it. `today` is "YYYY-MM-DD" and keeps
 * an installation date from being in the future.
 */
export function checkInstalledRow(
  raw: RawInstalledRow,
  line: number,
  today: string,
): { ok: true; row: InstalledRow } | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  const customerName = raw.customerName.trim().replace(/\s+/g, " ");
  if (!customerName) return fail("The customer name is missing.");
  if (customerName.length > 200) return fail("The customer name is too long.");

  const email = raw.email.trim();
  if (email && !EMAIL.test(email)) return fail(`“${email}” is not a valid email address.`);

  const installedText = raw.installedOn.trim();
  if (!installedText) return fail("The installation date is missing.");
  const installedOn = parseInstallDate(installedText);
  if (!installedOn) return fail(`The installation date “${installedText}” is not understood. Use a day like 18/11/2024, or a month like Nov 2024.`);
  if (installedOn > today) return fail(`The installation date ${installedOn} is in the future.`);

  const model = raw.model.trim().replace(/\s+/g, " ") || null;
  if (model && model.length > 120) return fail("The model name is too long.");

  const capacityText = parseCapacityKw(raw.capacityKw);
  if (capacityText === "invalid") return fail(`The capacity “${raw.capacityKw.trim()}” is not understood. Enter it in kW, like 33.`);
  const capacityKw = capacityText ?? (model ? capacityFromModel(model) : null);

  const serials = parseSerialList(raw.serials);
  const quantityText = parseWholeNumber(raw.quantity);
  if (quantityText === "invalid") return fail(`The quantity “${raw.quantity.trim()}” is not a whole number.`);
  if (quantityText !== null && quantityText < 1) return fail("The quantity must be at least 1.");
  if (serials.length > 0 && quantityText !== null && quantityText !== serials.length) {
    return fail(`The quantity is ${quantityText} but ${serials.length} serial number${serials.length === 1 ? " is" : "s are"} given.`);
  }
  const quantity = serials.length > 0 ? serials.length : (quantityText ?? 1);
  if (quantity > MAX_MACHINES_PER_ROW) return fail(`One row can stand for at most ${MAX_MACHINES_PER_ROW} machines.`);

  const warranty = parseWarrantyCell(raw.warranty);
  if (warranty === "invalid") return fail(`The warranty “${raw.warranty.trim()}” is not understood. Write it like 2 years, 18 months, or an end date.`);
  const ends = raw.warrantyEnds.trim();
  const endsOn = ends ? parseInstallDate(ends, "end") : null;
  if (ends && !endsOn) return fail(`The warranty end date “${ends}” is not understood.`);
  const warrantyEndsOn = endsOn ?? (warranty && "endsOn" in warranty ? warranty.endsOn : null);
  const warrantyMonths = warranty && "months" in warranty ? warranty.months : null;
  if (warrantyEndsOn && warrantyEndsOn < installedOn) return fail("The warranty ends before the installation date.");

  const amc = checkAmc(raw);
  if (typeof amc === "string") return fail(amc);

  return {
    ok: true,
    row: {
      line,
      customerName,
      phone: raw.phone.trim(),
      email: email || null,
      address: raw.address.trim() || null,
      contactPerson: raw.contactPerson.trim() || null,
      model,
      capacityKw,
      quantity,
      serials,
      installedOn,
      warrantyMonths,
      warrantyEndsOn,
      amc,
      notes: raw.notes.trim() || null,
    },
  };
}

/** The maintenance contract of a row: null when the row has none, a message when it is half filled in. */
function checkAmc(raw: RawInstalledRow): InstalledAmc | null | string {
  const startText = raw.amcStart.trim();
  const endText = raw.amcEnd.trim();
  const termText = raw.amcTerm.trim();
  const amountText = raw.amcAmount.trim();
  const visitsText = raw.amcVisits.trim();
  const parts = raw.amcParts.trim();
  if (!startText && !endText && !termText && !amountText && !visitsText && !parts) return null;

  if (!startText) return "The AMC needs a start date.";
  const startDate = parseInstallDate(startText);
  if (!startDate) return `The AMC start date “${startText}” is not understood.`;

  let endDate: string;
  if (endText) {
    const end = parseInstallDate(endText, "end");
    if (!end) return `The AMC end date “${endText}” is not understood.`;
    endDate = end;
  } else {
    const term = parseDurationMonths(termText);
    if (term === "invalid") return `The AMC period “${termText}” is not understood. Write it like 1 year or 12 months.`;
    if (term === 0) return "The AMC period cannot be zero.";
    endDate = endOfTerm(startDate, term ?? 12);
  }
  if (endDate <= startDate) return "The AMC must end after it starts.";

  const amount = parseMoney(amountText);
  if (amount === "invalid") return `The AMC amount “${amountText}” is not understood.`;

  const visits = parseWholeNumber(visitsText);
  if (visits === "invalid" || (visits !== null && (visits < 1 || visits > 52))) {
    return "The AMC visits per year must be a whole number from 1 to 52.";
  }

  return { startDate, endDate, amount: amount ?? 0, visitsPerYear: visits ?? 2, coveredParts: parts || null };
}

/* ---------------------------------------------------------------------------------------------------------------
 * Columns of a sheet
 * ------------------------------------------------------------------------------------------------------------- */

export type InstalledField = keyof RawInstalledRow;

/** What each field is called on screen and what it holds, for the column picker and for the AI's instructions. */
export const INSTALLED_FIELDS: { field: InstalledField; label: string; meaning: string }[] = [
  { field: "customerName", label: "Customer / hotel name", meaning: "the name of the customer, company, hotel or site" },
  { field: "phone", label: "Phone", meaning: "the phone or mobile number" },
  { field: "email", label: "Email", meaning: "an email address" },
  { field: "address", label: "Address / city", meaning: "address, city, area or location of the site" },
  { field: "contactPerson", label: "Contact person", meaning: "the name of the person to contact at the site" },
  { field: "model", label: "Machine model", meaning: "the heat pump model or product name" },
  { field: "capacityKw", label: "Capacity (kW)", meaning: "the heating output capacity or size of the machine, in kW" },
  { field: "quantity", label: "Quantity", meaning: "how many machines or units were installed" },
  { field: "serials", label: "Serial number(s)", meaning: "the machine serial number or numbers (not a running row number)" },
  { field: "installedOn", label: "Installation date", meaning: "the date the machine was installed or commissioned" },
  { field: "warranty", label: "Warranty period", meaning: "the warranty period in years or months, for example 2 years" },
  { field: "warrantyEnds", label: "Warranty end date", meaning: "the date the warranty ends or expires" },
  { field: "amcStart", label: "AMC start date", meaning: "the date the annual maintenance contract (AMC) started" },
  { field: "amcEnd", label: "AMC end date", meaning: "the date the AMC ends or expires" },
  { field: "amcTerm", label: "AMC period", meaning: "the length of the AMC, in years or months" },
  { field: "amcAmount", label: "AMC charges (₹)", meaning: "the annual maintenance charges or AMC amount in rupees" },
  { field: "amcVisits", label: "AMC visits per year", meaning: "how many maintenance visits per year the AMC includes" },
  { field: "amcParts", label: "AMC covered parts", meaning: "the parts or services the AMC covers" },
  { field: "notes", label: "Notes", meaning: "remarks or notes about the machine or site" },
];

// Header names people commonly use, compared after lower-casing and dropping spaces and punctuation. A running
// "Sr. No." column is not a machine serial number, so those names are left out of `serials` on purpose.
const ALIASES: Record<InstalledField, string[]> = {
  customerName: ["customername", "customer", "client", "clientname", "hotel", "hotelname", "name", "party", "partyname", "company", "companyname", "site", "sitename", "propertyname", "property", "organisation", "organization"],
  phone: ["phone", "phoneno", "phonenumber", "mobile", "mobileno", "mobilenumber", "contactno", "contactnumber", "telephone", "tel", "whatsapp"],
  email: ["email", "emailid", "emailaddress", "mail"],
  address: ["address", "siteaddress", "city", "location", "place", "area", "town", "hotelcity", "sitelocation"],
  contactPerson: ["contactperson", "contactname", "personname", "contactpersonname", "concernedperson", "poc", "pocname", "incharge", "siteincharge"],
  model: ["model", "modelno", "modelname", "machine", "machinemodel", "product", "productname", "heatpump", "heatpumpmodel", "equipment", "unit", "unitmodel", "type", "machinetype"],
  capacityKw: ["capacity", "capacitykw", "kw", "outputkw", "outputcapacity", "heatingcapacity", "size", "machinesize", "outputkwcapacity", "capacitykwh"],
  quantity: ["qty", "quantity", "units", "noofunits", "numberofunits", "nos", "noofmachines", "numberofmachines", "noofheatpumps", "machines", "count", "totalunits"],
  serials: ["serialnumber", "serialnumbers", "serialno", "machineserialno", "machineserial", "unitserialno", "heatpumpserialno", "serialnoofmachine"],
  installedOn: ["installationdate", "installed", "installeddate", "installedon", "dateofinstallation", "commissioningdate", "commissioneddate", "dateofcommissioning", "installdate", "dateinstalled", "date", "handoverdate", "installation", "commissioned", "installedsince", "installedmonth"],
  warranty: ["warranty", "warrantyperiod", "warrantyyears", "warrantyyear", "warrantymonths", "warrantyperiodyears", "warrantyperiodmonths", "warrantyyrs", "warrantyduration"],
  warrantyEnds: ["warrantyend", "warrantyenddate", "warrantyexpiry", "warrantyexpirydate", "warrantyexpires", "warrantyvalidtill", "warrantyvaliduntil", "warrantytill", "warrantyuntil", "warrantyto", "warrantyendson", "warrantyexpireson"],
  amcStart: ["amcstart", "amcstartdate", "amcfrom", "amcdate", "amcstarted", "amcstarts", "amcstartson"],
  amcEnd: ["amcend", "amcenddate", "amcto", "amcexpiry", "amcexpirydate", "amcvalidtill", "amctill", "amcvaliduntil", "amcends", "amcendson"],
  amcTerm: ["amcperiod", "amcterm", "amcyears", "amcduration", "amcperiodyears", "amcmonths"],
  amcAmount: ["amcamount", "amccharges", "amcannualcharges", "amcvalue", "amcfee", "amcprice", "annualmaintenancecharges", "amccharge", "amcrate", "amcamt", "amcrupees", "maintenancecharges", "annualcharges"],
  amcVisits: ["amcvisits", "visitsperyear", "amcvisitsperyear", "noofvisits", "servicesperyear", "visits"],
  amcParts: ["amccoveredparts", "coveredparts", "amccoverage", "amcscope", "amcparts"],
  notes: ["notes", "note", "remarks", "remark", "comments", "comment"],
};

const normaliseHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const LABELS = Object.fromEntries(INSTALLED_FIELDS.map((f) => [f.field, f.label])) as Record<InstalledField, string>;

/** The columns whose heading is a name people commonly use, first match winning for each field. */
export function detectInstalledColumns(header: string[]): Map<InstalledField, number> {
  const columnOf = new Map<InstalledField, number>();
  header.forEach((cell, index) => {
    const name = normaliseHeader(cell);
    for (const [field, aliases] of Object.entries(ALIASES) as [InstalledField, string[]][]) {
      // The on-screen label of a field always counts too, so the downloadable template is always understood.
      if ((aliases.includes(name) || normaliseHeader(LABELS[field]) === name) && !columnOf.has(field)) columnOf.set(field, index);
    }
  });
  return columnOf;
}

export type InstalledColumnInfo = {
  index: number;
  heading: string;
  field: InstalledField | null;
  by: "heading" | "ai" | "you";
};

export function describeInstalledColumns(
  header: string[],
  columnOf: Map<InstalledField, number>,
  decidedBy: Map<number, "ai" | "you"> = new Map(),
): InstalledColumnInfo[] {
  const fieldAt = new Map<number, InstalledField>();
  for (const [field, index] of columnOf) fieldAt.set(index, field);
  return header.map((heading, index) => ({ index, heading: heading.trim(), field: fieldAt.get(index) ?? null, by: decidedBy.get(index) ?? "heading" }));
}

export type ParsedInstalled = {
  rows: InstalledRow[];
  problems: InstalledProblem[];
  /** Set when the file cannot be imported at all (empty, no header, too large). */
  fatal: string | null;
  /** Data rows in the file. */
  totalRows: number;
  columns: InstalledColumnInfo[];
};

const REQUIRED: { field: InstalledField; label: string }[] = [
  { field: "customerName", label: "customer name" },
  { field: "installedOn", label: "installation date" },
];

/** Reads a table of installed machines (a CSV or one sheet of an Excel file), keeping the good rows and describing each bad one. */
export function parseInstalledTable(
  table: string[][],
  today: string,
  options: { columns?: Map<InstalledField, number>; decidedBy?: Map<number, "ai" | "you"> } = {},
): ParsedInstalled {
  const none = { rows: [], problems: [], totalRows: 0, columns: [] as InstalledColumnInfo[] };
  if (table.length === 0) return { ...none, fatal: "The file is empty." };

  const [header, ...body] = table;
  const columnOf = options.columns ?? detectInstalledColumns(header);
  const columns = describeInstalledColumns(header, columnOf, options.decidedBy);

  const missing = REQUIRED.filter((r) => !columnOf.has(r.field)).map((r) => r.label);
  if (missing.length > 0) {
    return { ...none, columns, fatal: `The first row must be a header row with a ${missing.join(" and ")} column. Download the template to see the layout.` };
  }
  if (body.length === 0) return { ...none, columns, fatal: "The file has a header row but no machines." };
  if (body.length > MAX_INSTALLED_ROWS) {
    return { ...none, columns, totalRows: body.length, fatal: `The file has ${body.length} rows. Import at most ${MAX_INSTALLED_ROWS} at a time.` };
  }

  const rows: InstalledRow[] = [];
  const problems: InstalledProblem[] = [];
  let counted = 0;

  body.forEach((cells, index) => {
    if (!cells.some((c) => c.trim() !== "")) return;
    counted += 1;
    const line = index + 2;
    const raw = { ...EMPTY_RAW_ROW };
    for (const [field, col] of columnOf) raw[field] = (cells[col] ?? "").trim();
    const checked = checkInstalledRow(raw, line, today);
    if (checked.ok) rows.push(checked.row);
    else problems.push({ line, message: checked.message });
  });

  return { rows, problems, fatal: null, totalRows: counted, columns };
}

/** Reads an installed-machines sheet saved as CSV. */
export function parseInstalledCsv(text: string, today: string): ParsedInstalled {
  return parseInstalledTable(parseCsv(text), today);
}

/** The file offered for download: a header row and two example rows. */
export const INSTALLED_TEMPLATE: string[][] = [
  [
    "Customer / hotel name",
    "Address / city",
    "Phone",
    "Contact person",
    "Machine model",
    "Capacity (kW)",
    "Quantity",
    "Serial numbers",
    "Installation date",
    "Warranty",
    "AMC start date",
    "AMC period",
    "AMC charges (₹)",
    "AMC visits per year",
    "Notes",
  ],
  ["Sunrise Hotel, Pune", "Baner, Pune", "9800000001", "Mr. Shah", "Commercial Heat Pump 33 kW", "33", "2", "", "15/03/2023", "2 years", "15/03/2025", "1 year", "85000", "4", "Two machines on the roof"],
  ["Hotel Sample Residency", "Nashik", "", "", "Heat pump 21 kW", "21", "1", "SN-1001", "Jun 2021", "1 year", "", "", "", "", ""],
];

/**
 * A machine that was recorded by hand (an existing installation) rather than one that came through a sales order and
 * an installation job. Its model and customer can be corrected, because no other record depends on them.
 */
export function isRecordedMachine(machine: { salesOrderId: string | null; installationId: string | null }): boolean {
  return machine.salesOrderId === null && machine.installationId === null;
}

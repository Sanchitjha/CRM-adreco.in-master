import { z } from "zod";
import { parseCsv } from "@/lib/csv";

export const MAX_IMPORT_ROWS = 2000;

export type ImportRow = {
  /** Line in the file, counting the header as line 1, so people can find the row in their spreadsheet. */
  line: number;
  customerName: string;
  phone: string;
  email: string | null;
  address: string | null;
  productCategory: string | null;
  requirementNotes: string | null;
  budget: number | null;
  source: string | null;
  /** Email address of the salesperson who should own the lead, when the file has that column. */
  assignedTo: string | null;
};

export type ImportProblem = { line: number; message: string };

export type ParsedImport = {
  rows: ImportRow[];
  problems: ImportProblem[];
  /** Set when the file cannot be imported at all (empty, no header, too large). */
  fatal: string | null;
  totalRows: number;
};

type Field = Exclude<keyof ImportRow, "line" | "budget"> | "budget";

// Header names people commonly use, compared after lower-casing and dropping spaces and punctuation.
const FIELD_ALIASES: Record<Field, string[]> = {
  customerName: ["customername", "customer", "name", "client", "clientname", "company", "companyname", "party"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber", "whatsapp", "tel"],
  email: ["email", "emailaddress", "emailid", "mail"],
  address: ["address", "siteaddress", "location", "city"],
  productCategory: ["productcategory", "category", "product", "interest", "interestedin"],
  budget: ["budget", "value", "estimatedvalue", "amount", "dealvalue"],
  source: ["source", "leadsource", "channel", "origin"],
  requirementNotes: ["requirementnotes", "requirement", "requirements", "notes", "remarks", "comments", "description"],
  assignedTo: ["assignedto", "assignedtoemail", "owner", "owneremail", "leadowner", "salesrep", "salesperson", "assignee"],
};

const REQUIRED: { field: Field; label: string }[] = [
  { field: "customerName", label: "customer name" },
  { field: "phone", label: "phone" },
];

const emailSchema = z.string().email();

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "₹ 12,50,000", "Rs. 450000" and "4.5" all become numbers; anything else is rejected. */
export function parseBudget(raw: string): number | null | "invalid" {
  const cleaned = raw.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : "invalid";
}

/** Reads a lead spreadsheet saved as CSV, keeping the good rows and describing each bad one. */
export function parseLeadCsv(text: string): ParsedImport {
  const table = parseCsv(text);
  const empty = { rows: [], problems: [], totalRows: 0 };
  if (table.length === 0) return { ...empty, fatal: "The file is empty." };

  const [header, ...body] = table;
  const columnOf = new Map<Field, number>();
  header.forEach((cell, index) => {
    const name = normaliseHeader(cell);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [Field, string[]][]) {
      if (aliases.includes(name) && !columnOf.has(field)) columnOf.set(field, index);
    }
  });

  const missing = REQUIRED.filter((r) => !columnOf.has(r.field)).map((r) => r.label);
  if (missing.length > 0) {
    return {
      ...empty,
      fatal: `The first row must be a header row with a ${missing.join(" and ")} column. Download the template to see the layout.`,
    };
  }
  if (body.length === 0) return { ...empty, fatal: "The file has a header row but no leads." };
  if (body.length > MAX_IMPORT_ROWS) {
    return { ...empty, totalRows: body.length, fatal: `The file has ${body.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.` };
  }

  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];

  body.forEach((cells, index) => {
    const line = index + 2;
    const cell = (field: Field) => (columnOf.has(field) ? (cells[columnOf.get(field)!] ?? "").trim() : "");

    const customerName = cell("customerName");
    const phone = cell("phone");
    const email = cell("email");
    const budget = parseBudget(cell("budget"));

    const problem =
      customerName === "" ? "Customer name is missing."
      : customerName.length > 200 ? "Customer name is too long."
      : phone.replace(/\D/g, "").length < 7 ? "Phone number is missing or too short."
      : email !== "" && !emailSchema.safeParse(email).success ? `“${email}” is not a valid email address.`
      : budget === "invalid" ? `“${cell("budget")}” is not a valid budget.`
      : null;

    if (problem) {
      problems.push({ line, message: problem });
      return;
    }

    rows.push({
      line,
      customerName,
      phone,
      email: email || null,
      address: cell("address") || null,
      productCategory: cell("productCategory") || null,
      requirementNotes: cell("requirementNotes") || null,
      budget: budget as number | null,
      source: cell("source") || null,
      assignedTo: cell("assignedTo").toLowerCase() || null,
    });
  });

  return { rows, problems, fatal: null, totalRows: body.length };
}

/** The sample file offered for download: the headers we expect and one example row. */
export const IMPORT_TEMPLATE: string[][] = [
  ["Customer name", "Phone", "Email", "Address", "Product category", "Budget", "Source", "Requirement notes", "Owner email"],
  ["Hotel Sai Residency", "+91 98765 43210", "purchase@example.com", "Pune, Maharashtra", "Commercial Heat Pump", "1250000", "Website enquiry", "40 kW hot water for 60 rooms", ""],
];

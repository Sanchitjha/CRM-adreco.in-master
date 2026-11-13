import { z } from "zod";
import { parseCsv } from "@/lib/csv";
import { extractEmail, firstAmount, guessCategory, parseFlexibleDate, splitPeople, type Person } from "@/lib/prospect-parse";

/** Rows in one sheet. A few months of a sales team's sheet is a few thousand rows at most. */
export const MAX_IMPORT_ROWS = 20000;

/** The largest file accepted. Next.js is told to let an upload this big through (see next.config.ts). */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

/** Prospects saved per request, so a big file is imported in steps that each finish in a few seconds. */
export const IMPORT_BATCH_SIZE = 250;

export type ImportContact = {
  /** Line in the file, counting the header as line 1. */
  line: number;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
};

export type ImportStatus = "NEW" | "CONTACTED" | "FOLLOW_UP" | "QUOTED";

export type ImportRow = {
  /** Line in the file, counting the header as line 1, so people can find the row in their spreadsheet. */
  line: number;
  customerName: string;
  /** Who the main contact is on the project, when the name carries a role such as "(Site Incharge)". */
  contactRole: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  productCategory: string | null;
  requirementNotes: string | null;
  budget: number | null;
  source: string | null;
  referredBy: string | null;
  /** Email address of the salesperson who should own the lead, when the file has that column. */
  assignedTo: string | null;
  status: ImportStatus;
  /** "YYYY-MM-DD" from a Date column, used as the day the enquiry arrived. */
  enquiryDate: string | null;
  /** Other people on the same prospect: the rows under it that have no serial number. */
  contacts: ImportContact[];
  /** What has happened so far and when to call next, from the Remarks, Follow-up and Quote columns. */
  followUp: { note: string; nextDate: string | null } | null;
};

export type ImportProblem = { line: number; message: string };

/** How one column of the sheet was understood. */
export type ColumnInfo = {
  /** Position in the sheet, starting at 0. */
  index: number;
  /** The heading as typed in the sheet. */
  heading: string;
  /** The CRM field the column feeds, or null when it is ignored. */
  field: ImportField | null;
  /** Found from the heading itself, suggested by the AI, or chosen by a person. */
  by: "heading" | "ai" | "you";
};

export type ParsedImport = {
  rows: ImportRow[];
  problems: ImportProblem[];
  /** Set when the file cannot be imported at all (empty, no header, too large). */
  fatal: string | null;
  /** Data rows in the file, including contact rows. */
  totalRows: number;
  /** The columns as they were understood, so a person can see and correct them. */
  columns: ColumnInfo[];
};

export type ImportField =
  | "customerName"
  | "phone"
  | "email"
  | "address"
  | "productCategory"
  | "requirementNotes"
  | "budget"
  | "source"
  | "assignedTo"
  | "contactRole"
  | "referredBy"
  | "serial"
  | "followUpDate"
  | "remarks"
  | "quote"
  | "enquiryDate";

type Field = ImportField;

/** What each field is called on screen and what it holds, for the column picker and for the AI's instructions. */
export const IMPORT_FIELDS: { field: ImportField; label: string; meaning: string }[] = [
  { field: "customerName", label: "Customer name", meaning: "the name of the customer, company or contact person" },
  { field: "phone", label: "Phone", meaning: "the phone or mobile number" },
  { field: "email", label: "Email", meaning: "an email address" },
  { field: "address", label: "Address / location", meaning: "address, city, area or site location" },
  { field: "productCategory", label: "Product category", meaning: "the product or category the customer is interested in" },
  { field: "requirementNotes", label: "Requirement / project", meaning: "the project or requirement description, size, notes" },
  { field: "budget", label: "Budget", meaning: "budget, deal value or amount" },
  { field: "source", label: "Source", meaning: "where the enquiry came from (website, referral, exhibition...)" },
  { field: "assignedTo", label: "Owner (salesperson)", meaning: "the salesperson, executive or owner handling the lead" },
  { field: "contactRole", label: "Contact role", meaning: "the person's role, designation or position" },
  { field: "referredBy", label: "Referred by", meaning: "who referred or introduced the customer" },
  { field: "serial", label: "Serial number", meaning: "a running serial number (Sr. No.) that starts each prospect" },
  { field: "followUpDate", label: "Next follow-up date", meaning: "the date of the next follow-up or call" },
  { field: "remarks", label: "Remarks / call notes", meaning: "remarks, call history or follow-up notes" },
  { field: "quote", label: "Quote", meaning: "the quotation given: capacity and price" },
  { field: "enquiryDate", label: "Enquiry date", meaning: "the date the enquiry arrived or the lead was created" },
];

// Header names people commonly use, compared after lower-casing and dropping spaces and punctuation.
const FIELD_ALIASES: Record<Field, string[]> = {
  customerName: ["customername", "customer", "name", "client", "clientname", "company", "companyname", "party", "contactperson", "contactname"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactno", "contactnumber", "whatsapp", "tel"],
  email: ["email", "emailaddress", "emailid", "mail"],
  address: ["address", "siteaddress", "location", "city", "area", "site", "companynamelocation", "companylocation"],
  productCategory: ["productcategory", "category", "product", "interest", "interestedin"],
  budget: ["budget", "value", "estimatedvalue", "amount", "dealvalue"],
  source: ["source", "leadsource", "channel", "origin"],
  requirementNotes: ["requirementnotes", "requirement", "requirements", "notes", "comments", "description", "project", "projectdetails", "projectdescription", "projecttype"],
  assignedTo: [
    "assignedto", "assignedtoemail", "owner", "owneremail", "leadowner", "salesrep", "salesperson", "assignee", "executive",
    "salesexecutive", "handledby", "attendedby", "salesman", "responsible", "responsibleperson", "allottedto", "allocatedto",
    "assignedperson",
  ],
  contactRole: ["role", "contactrole", "designation", "position", "title"],
  referredBy: ["referredby", "referral", "reference", "refby"],
  serial: ["srno", "sno", "slno", "serialno", "serial", "sr"],
  followUpDate: ["followup", "followupdate", "nextfollowup", "nextfollowupdate", "nextcalldate"],
  remarks: ["remarks", "remark", "callnotes", "calllog", "followupnotes", "history"],
  quote: ["quote", "quotation", "quoted", "quotegiven", "quotedetails", "quotedprice", "quoteamount"],
  enquiryDate: ["date", "enquirydate", "inquirydate", "leaddate", "createddate", "createdon", "dateofenquiry", "dateofinquiry", "entrydate", "receiveddate", "enquiryon"],
};

/** The columns whose heading is a name people commonly use, first match winning for each field. */
export function detectColumns(header: string[]): Map<ImportField, number> {
  const columnOf = new Map<Field, number>();
  header.forEach((cell, index) => {
    const name = normaliseHeader(cell);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [Field, string[]][]) {
      if (aliases.includes(name) && !columnOf.has(field)) columnOf.set(field, index);
    }
  });
  return columnOf;
}

/** Every heading of the sheet with the field it feeds, for showing to a person. `by` says who decided each one. */
export function describeColumns(
  header: string[],
  columnOf: Map<ImportField, number>,
  decidedBy: Map<number, "ai" | "you"> = new Map(),
): ColumnInfo[] {
  const fieldAt = new Map<number, ImportField>();
  for (const [field, index] of columnOf) fieldAt.set(index, field);
  return header.map((heading, index) => ({
    index,
    heading: heading.trim(),
    field: fieldAt.get(index) ?? null,
    by: decidedBy.get(index) ?? "heading",
  }));
}

const REQUIRED: { field: Field; label: string }[] = [
  { field: "customerName", label: "customer name" },
  { field: "phone", label: "phone" },
];

const emailSchema = z.string().email();

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const digitCount = (value: string) => value.replace(/\D/g, "").length;

/** People typed into the same cell as the row's first person share that row, so they get a name and role but no phone or email. */
const alsoOnRow = (line: number, people: Person[]): ImportContact[] =>
  people.map((person) => ({ line, name: person.name, role: person.role, phone: null, email: null }));

/** "₹ 12,50,000", "Rs. 450000" and "4.5" all become numbers; anything else is rejected. */
export function parseBudget(raw: string): number | null | "invalid" {
  const cleaned = raw.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : "invalid";
}

/** Reads a lead spreadsheet saved as CSV. */
export function parseLeadCsv(text: string): ParsedImport {
  return parseLeadTable(parseCsv(text));
}

type OpenProspect = { row: ImportRow; remarks: string[]; dates: string[]; quote: string | null };

/**
 * Reads a table of leads (a CSV or the first sheet of an Excel file), keeping the good rows and describing each
 * bad one.
 *
 * When the sheet has a serial-number column, as sales teams' prospect sheets often do, a row with no serial number
 * is another person on the prospect above it (the site in-charge, the contractor, the plumber) rather than a new
 * lead, and is kept as a contact of that prospect.
 */
export function parseLeadTable(
  table: string[][],
  options: {
    /** The columns to use instead of working them out from the headings (after a person or the AI has chosen them). */
    columns?: Map<ImportField, number>;
    /** Which of those were chosen by the AI or by a person, for the report. */
    decidedBy?: Map<number, "ai" | "you">;
  } = {},
): ParsedImport {
  const none = { rows: [], problems: [], totalRows: 0, columns: [] as ColumnInfo[] };
  if (table.length === 0) return { ...none, fatal: "The file is empty." };

  const [header, ...body] = table;
  const columnOf = options.columns ?? detectColumns(header);
  const empty = { ...none, columns: describeColumns(header, columnOf, options.decidedBy) };

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

  const grouped = columnOf.has("serial");
  const hasHistory = columnOf.has("followUpDate") || columnOf.has("remarks") || columnOf.has("quote");

  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  let open: OpenProspect | null = null;
  let skipped: { problem: ImportProblem; base: string; contactRows: number } | null = null;

  const cellOf = (cells: string[], field: Field) => (columnOf.has(field) ? (cells[columnOf.get(field)!] ?? "").trim() : "");

  const closeProspect = () => {
    if (!open) return;
    const { row, remarks, dates, quote } = open;
    const nextDate = dates.length > 0 ? [...dates].sort()[0] : null;
    const noteParts = [...remarks, ...(quote ? [`Quote given: ${quote}`] : [])];
    row.followUp = noteParts.length > 0 || nextDate ? { note: noteParts.join("\n") || "Follow-up date from the imported sheet.", nextDate } : null;
    if (row.budget === null && quote) row.budget = firstAmount(quote);
    row.productCategory ??= guessCategory(row.requirementNotes ?? "") ?? (quote ? guessCategory(quote) : null) ?? guessCategory(remarks.join(" "));
    row.status = hasHistory ? (quote ? "QUOTED" : nextDate ? "FOLLOW_UP" : remarks.length > 0 ? "CONTACTED" : "NEW") : "NEW";
    rows.push(row);
    open = null;
  };

  body.forEach((cells, index) => {
    const line = index + 2;
    const isContactRow = grouped && cellOf(cells, "serial") === "" && (open !== null || skipped !== null);

    if (isContactRow) {
      if (skipped) {
        skipped.contactRows += 1;
        const n = skipped.contactRows;
        skipped.problem.message = `${skipped.base} The ${n} row${n === 1 ? "" : "s"} listed under it ${n === 1 ? "was" : "were"} skipped too.`;
        return;
      }

      const [{ name, role }, ...others] = splitPeople(cellOf(cells, "customerName"));
      const phoneText = cellOf(cells, "phone");
      const followRaw = cellOf(cells, "followUpDate");
      const followDate = followRaw ? parseFlexibleDate(followRaw) : null;
      const problem =
        name === "" ? "Contact has no name."
        : followRaw !== "" && followDate === null ? `“${followRaw}” is not a valid follow-up date.`
        : null;
      if (problem) {
        problems.push({ line, message: problem });
        return;
      }

      const prospect = open!;
      const projectText = cellOf(cells, "requirementNotes");
      const phone = digitCount(phoneText) >= 7 ? phoneText : null;
      const known = [prospect.row.phone, ...prospect.row.contacts.map((c) => c.phone ?? "")].map((p) => p.replace(/\D/g, "").slice(-10));
      if (phone && known.includes(phone.replace(/\D/g, "").slice(-10))) return; // the same person listed twice

      const emailCell = cellOf(cells, "email");
      prospect.row.contacts.push({
        line,
        name,
        role: cellOf(cells, "contactRole") || role,
        phone,
        email: (emailSchema.safeParse(emailCell).success ? emailCell : null) ?? extractEmail(projectText),
      });
      prospect.row.contacts.push(...alsoOnRow(line, others));
      // A contact's row often carries the project details too; lend them to the prospect if it has none.
      prospect.row.address ??= cellOf(cells, "address") || null;
      prospect.row.requirementNotes ??= projectText || null;
      prospect.quote ??= cellOf(cells, "quote") || null;
      if (followDate) prospect.dates.push(followDate);
      const remarks = cellOf(cells, "remarks");
      if (remarks) prospect.remarks.push(`${name}: ${remarks}`);
      return;
    }

    closeProspect();
    skipped = null;

    const [{ name: customerName, role }, ...others] = splitPeople(cellOf(cells, "customerName"));
    const phone = cellOf(cells, "phone");
    const emailCell = cellOf(cells, "email");
    const projectText = cellOf(cells, "requirementNotes");
    const address = cellOf(cells, "address");
    const budget = parseBudget(cellOf(cells, "budget"));
    const followRaw = cellOf(cells, "followUpDate");
    const nextDate = followRaw ? parseFlexibleDate(followRaw) : null;
    const enquiryRaw = cellOf(cells, "enquiryDate");
    const enquiryDate = enquiryRaw ? parseFlexibleDate(enquiryRaw) : null;

    const problem =
      customerName === "" ? "Customer name is missing."
      : customerName.length > 200 ? "Customer name is too long."
      : digitCount(phone) < 7 ? "Phone number is missing or too short."
      : emailCell !== "" && !emailSchema.safeParse(emailCell).success ? `“${emailCell}” is not a valid email address.`
      : budget === "invalid" ? `“${cellOf(cells, "budget")}” is not a valid budget.`
      : followRaw !== "" && nextDate === null ? `“${followRaw}” is not a valid follow-up date.`
      : enquiryRaw !== "" && enquiryDate === null ? `“${enquiryRaw}” is not a valid date.`
      : null;

    if (problem) {
      const entry = { line, message: problem };
      problems.push(entry);
      if (grouped) skipped = { problem: entry, base: problem, contactRows: 0 };
      return;
    }

    const remarks = cellOf(cells, "remarks");
    open = {
      row: {
        line,
        customerName,
        contactRole: cellOf(cells, "contactRole") || role,
        phone,
        // Emails are often typed into the project or address column, so look there when there is no Email column value.
        email: emailCell || extractEmail(projectText) || extractEmail(address) || null,
        address: address || null,
        productCategory: cellOf(cells, "productCategory") || null,
        requirementNotes: projectText || null,
        budget: budget as number | null,
        source: cellOf(cells, "source") || null,
        referredBy: cellOf(cells, "referredBy") || null,
        assignedTo: cellOf(cells, "assignedTo").toLowerCase() || null,
        status: "NEW",
        enquiryDate,
        contacts: alsoOnRow(line, others),
        followUp: null,
      },
      remarks: remarks ? [remarks] : [],
      dates: nextDate ? [nextDate] : [],
      quote: cellOf(cells, "quote") || null,
    };
  });
  closeProspect();

  return { rows, problems, fatal: null, totalRows: body.length, columns: empty.columns };
}

/** The sample file offered for download: the headers we expect and one example row. */
export const IMPORT_TEMPLATE: string[][] = [
  [
    "Customer name", "Phone", "Email", "Address", "Product category", "Budget", "Source", "Requirement notes", "Owner email",
    "Contact role", "Next follow-up", "Remarks", "Quote given",
  ],
  [
    "Hotel Sai Residency", "+91 98765 43210", "purchase@example.com", "Pune, Maharashtra", "Commercial Heat Pump", "1250000", "Website enquiry",
    "40 kW hot water for 60 rooms", "", "Owner", "2027-01-15", "Called twice, wants a site visit", "",
  ],
];

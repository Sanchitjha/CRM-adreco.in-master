import { z } from "zod";
import { parseCsv } from "@/lib/csv";
import { extractEmail, firstAmount, guessCategory, parseFlexibleDate, splitNameAndRole } from "@/lib/prospect-parse";

export const MAX_IMPORT_ROWS = 2000;

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

export type ParsedImport = {
  rows: ImportRow[];
  problems: ImportProblem[];
  /** Set when the file cannot be imported at all (empty, no header, too large). */
  fatal: string | null;
  /** Data rows in the file, including contact rows. */
  totalRows: number;
};

type Field =
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
  assignedTo: ["assignedto", "assignedtoemail", "owner", "owneremail", "leadowner", "salesrep", "salesperson", "assignee"],
  contactRole: ["role", "contactrole", "designation", "position", "title"],
  referredBy: ["referredby", "referral", "reference", "refby"],
  serial: ["srno", "sno", "slno", "serialno", "serial", "sr"],
  followUpDate: ["followup", "followupdate", "nextfollowup", "nextfollowupdate", "nextcalldate"],
  remarks: ["remarks", "remark", "callnotes", "calllog", "followupnotes", "history"],
  quote: ["quote", "quotation", "quoted", "quotegiven", "quotedetails", "quotedprice", "quoteamount"],
  enquiryDate: ["date", "enquirydate", "inquirydate", "leaddate", "createddate", "createdon"],
};

const REQUIRED: { field: Field; label: string }[] = [
  { field: "customerName", label: "customer name" },
  { field: "phone", label: "phone" },
];

const emailSchema = z.string().email();

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const digitCount = (value: string) => value.replace(/\D/g, "").length;

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
export function parseLeadTable(table: string[][]): ParsedImport {
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

      const { name, role } = splitNameAndRole(cellOf(cells, "customerName"));
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

    const { name: customerName, role } = splitNameAndRole(cellOf(cells, "customerName"));
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
        contacts: [],
        followUp: null,
      },
      remarks: remarks ? [remarks] : [],
      dates: nextDate ? [nextDate] : [],
      quote: cellOf(cells, "quote") || null,
    };
  });
  closeProspect();

  return { rows, problems, fatal: null, totalRows: body.length };
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

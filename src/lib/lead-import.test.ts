import { describe, expect, it } from "vitest";
import { IMPORT_TEMPLATE, MAX_IMPORT_ROWS, parseBudget, parseLeadCsv, parseLeadTable } from "@/lib/lead-import";
import { toCsv } from "@/lib/csv";

describe("parseBudget", () => {
  it("reads plain and formatted amounts", () => {
    expect(parseBudget("450000")).toBe(450000);
    expect(parseBudget("₹ 12,50,000")).toBe(1250000);
    expect(parseBudget("Rs. 4.5")).toBe(4.5);
  });

  it("treats blank as no budget and rubbish as invalid", () => {
    expect(parseBudget("")).toBeNull();
    expect(parseBudget("lots")).toBe("invalid");
    expect(parseBudget("-5")).toBe("invalid");
  });
});

describe("parseLeadCsv", () => {
  it("maps common header names and keeps the rows", () => {
    const csv = "Name,Mobile,E-mail,City,Category,Value,Lead Source,Notes\nHotel Sai,98765 43210,a@b.co,Pune,EVI Heat Pump,\"₹ 5,00,000\",Referral,Needs 30 kW";
    const out = parseLeadCsv(csv);
    expect(out.fatal).toBeNull();
    expect(out.problems).toEqual([]);
    expect(out.rows).toEqual([
      {
        line: 2,
        customerName: "Hotel Sai",
        contactRole: null,
        phone: "98765 43210",
        email: "a@b.co",
        address: "Pune",
        productCategory: "EVI Heat Pump",
        requirementNotes: "Needs 30 kW",
        budget: 500000,
        source: "Referral",
        referredBy: null,
        assignedTo: null,
        status: "NEW",
        enquiryDate: null,
        contacts: [],
        followUp: null,
      },
    ]);
  });

  it("reports bad rows with their line numbers and keeps the good ones", () => {
    const csv = ["customer,phone,email,budget", "Raj,9876543210,,", ",9876543211,,", "Sita,123,,", "Om,9876543212,not-an-email,", "Lal,9876543213,,lots"].join("\n");
    const out = parseLeadCsv(csv);
    expect(out.rows.map((r) => r.customerName)).toEqual(["Raj"]);
    expect(out.problems).toEqual([
      { line: 3, message: "Customer name is missing." },
      { line: 4, message: "Phone number is missing or too short." },
      { line: 5, message: "“not-an-email” is not a valid email address." },
      { line: 6, message: "“lots” is not a valid budget." },
    ]);
    expect(out.totalRows).toBe(5);
  });

  it("needs a customer name and a phone column", () => {
    expect(parseLeadCsv("name,city\nRaj,Pune").fatal).toMatch(/phone column/);
    expect(parseLeadCsv("city,notes\nPune,x").fatal).toMatch(/customer name and phone column/);
  });

  it("rejects empty files and header-only files", () => {
    expect(parseLeadCsv("").fatal).toBe("The file is empty.");
    expect(parseLeadCsv("name,phone\n").fatal).toBe("The file has a header row but no leads.");
  });

  it("refuses files with too many rows", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Customer ${i},98765${String(i).padStart(5, "0")}`);
    expect(parseLeadCsv(["name,phone", ...rows].join("\n")).fatal).toMatch(/at most 2000/);
  });

  it("keeps non-English names intact and lower-cases the owner email", () => {
    const out = parseLeadCsv("customer,mobile,owner\nराजेश कुमार,9876543210,Sales@Adreco.IN");
    expect(out.rows[0].customerName).toBe("राजेश कुमार");
    expect(out.rows[0].assignedTo).toBe("sales@adreco.in");
  });

  it("recognises every column of the downloadable template", () => {
    const header = IMPORT_TEMPLATE[0];
    const row = [
      "Hotel Sai", "9876543210", "a@b.co", "Pune", "EVI Heat Pump", "100000", "Referral", "Needs 30 kW", "Sales@Adreco.in",
      "Owner", "15/01/2027", "Called twice", "7kW, 185000/-",
    ];
    const out = parseLeadCsv(toCsv([header, row]));
    expect(out.problems).toEqual([]);
    expect(out.rows[0]).toMatchObject({
      customerName: "Hotel Sai",
      contactRole: "Owner",
      phone: "9876543210",
      email: "a@b.co",
      address: "Pune",
      productCategory: "EVI Heat Pump",
      budget: 100000,
      source: "Referral",
      requirementNotes: "Needs 30 kW",
      assignedTo: "sales@adreco.in",
      status: "QUOTED",
      followUp: { note: "Called twice\nQuote given: 7kW, 185000/-", nextDate: "2027-01-15" },
    });
  });

  it("accepts the downloadable template as is", () => {
    const out = parseLeadCsv(toCsv(IMPORT_TEMPLATE));
    expect(out.fatal).toBeNull();
    expect(out.problems).toEqual([]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].phone).toBe("+91 98765 43210");
    expect(out.rows[0].followUp?.nextDate).toBe("2027-01-15");
  });

  it("turns Remarks into a follow-up note and a Date column into the enquiry date", () => {
    const out = parseLeadCsv("Date,Name,Phone,Remarks\n05/03/2026,Raj,9876543210,Sent details");
    expect(out.rows[0]).toMatchObject({ enquiryDate: "2026-03-05", status: "CONTACTED", followUp: { note: "Sent details", nextDate: null } });
  });

  it("rejects a follow-up date it cannot read", () => {
    const out = parseLeadCsv("Name,Phone,Follow-up\nRaj,9876543210,after 20 days");
    expect(out.rows).toEqual([]);
    expect(out.problems).toEqual([{ line: 2, message: "“after 20 days” is not a valid follow-up date." }]);
  });
});

// The layout of a typical sales team's prospect sheet: a serial number on the first row of each prospect, and the
// rows beneath it without one being other people on the same project. All the data here is made up.
const PROSPECT_HEADER = ["Date", "Sr.No.", "Contact No.", "Name", "Company Name/Location", "Project", "Follow-up", "Remarks", "Quote"];

describe("parseLeadTable with a prospect sheet", () => {
  const table = [
    PROSPECT_HEADER,
    ["", "1", "9000000001", "Ms. Asha Rao", "Sector 8, Chd", "10 x 15 x 4 Pool Size", "", "Pool at an early stage", "33kW Heat Pump, 375000/-"],
    ["", "", "9000000002", "Narayan (Site Incharge)", "Sector 8, Chd", "", "", "", ""],
    ["", "2", "9000000003", "Amar", "Gangtok", "300 L Dom", "2026-11-18", "Delayed, call after 20 days", "300 L 165000/-"],
    ["", "3", "9000000004", "Mr. Raj Mittal (Partner)", "Hotel Near Phase 1", "45 Rooms Hotel", "2026-11-29", "New construction", ""],
    ["", "", "9000000005", "Mr. Yogesh Mittal", "", "", "2026-11-10", "No reply 10/9", ""],
    ["", "", "9000000006", "Sarwan (Plumber)", "", "", "", "Call on 23/9", ""],
    ["", "4", "9000000007", "Mr. Sam (Owner)", "Zirakpur", "manager@example.com", "", "", ""],
  ];
  const out = parseLeadTable(table);

  it("keeps each numbered row as a prospect and the rows under it as its contacts", () => {
    expect(out.fatal).toBeNull();
    expect(out.problems).toEqual([]);
    expect(out.totalRows).toBe(7);
    expect(out.rows.map((r) => r.customerName)).toEqual(["Ms. Asha Rao", "Amar", "Mr. Raj Mittal", "Mr. Sam"]);
    expect(out.rows.map((r) => r.contacts.length)).toEqual([1, 0, 2, 0]);
    expect(out.rows[0].contacts[0]).toEqual({ line: 3, name: "Narayan", role: "Site in-charge", phone: "9000000002", email: null });
  });

  it("takes the role out of the name and keeps the location as the address", () => {
    expect(out.rows[2]).toMatchObject({ customerName: "Mr. Raj Mittal", contactRole: "Partner", address: "Hotel Near Phase 1" });
    expect(out.rows[2].contacts.map((c) => [c.name, c.role])).toEqual([["Mr. Yogesh Mittal", null], ["Sarwan", "Plumber"]]);
  });

  it("works out the application, the price and where the prospect stands", () => {
    expect(out.rows.map((r) => r.productCategory)).toEqual(["Swimming Pool Heat Pump", "Domestic Heat Pump", "Commercial Heat Pump", null]);
    expect(out.rows.map((r) => r.budget)).toEqual([375000, 165000, null, null]);
    expect(out.rows.map((r) => r.status)).toEqual(["QUOTED", "QUOTED", "FOLLOW_UP", "NEW"]);
  });

  it("builds one follow-up from the remarks, the quote and the earliest follow-up date in the group", () => {
    expect(out.rows[0].followUp).toEqual({ note: "Pool at an early stage\nQuote given: 33kW Heat Pump, 375000/-", nextDate: null });
    expect(out.rows[1].followUp?.nextDate).toBe("2026-11-18");
    expect(out.rows[2].followUp).toEqual({
      note: "New construction\nMr. Yogesh Mittal: No reply 10/9\nSarwan: Call on 23/9",
      nextDate: "2026-11-10",
    });
    expect(out.rows[3].followUp).toBeNull();
  });

  it("finds an email typed into the project column", () => {
    expect(out.rows[3].email).toBe("manager@example.com");
  });

  it("skips the contact rows of a prospect it cannot import, rather than giving them to the one above", () => {
    const bad = parseLeadTable([
      PROSPECT_HEADER,
      ["", "1", "9000000001", "Ms. Asha Rao", "", "", "", "", ""],
      ["", "2", "12", "Mr. Bad Number", "", "", "", "", ""],
      ["", "", "9000000008", "Helper (Site Incharge)", "", "", "", "", ""],
      ["", "", "9000000009", "Another Helper", "", "", "", "", ""],
    ]);
    expect(bad.rows.map((r) => r.customerName)).toEqual(["Ms. Asha Rao"]);
    expect(bad.rows[0].contacts).toEqual([]);
    expect(bad.problems).toEqual([{ line: 3, message: "Phone number is missing or too short. The 2 rows listed under it were skipped too." }]);
  });

  it("ignores a contact who repeats the prospect's own number and treats a first unnumbered row as a prospect", () => {
    const repeated = parseLeadTable([
      PROSPECT_HEADER,
      ["", "", "9000000001", "Ms. Asha Rao", "", "", "", "", ""],
      ["", "", "+91 90000 00001", "Asha again (Owner)", "", "", "", "", ""],
    ]);
    expect(repeated.rows).toHaveLength(1);
    expect(repeated.rows[0].contacts).toEqual([]);
  });

  it("treats every row as its own lead when the sheet has no serial number column", () => {
    const flat = parseLeadTable([["Name", "Phone"], ["Raj", "9000000001"], ["", ""], ["Sita", "9000000002"]]);
    expect(flat.rows.map((r) => r.customerName)).toEqual(["Raj", "Sita"]);
  });
});

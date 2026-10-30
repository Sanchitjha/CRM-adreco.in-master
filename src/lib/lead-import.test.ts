import { describe, expect, it } from "vitest";
import { IMPORT_TEMPLATE, MAX_IMPORT_ROWS, parseBudget, parseLeadCsv } from "@/lib/lead-import";
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
    const csv = "Name,Mobile,E-mail,City,Category,Value,Lead Source,Remarks\nHotel Sai,98765 43210,a@b.co,Pune,EVI Heat Pump,\"₹ 5,00,000\",Referral,Needs 30 kW";
    const out = parseLeadCsv(csv);
    expect(out.fatal).toBeNull();
    expect(out.problems).toEqual([]);
    expect(out.rows).toEqual([
      {
        line: 2,
        customerName: "Hotel Sai",
        phone: "98765 43210",
        email: "a@b.co",
        address: "Pune",
        productCategory: "EVI Heat Pump",
        requirementNotes: "Needs 30 kW",
        budget: 500000,
        source: "Referral",
        assignedTo: null,
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
    const row = ["Hotel Sai", "9876543210", "a@b.co", "Pune", "EVI Heat Pump", "100000", "Referral", "Needs 30 kW", "Sales@Adreco.in"];
    const out = parseLeadCsv(toCsv([header, row]));
    expect(out.problems).toEqual([]);
    expect(out.rows[0]).toMatchObject({
      customerName: "Hotel Sai",
      phone: "9876543210",
      email: "a@b.co",
      address: "Pune",
      productCategory: "EVI Heat Pump",
      budget: 100000,
      source: "Referral",
      requirementNotes: "Needs 30 kW",
      assignedTo: "sales@adreco.in",
    });
  });

  it("accepts the downloadable template as is", () => {
    const out = parseLeadCsv(toCsv(IMPORT_TEMPLATE));
    expect(out.fatal).toBeNull();
    expect(out.problems).toEqual([]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].phone).toBe("+91 98765 43210");
  });
});

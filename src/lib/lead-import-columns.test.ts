import { describe, expect, it } from "vitest";
import { describeColumns, detectColumns, parseLeadTable, type ImportField } from "./lead-import";

describe("detectColumns", () => {
  it("finds the usual headings, ignoring case, spaces and punctuation", () => {
    const map = detectColumns(["Sr. No.", "Customer Name", "Phone No", "E-mail", "Remarks"]);
    expect(map.get("serial")).toBe(0);
    expect(map.get("customerName")).toBe(1);
    expect(map.get("email")).toBe(3);
    expect(map.get("remarks")).toBe(4);
  });

  it("knows other names for the salesperson and the enquiry date", () => {
    const map = detectColumns(["Party", "Mobile", "Sales Executive", "Date of Enquiry"]);
    expect(map.get("assignedTo")).toBe(2);
    expect(map.get("enquiryDate")).toBe(3);
  });

  it("gives each field to the first column that matches", () => {
    expect(detectColumns(["Name", "Client"]).get("customerName")).toBe(0);
  });
});

describe("describeColumns", () => {
  it("lists every heading with the field it feeds and who decided", () => {
    const columns = new Map<ImportField, number>([["customerName", 0], ["phone", 2]]);
    const info = describeColumns(["Party", "Gender", "Mob"], columns, new Map([[2, "ai"]]));
    expect(info).toEqual([
      { index: 0, heading: "Party", field: "customerName", by: "heading" },
      { index: 1, heading: "Gender", field: null, by: "heading" },
      { index: 2, heading: "Mob", field: "phone", by: "ai" },
    ]);
  });
});

describe("parseLeadTable with chosen columns", () => {
  const table = [
    ["Party", "Mob", "Executive", "Entry date"],
    ["Hotel Sai", "98765 43210", "Asha", "2026-09-05"],
    ["Mehta & Sons", "98111 22233", "ravi", "2026-10-20"],
  ];

  it("cannot import a sheet whose phone heading is unusual, but still describes the columns", () => {
    const parsed = parseLeadTable(table);
    expect(parsed.fatal).toContain("phone");
    expect(parsed.columns.map((c) => c.field)).toEqual(["customerName", null, "assignedTo", "enquiryDate"]);
  });

  it("imports it once the phone column is chosen", () => {
    const columns = detectColumns(table[0]);
    columns.set("phone", 1);
    const parsed = parseLeadTable(table, { columns, decidedBy: new Map([[1, "you"]]) });

    expect(parsed.fatal).toBeNull();
    expect(parsed.rows.map((r) => r.customerName)).toEqual(["Hotel Sai", "Mehta & Sons"]);
    expect(parsed.rows.map((r) => r.assignedTo)).toEqual(["asha", "ravi"]);
    expect(parsed.rows.map((r) => r.enquiryDate)).toEqual(["2026-09-05", "2026-10-20"]);
    expect(parsed.columns[1]).toEqual({ index: 1, heading: "Mob", field: "phone", by: "you" });
  });

  it("uses exactly the columns it is given, even over the headings", () => {
    const columns = new Map<ImportField, number>([["customerName", 0], ["phone", 1]]);
    const parsed = parseLeadTable(table, { columns });
    // Executive and Entry date were not chosen, so they are not read.
    expect(parsed.rows.every((r) => r.assignedTo === null && r.enquiryDate === null)).toBe(true);
  });

  it("still reports the columns when the file has no leads", () => {
    const parsed = parseLeadTable([["Name", "Phone"]]);
    expect(parsed.fatal).toContain("no leads");
    expect(parsed.columns).toHaveLength(2);
  });
});

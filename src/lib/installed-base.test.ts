import { describe, expect, it } from "vitest";
import {
  EMPTY_RAW_ROW,
  INSTALLED_TEMPLATE,
  checkInstalledRow,
  detectInstalledColumns,
  endOfTerm,
  isRecordedMachine,
  parseCapacityKw,
  parseDurationMonths,
  parseInstallDate,
  parseInstalledCsv,
  parseInstalledTable,
  parseMoney,
  parseWarrantyCell,
  type RawInstalledRow,
} from "@/lib/installed-base";

const TODAY = "2026-11-19";
const raw = (over: Partial<RawInstalledRow>): RawInstalledRow => ({ ...EMPTY_RAW_ROW, customerName: "Ginger Pune", installedOn: "15/03/2023", ...over });

describe("parseInstallDate", () => {
  it("reads full dates the way they are written in India", () => {
    expect(parseInstallDate("15/03/2023")).toBe("2023-03-15");
    expect(parseInstallDate("2023-03-15")).toBe("2023-03-15");
    expect(parseInstallDate("15-Mar-23")).toBe("2023-03-15");
  });

  it("takes the first day of a month written as month and year, or the last day for an end date", () => {
    expect(parseInstallDate("Mar 2022")).toBe("2022-03-01");
    expect(parseInstallDate("March-22")).toBe("2022-03-01");
    expect(parseInstallDate("03/2022")).toBe("2022-03-01");
    expect(parseInstallDate("2022-03")).toBe("2022-03-01");
    expect(parseInstallDate("Feb 2024", "end")).toBe("2024-02-29");
    expect(parseInstallDate("03/2022", "end")).toBe("2022-03-31");
  });

  it("refuses anything it cannot place", () => {
    for (const text of ["", "2022", "soon", "31/02/2023", "13/2022", "Foo 2022"]) expect(parseInstallDate(text)).toBeNull();
  });
});

describe("parseDurationMonths", () => {
  it("reads years and months written in words and short forms", () => {
    expect(parseDurationMonths("2 years")).toBe(24);
    expect(parseDurationMonths("1 Year")).toBe(12);
    expect(parseDurationMonths("2yrs")).toBe(24);
    expect(parseDurationMonths("1.5 years")).toBe(18);
    expect(parseDurationMonths("18 months")).toBe(18);
    expect(parseDurationMonths("24 mo")).toBe(24);
    expect(parseDurationMonths("one year")).toBe(12);
    expect(parseDurationMonths("Two Years")).toBe(24);
  });

  it("reads a bare number below 6 as years and 6 or more as months", () => {
    expect(parseDurationMonths("1")).toBe(12);
    expect(parseDurationMonths("2")).toBe(24);
    expect(parseDurationMonths("5")).toBe(60);
    expect(parseDurationMonths("6")).toBe(6);
    expect(parseDurationMonths("12")).toBe(12);
    expect(parseDurationMonths("24")).toBe(24);
  });

  it("treats none, nil and expired as no warranty, a blank as not given, and nonsense as invalid", () => {
    expect(parseDurationMonths("none")).toBe(0);
    expect(parseDurationMonths("NIL")).toBe(0);
    expect(parseDurationMonths("")).toBeNull();
    expect(parseDurationMonths("soon")).toBe("invalid");
    expect(parseDurationMonths("2025")).toBe("invalid");
  });
});

describe("parseWarrantyCell", () => {
  it("tells a period from an end date", () => {
    expect(parseWarrantyCell("2 years")).toEqual({ months: 24 });
    expect(parseWarrantyCell("15/03/2025")).toEqual({ endsOn: "2025-03-15" });
    expect(parseWarrantyCell("Mar 2025")).toEqual({ endsOn: "2025-03-31" });
    expect(parseWarrantyCell("")).toBeNull();
    expect(parseWarrantyCell("whenever")).toBe("invalid");
  });
});

describe("parseCapacityKw, parseMoney and endOfTerm", () => {
  it("reads a capacity in kW", () => {
    expect(parseCapacityKw("33")).toBe(33);
    expect(parseCapacityKw("33 kW")).toBe(33);
    expect(parseCapacityKw("7.5KW")).toBe(7.5);
    expect(parseCapacityKw("")).toBeNull();
    expect(parseCapacityKw("big")).toBe("invalid");
    expect(parseCapacityKw("0")).toBe("invalid");
  });

  it("reads money the way it is written in India", () => {
    expect(parseMoney("85000")).toBe(85000);
    expect(parseMoney("₹ 85,000")).toBe(85000);
    expect(parseMoney("Rs. 85000/-")).toBe(85000);
    expect(parseMoney("85,000 only")).toBe(85000);
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("nil")).toBe(0);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("about 50k")).toBe("invalid");
  });

  it("ends a term the day before the same date later", () => {
    expect(endOfTerm("2025-03-15", 12)).toBe("2026-03-14");
    expect(endOfTerm("2024-02-29", 12)).toBe("2025-02-27");
    expect(endOfTerm("2025-01-31", 1)).toBe("2025-02-27");
  });
});

describe("checkInstalledRow", () => {
  it("accepts a row with only a customer and an installation date", () => {
    const result = checkInstalledRow(raw({}), 2, TODAY);
    expect(result).toMatchObject({ ok: true, row: { customerName: "Ginger Pune", installedOn: "2023-03-15", quantity: 1, serials: [], amc: null, phone: "" } });
  });

  it("reads the model, capacity, quantity and warranty", () => {
    const result = checkInstalledRow(raw({ model: "Commercial Heat Pump 33 kW", quantity: "2", warranty: "2 years", phone: " 98000 00001 " }), 2, TODAY);
    expect(result).toMatchObject({ ok: true, row: { model: "Commercial Heat Pump 33 kW", capacityKw: 33, quantity: 2, warrantyMonths: 24, phone: "98000 00001" } });
  });

  it("lets an end date win over a period and keeps a period of zero as no warranty", () => {
    expect(checkInstalledRow(raw({ warranty: "1 year", warrantyEnds: "01/01/2027" }), 2, TODAY)).toMatchObject({ ok: true, row: { warrantyEndsOn: "2027-01-01", warrantyMonths: 12 } });
    expect(checkInstalledRow(raw({ warranty: "none" }), 2, TODAY)).toMatchObject({ ok: true, row: { warrantyMonths: 0 } });
  });

  it("takes the quantity from the serial numbers and refuses a mismatch", () => {
    expect(checkInstalledRow(raw({ serials: "A1, A2\nA3" }), 2, TODAY)).toMatchObject({ ok: true, row: { quantity: 3, serials: ["A1", "A2", "A3"] } });
    expect(checkInstalledRow(raw({ serials: "A1, A2", quantity: "3" }), 2, TODAY)).toMatchObject({ ok: false });
  });

  it("builds a maintenance contract from a start date and a period, or from two dates", () => {
    const byTerm = checkInstalledRow(raw({ amcStart: "15/03/2025", amcTerm: "1 year", amcAmount: "₹85,000", amcVisits: "4", amcParts: "Filters" }), 2, TODAY);
    expect(byTerm).toMatchObject({ ok: true, row: { amc: { startDate: "2025-03-15", endDate: "2026-03-14", amount: 85000, visitsPerYear: 4, coveredParts: "Filters" } } });
    const byDates = checkInstalledRow(raw({ amcStart: "15/03/2025", amcEnd: "14/03/2027" }), 2, TODAY);
    expect(byDates).toMatchObject({ ok: true, row: { amc: { endDate: "2027-03-14", amount: 0, visitsPerYear: 2 } } });
    const defaultTerm = checkInstalledRow(raw({ amcStart: "15/03/2025" }), 2, TODAY);
    expect(defaultTerm).toMatchObject({ ok: true, row: { amc: { endDate: "2026-03-14" } } });
  });

  it("says what is wrong with a row that cannot be used", () => {
    const message = (over: Partial<RawInstalledRow>) => {
      const result = checkInstalledRow(raw(over), 2, TODAY);
      return result.ok ? "ok" : result.message;
    };
    expect(message({ customerName: " " })).toMatch(/customer name/i);
    expect(message({ installedOn: "" })).toMatch(/installation date is missing/i);
    expect(message({ installedOn: "soon" })).toMatch(/not understood/i);
    expect(message({ installedOn: "01/01/2030" })).toMatch(/future/i);
    expect(message({ email: "not-an-email" })).toMatch(/email/i);
    expect(message({ capacityKw: "big" })).toMatch(/capacity/i);
    expect(message({ quantity: "two" })).toMatch(/quantity/i);
    expect(message({ quantity: "0" })).toMatch(/at least 1/i);
    expect(message({ quantity: "500" })).toMatch(/at most/i);
    expect(message({ warranty: "sometime" })).toMatch(/warranty/i);
    expect(message({ warranty: "01/01/2020" })).toMatch(/before the installation/i);
    expect(message({ amcAmount: "85000" })).toMatch(/start date/i);
    expect(message({ amcStart: "01/01/2025", amcEnd: "01/01/2024" })).toMatch(/after it starts/i);
    expect(message({ amcStart: "01/01/2025", amcVisits: "80" })).toMatch(/1 to 52/i);
  });
});

describe("detectInstalledColumns", () => {
  it("finds the usual headings, in English and in common short forms", () => {
    const columns = detectInstalledColumns(["Hotel Name", "City", "Mobile No.", "Model", "Capacity (kW)", "Qty", "Date of Installation", "Warranty", "AMC Start Date", "AMC Charges"]);
    expect([...columns.entries()].sort()).toEqual(
      [
        ["address", 1],
        ["amcAmount", 9],
        ["amcStart", 8],
        ["capacityKw", 4],
        ["customerName", 0],
        ["installedOn", 6],
        ["model", 3],
        ["phone", 2],
        ["quantity", 5],
        ["warranty", 7],
      ].sort(),
    );
  });

  it("does not take a running Sr. No. column for the machine serial numbers", () => {
    const columns = detectInstalledColumns(["Sr. No.", "S No", "Serial Number", "Client"]);
    expect(columns.get("serials")).toBe(2);
  });
});

describe("parseInstalledTable", () => {
  const header = ["Hotel", "City", "Phone", "Model", "Qty", "Installed", "Warranty", "AMC start", "AMC amount"];

  it("keeps the good rows and describes each bad one, counting lines from the header", () => {
    const parsed = parseInstalledTable(
      [
        header,
        ["Ginger Pune", "Pune", "9800000001", "Heat pump 33 kW", "2", "15/03/2023", "2 years", "15/03/2025", "85000"],
        ["", "", "", "", "", "", "", "", ""],
        ["Hotel X", "Nashik", "", "Heat pump 21 kW", "x", "01/06/2021", "1 year", "", ""],
        ["Hotel Y", "Goa", "", "", "", "never", "", "", ""],
        ["Hotel Z", "Goa", "", "Heat pump 21 kW", "", "Jun 2021", "", "", ""],
      ],
      TODAY,
    );
    expect(parsed.fatal).toBeNull();
    expect(parsed.rows.map((r) => [r.line, r.customerName])).toEqual([
      [2, "Ginger Pune"],
      [6, "Hotel Z"],
    ]);
    expect(parsed.problems.map((p) => p.line)).toEqual([4, 5]);
    expect(parsed.totalRows).toBe(4);
    expect(parsed.rows[0].amc).toMatchObject({ startDate: "2025-03-15", amount: 85000 });
  });

  it("refuses a sheet without the two columns it cannot do without", () => {
    expect(parseInstalledTable([["Hotel", "Model"], ["A", "B"]], TODAY).fatal).toMatch(/installation date/);
    expect(parseInstalledTable([["Model", "Installed"], ["A", "01/01/2022"]], TODAY).fatal).toMatch(/customer name/);
    expect(parseInstalledTable([], TODAY).fatal).toMatch(/empty/);
    expect(parseInstalledTable([header], TODAY).fatal).toMatch(/no machines/);
  });

  it("uses the columns a person chose instead of the headings", () => {
    const parsed = parseInstalledTable(
      [
        ["A", "B"],
        ["Hotel Q", "01/01/2022"],
      ],
      TODAY,
      { columns: new Map([["customerName", 0], ["installedOn", 1]]), decidedBy: new Map([[0, "you"]]) },
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.columns[0]).toMatchObject({ field: "customerName", by: "you" });
  });

  it("reads the template that is offered for download", () => {
    const parsed = parseInstalledTable(INSTALLED_TEMPLATE, TODAY);
    expect(parsed.fatal).toBeNull();
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ quantity: 2, warrantyMonths: 24, capacityKw: 33 });
    expect(parsed.rows[1]).toMatchObject({ installedOn: "2021-06-01", serials: ["SN-1001"] });
  });

  it("reads a CSV", () => {
    const parsed = parseInstalledCsv("Hotel,Installed\r\nGinger Pune,15/03/2023\r\n", TODAY);
    expect(parsed.rows).toHaveLength(1);
  });
});

describe("isRecordedMachine", () => {
  it("is true for a machine with no order and no installation job behind it", () => {
    expect(isRecordedMachine({ salesOrderId: null, installationId: null })).toBe(true);
    expect(isRecordedMachine({ salesOrderId: "so1", installationId: null })).toBe(false);
    expect(isRecordedMachine({ salesOrderId: null, installationId: "job1" })).toBe(false);
  });
});

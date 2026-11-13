import { describe, expect, it } from "vitest";
import type { ImportRow } from "@/lib/lead-import";
import { applyPeriod, describePeriod, periodBounds, periodFromInput, periodProblem } from "./import-period";

const TODAY = new Date("2026-11-13T00:00:00.000Z");

const row = (line: number, enquiryDate: string | null): ImportRow => ({
  line,
  customerName: `Customer ${line}`,
  contactRole: null,
  phone: "9000000000",
  email: null,
  address: null,
  productCategory: null,
  requirementNotes: null,
  budget: null,
  source: null,
  referredBy: null,
  assignedTo: null,
  status: "NEW",
  enquiryDate,
  contacts: [],
  followUp: null,
});

describe("periodFromInput", () => {
  it("means everything when nothing is chosen", () => {
    expect(periodFromInput({})).toEqual({ kind: "all" });
    expect(periodFromInput({ months: "", from: "", to: "" })).toEqual({ kind: "all" });
  });

  it("takes a number of months", () => {
    expect(periodFromInput({ months: "3" })).toEqual({ kind: "months", months: 3 });
  });

  it("lets dates win over months, and ignores bad values", () => {
    expect(periodFromInput({ months: "3", from: "2026-08-01", to: "2026-09-30" })).toEqual({ kind: "range", from: "2026-08-01", to: "2026-09-30" });
    expect(periodFromInput({ from: "2026-08-01" })).toEqual({ kind: "range", from: "2026-08-01", to: null });
    expect(periodFromInput({ months: "abc" })).toEqual({ kind: "all" });
    expect(periodFromInput({ months: "0" })).toEqual({ kind: "all" });
    expect(periodFromInput({ from: "01/08/2026" })).toEqual({ kind: "all" });
  });

  it("reports dates that are the wrong way round", () => {
    expect(periodProblem({ kind: "range", from: "2026-09-30", to: "2026-08-01" })).toContain("after");
    expect(periodProblem({ kind: "range", from: "2026-08-01", to: "2026-09-30" })).toBeNull();
    expect(periodProblem({ kind: "all" })).toBeNull();
  });
});

describe("periodBounds and describePeriod", () => {
  it("counts months back from today", () => {
    expect(periodBounds({ kind: "months", months: 3 }, TODAY)).toEqual({ from: "2026-08-13", to: null });
    expect(periodBounds({ kind: "months", months: 6 }, TODAY)).toEqual({ from: "2026-05-13", to: null });
  });

  it("says in words what was asked", () => {
    expect(describePeriod({ kind: "all" }, TODAY)).toBe("everything in the file");
    expect(describePeriod({ kind: "months", months: 1 }, TODAY)).toBe("the last 1 month (from 2026-10-13)");
    expect(describePeriod({ kind: "range", from: "2026-08-01", to: "2026-09-30" }, TODAY)).toBe("2026-08-01 to 2026-09-30");
    expect(describePeriod({ kind: "range", from: null, to: "2026-09-30" }, TODAY)).toBe("up to 2026-09-30");
  });
});

describe("applyPeriod", () => {
  const rows = [row(2, "2026-05-01"), row(3, "2026-08-13"), row(4, "2026-10-20"), row(5, null), row(6, "2026-07-31")];

  it("keeps everything for all, dated or not", () => {
    expect(applyPeriod(rows, { kind: "all" }, TODAY)).toEqual({ kept: rows, outside: 0, undated: 0 });
  });

  it("keeps rows from the first day of the period on, and counts the rest", () => {
    const r = applyPeriod(rows, { kind: "months", months: 3 }, TODAY);
    expect(r.kept.map((x) => x.line)).toEqual([3, 4]);
    expect(r.outside).toBe(2);
    expect(r.undated).toBe(1);
  });

  it("keeps rows between two dates, both days included", () => {
    const r = applyPeriod(rows, { kind: "range", from: "2026-07-31", to: "2026-08-13" }, TODAY);
    expect(r.kept.map((x) => x.line)).toEqual([3, 6]);
  });

  it("can have only one end", () => {
    expect(applyPeriod(rows, { kind: "range", from: null, to: "2026-07-31" }, TODAY).kept.map((x) => x.line)).toEqual([2, 6]);
  });
});

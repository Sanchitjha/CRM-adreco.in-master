import { describe, expect, it } from "vitest";
import {
  addMonthsUtc,
  amcState,
  buildVisitSchedule,
  daysBetween,
  dealerIncentive,
  isInWarranty,
  parseCommissioningChecklist,
  parseInstallChecklist,
  parseSerialList,
  renewalBucket,
  slaDueAt,
  slaState,
  warrantyEndsOn,
  warrantyState,
} from "@/lib/lifecycle";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("addMonthsUtc", () => {
  it("keeps the day of the month", () => {
    expect(iso(addMonthsUtc(d("2026-10-28"), 12))).toBe("2027-10-28");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(iso(addMonthsUtc(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(iso(addMonthsUtc(d("2024-01-31"), 1))).toBe("2024-02-29");
  });

  it("works backwards", () => {
    expect(iso(addMonthsUtc(d("2026-03-31"), -1))).toBe("2026-02-28");
  });
});

describe("daysBetween", () => {
  it("counts whole days in either direction", () => {
    expect(daysBetween(d("2026-01-01"), d("2026-01-31"))).toBe(30);
    expect(daysBetween(d("2026-01-31"), d("2026-01-01"))).toBe(-30);
  });
});

describe("warranty", () => {
  it("ends the chosen number of months after it starts", () => {
    expect(iso(warrantyEndsOn(d("2026-02-10"), 24))).toBe("2028-02-10");
  });

  it("falls back to twelve months when the product has none", () => {
    expect(iso(warrantyEndsOn(d("2026-02-10"), 0))).toBe("2027-02-10");
  });

  it("classifies a warranty by days remaining", () => {
    const today = d("2026-06-01");
    expect(warrantyState(null, today)).toBe("NOT_STARTED");
    expect(warrantyState(d("2026-05-31"), today)).toBe("EXPIRED");
    expect(warrantyState(d("2026-06-01"), today)).toBe("EXPIRING");
    expect(warrantyState(d("2026-07-01"), today)).toBe("EXPIRING");
    expect(warrantyState(d("2026-07-02"), today)).toBe("ACTIVE");
  });

  it("still covers a unit on the last day", () => {
    const today = d("2026-06-01");
    expect(isInWarranty(d("2026-06-01"), today)).toBe(true);
    expect(isInWarranty(d("2026-05-31"), today)).toBe(false);
    expect(isInWarranty(null, today)).toBe(false);
  });
});

describe("AMC renewals", () => {
  const today = d("2026-06-01");

  it("picks the smallest reminder window the contract has entered", () => {
    expect(renewalBucket(d("2026-08-01"), today)).toBeNull(); // 61 days
    expect(renewalBucket(d("2026-07-31"), today)).toBe(60);
    expect(renewalBucket(d("2026-07-02"), today)).toBe(60); // 31 days
    expect(renewalBucket(d("2026-07-01"), today)).toBe(30);
    expect(renewalBucket(d("2026-06-09"), today)).toBe(30); // 8 days
    expect(renewalBucket(d("2026-06-08"), today)).toBe(7);
    expect(renewalBucket(d("2026-06-01"), today)).toBe(7);
    expect(renewalBucket(d("2026-05-31"), today)).toBeNull();
  });

  it("derives the state of a contract", () => {
    expect(amcState({ status: "CANCELLED", endDate: d("2027-01-01") }, today)).toBe("CANCELLED");
    expect(amcState({ status: "ACTIVE", endDate: d("2026-05-31") }, today)).toBe("EXPIRED");
    expect(amcState({ status: "ACTIVE", endDate: d("2026-07-15") }, today)).toBe("EXPIRING");
    expect(amcState({ status: "ACTIVE", endDate: d("2027-01-01") }, today)).toBe("ACTIVE");
  });
});

describe("buildVisitSchedule", () => {
  it("spaces visits evenly and keeps them inside the term", () => {
    const start = d("2026-01-01");
    const end = d("2027-01-01");
    const visits = buildVisitSchedule(start, end, 4);
    expect(visits).toHaveLength(4);
    for (const v of visits) {
      expect(v.getTime()).toBeGreaterThan(start.getTime());
      expect(v.getTime()).toBeLessThan(end.getTime());
    }
    const sorted = [...visits].sort((a, b) => a.getTime() - b.getTime());
    expect(visits).toEqual(sorted);
    const gaps = visits.slice(1).map((v, i) => daysBetween(visits[i], v));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });

  it("scales with the length of the term", () => {
    expect(buildVisitSchedule(d("2026-01-01"), d("2028-01-01"), 2)).toHaveLength(4);
  });

  it("always schedules at least one visit for a short contract", () => {
    expect(buildVisitSchedule(d("2026-01-01"), d("2026-01-20"), 1)).toHaveLength(1);
  });

  it("returns nothing for an empty or invalid term", () => {
    expect(buildVisitSchedule(d("2026-01-01"), d("2026-01-01"), 2)).toEqual([]);
    expect(buildVisitSchedule(d("2026-02-01"), d("2026-01-01"), 2)).toEqual([]);
    expect(buildVisitSchedule(d("2026-01-01"), d("2027-01-01"), 0)).toEqual([]);
  });
});

describe("service SLA", () => {
  const raised = new Date("2026-06-01T10:00:00Z");

  it("adds the target hours to the time raised", () => {
    expect(slaDueAt(raised, 24).toISOString()).toBe("2026-06-02T10:00:00.000Z");
  });

  it("has no state without a due time", () => {
    expect(slaState({ slaDueAt: null, closedAt: null })).toBeNull();
  });

  it("tracks an open ticket against its deadline", () => {
    const due = slaDueAt(raised, 24);
    expect(slaState({ slaDueAt: due, closedAt: null }, new Date("2026-06-01T12:00:00Z"))).toBe("ON_TRACK");
    expect(slaState({ slaDueAt: due, closedAt: null }, new Date("2026-06-02T07:00:00Z"))).toBe("DUE_SOON");
    expect(slaState({ slaDueAt: due, closedAt: null }, new Date("2026-06-02T10:00:01Z"))).toBe("BREACHED");
  });

  it("judges a closed ticket by when it was closed", () => {
    const due = slaDueAt(raised, 24);
    expect(slaState({ slaDueAt: due, closedAt: new Date("2026-06-02T09:00:00Z") })).toBe("MET");
    expect(slaState({ slaDueAt: due, closedAt: new Date("2026-06-03T09:00:00Z") })).toBe("BREACHED");
  });
});

describe("parseSerialList", () => {
  it("splits on lines, commas and semicolons, trimming and removing duplicates", () => {
    expect(parseSerialList("A1, A2\nA3;  A1 \r\n\n A4")).toEqual(["A1", "A2", "A3", "A4"]);
  });

  it("returns nothing for blank input", () => {
    expect(parseSerialList("  \n , ")).toEqual([]);
  });
});

describe("dealerIncentive", () => {
  it("pays nothing until the target is met", () => {
    expect(dealerIncentive(99, 100, 5)).toBe(0);
  });

  it("pays the percentage on everything achieved once the target is met", () => {
    expect(dealerIncentive(100, 100, 5)).toBe(5);
    expect(dealerIncentive(250000, 200000, 2.5)).toBe(6250);
  });

  it("ignores a missing target", () => {
    expect(dealerIncentive(500, 0, 5)).toBe(0);
  });
});

describe("stored checklists", () => {
  it("reads a valid install checklist and drops malformed rows", () => {
    const items = parseInstallChecklist([
      { id: "a", label: "Level the unit", done: true },
      { id: "b", label: "Connect piping" },
      { label: "No id" },
      null,
      "junk",
    ]);
    expect(items).toEqual([
      { id: "a", label: "Level the unit", done: true },
      { id: "b", label: "Connect piping", done: false },
    ]);
  });

  it("treats anything other than an array as empty", () => {
    expect(parseInstallChecklist(null)).toEqual([]);
    expect(parseCommissioningChecklist({})).toEqual([]);
  });

  it("falls back to pending for an unknown commissioning result", () => {
    const [item] = parseCommissioningChecklist([{ id: "a", label: "Flow", result: "MAYBE", reading: 5 }]);
    expect(item).toEqual({ id: "a", label: "Flow", result: "PENDING", reading: "" });
  });
});

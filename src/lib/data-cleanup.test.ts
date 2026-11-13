import { describe, expect, it } from "vitest";
import {
  confirmPhrase,
  describeRange,
  monthKey,
  protectionOf,
  rangeBounds,
  rangeFromInput,
  type CleanupFacts,
} from "./data-cleanup";

const NOW = new Date("2026-11-13T09:00:00.000Z");

const facts = (over: Partial<CleanupFacts> = {}): CleanupFacts => ({
  status: "NEW",
  convertedAt: null,
  currentDepartmentId: null,
  orders: 0,
  installations: 0,
  tickets: 0,
  serials: 0,
  amcContracts: 0,
  quotations: 0,
  surveys: 0,
  ...over,
});

describe("rangeFromInput", () => {
  it("takes a number of months back", () => {
    expect(rangeFromInput({ mode: "older", months: "3" })).toEqual({ ok: true, range: { kind: "older", months: 3 } });
  });

  it("takes two dates and refuses them the wrong way round or incomplete", () => {
    expect(rangeFromInput({ mode: "range", from: "2026-08-01", to: "2026-09-30" })).toEqual({
      ok: true,
      range: { kind: "range", from: "2026-08-01", to: "2026-09-30" },
    });
    expect(rangeFromInput({ mode: "range", from: "2026-09-30", to: "2026-08-01" }).ok).toBe(false);
    expect(rangeFromInput({ mode: "range", from: "2026-09-30" }).ok).toBe(false);
  });

  it("refuses a missing or silly number of months", () => {
    expect(rangeFromInput({ mode: "older", months: "" }).ok).toBe(false);
    expect(rangeFromInput({ mode: "older", months: "0" }).ok).toBe(false);
    expect(rangeFromInput({ mode: "older", months: "x" }).ok).toBe(false);
    expect(rangeFromInput({}).ok).toBe(false);
  });

  it("knows the any-date choice", () => {
    expect(rangeFromInput({ mode: "all" })).toEqual({ ok: true, range: { kind: "all" } });
  });
});

describe("rangeBounds", () => {
  it("makes 'older than 3 months' everything created before the start of that Indian day", () => {
    const { from, before } = rangeBounds({ kind: "older", months: 3 }, NOW);
    expect(from).toBeNull();
    // 13 Aug 2026 begins at 18:30 UTC on 12 Aug.
    expect(before.toISOString()).toBe("2026-08-12T18:30:00.000Z");
  });

  it("makes a range include both its first and its last Indian day", () => {
    const { from, before } = rangeBounds({ kind: "range", from: "2026-08-01", to: "2026-08-31" }, NOW);
    expect(from!.toISOString()).toBe("2026-07-31T18:30:00.000Z");
    expect(before.toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });

  it("puts a lead imported with a sheet date inside that day's range", () => {
    // Imported leads are stamped at midnight UTC of the sheet's date.
    const stamped = new Date("2026-08-01T00:00:00.000Z");
    const { from, before } = rangeBounds({ kind: "range", from: "2026-08-01", to: "2026-08-01" }, NOW);
    expect(stamped >= from! && stamped < before).toBe(true);
  });

  it("has no start or end for any date", () => {
    const { from, before } = rangeBounds({ kind: "all" }, NOW);
    expect(from).toBeNull();
    expect(before.getUTCFullYear()).toBe(9999);
  });
});

describe("describeRange", () => {
  it("says what the period is", () => {
    expect(describeRange({ kind: "older", months: 1 }, NOW)).toBe("created before 2026-10-13 (more than 1 month ago)");
    expect(describeRange({ kind: "range", from: "2026-08-01", to: "2026-08-31" })).toBe("created from 2026-08-01 to 2026-08-31");
    expect(describeRange({ kind: "all" })).toBe("created on any date");
  });
});

describe("protectionOf", () => {
  it("lets a plain lead go", () => {
    expect(protectionOf(facts(), false)).toBeNull();
    expect(protectionOf(facts({ status: "LOST" }), false)).toBeNull();
  });

  it("never lets a customer go", () => {
    expect(protectionOf(facts({ status: "CONVERTED" }), true)).toBe("converted");
    expect(protectionOf(facts({ convertedAt: new Date() }), true)).toBe("converted");
    expect(protectionOf(facts({ currentDepartmentId: "d1" }), true)).toBe("converted");
  });

  it("never lets a lead with real business go", () => {
    for (const key of ["orders", "installations", "tickets", "serials", "amcContracts"] as const) {
      expect(protectionOf(facts({ [key]: 1 }), true)).toBe("business");
    }
  });

  it("keeps quotations and surveys unless asked", () => {
    expect(protectionOf(facts({ quotations: 1 }), false)).toBe("quotes");
    expect(protectionOf(facts({ surveys: 2 }), false)).toBe("quotes");
    expect(protectionOf(facts({ quotations: 1, surveys: 2 }), true)).toBeNull();
  });

  it("reports the strongest reason first", () => {
    expect(protectionOf(facts({ status: "CONVERTED", orders: 1, quotations: 1 }), false)).toBe("converted");
    expect(protectionOf(facts({ orders: 1, quotations: 1 }), false)).toBe("business");
  });
});

describe("confirmPhrase and monthKey", () => {
  it("asks for the exact number", () => {
    expect(confirmPhrase(40)).toBe("DELETE 40");
  });

  it("buckets a lead into its Indian calendar month", () => {
    // 31 Aug 20:00 UTC is already 1 Sep in India.
    expect(monthKey(new Date("2026-08-31T20:00:00.000Z"))).toBe("2026-09");
    expect(monthKey(new Date("2026-08-31T10:00:00.000Z"))).toBe("2026-08");
  });
});

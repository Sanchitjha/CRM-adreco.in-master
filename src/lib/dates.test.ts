import { describe, expect, it } from "vitest";
import { formatDate, parseDateInput, toDateInput, today } from "@/lib/dates";

describe("parseDateInput", () => {
  it("reads a calendar date as UTC midnight", () => {
    expect(parseDateInput("2026-10-28")?.toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });

  it("rejects blank and malformed input", () => {
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
    expect(parseDateInput("28/10/2026")).toBeNull();
    expect(parseDateInput("2026-13-45")).toBeNull();
  });
});

describe("IST calendar dates", () => {
  // 19:30 UTC on the 27th is already 01:00 on the 28th in India.
  const lateEvening = new Date("2026-10-27T19:30:00Z");

  it("shows the Indian calendar day regardless of server timezone", () => {
    expect(toDateInput(lateEvening)).toBe("2026-10-28");
  });

  it("turns 'now' into today's Indian date at UTC midnight", () => {
    expect(today(lateEvening).toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });

  it("round-trips a stored date", () => {
    expect(toDateInput(parseDateInput("2026-03-05"))).toBe("2026-03-05");
  });
});

describe("formatDate", () => {
  it("shows a dash when there is no date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats a date in the Indian style", () => {
    expect(formatDate(new Date("2026-10-28T00:00:00Z"))).toBe("28 Oct 2026");
  });
});

import { describe, expect, it } from "vitest";
import { formatDocNumber } from "@/lib/sequence";

describe("formatDocNumber", () => {
  it("pads the counter to four digits", () => {
    expect(formatDocNumber("SO", 2026, 7)).toBe("SO-2026-0007");
    expect(formatDocNumber("TKT", 2026, 1234)).toBe("TKT-2026-1234");
  });

  it("keeps going past four digits", () => {
    expect(formatDocNumber("INS", 2027, 12345)).toBe("INS-2027-12345");
  });
});

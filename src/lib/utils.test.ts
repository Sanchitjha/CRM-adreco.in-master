import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/utils";

describe("formatINR", () => {
  it("groups digits the Indian way and leaves whole rupees without decimals", () => {
    expect(formatINR(1850000)).toBe("₹18,50,000");
    expect(formatINR(7000)).toBe("₹7,000");
  });

  it("always shows two decimals when there are paise", () => {
    expect(formatINR(20537.1)).toBe("₹20,537.10");
    expect(formatINR(134632.1)).toBe("₹1,34,632.10");
    expect(formatINR("6005.25")).toBe("₹6,005.25");
  });

  it("shows a dash when there is no amount", () => {
    expect(formatINR(null)).toBe("—");
    expect(formatINR(undefined)).toBe("—");
    expect(formatINR("")).toBe("—");
    expect(formatINR(Number.NaN)).toBe("—");
  });
});

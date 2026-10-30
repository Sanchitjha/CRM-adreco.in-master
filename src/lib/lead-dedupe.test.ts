import { describe, expect, it } from "vitest";
import { isSameEmail, isSamePhone, phoneKey } from "@/lib/lead-dedupe";

describe("phoneKey", () => {
  it("keeps the last ten digits whatever the formatting", () => {
    expect(phoneKey("+91 98765 43210")).toBe("9876543210");
    expect(phoneKey("098765-43210")).toBe("9876543210");
    expect(phoneKey("(98765) 43210")).toBe("9876543210");
  });
});

describe("isSamePhone", () => {
  it("matches the same subscriber written differently", () => {
    expect(isSamePhone("+91 98765 43210", "9876543210")).toBe(true);
    expect(isSamePhone("98765-43210", "0 98765 43210")).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(isSamePhone("9876543210", "9876543211")).toBe(false);
  });

  it("ignores numbers too short to identify anyone", () => {
    expect(isSamePhone("12345", "12345")).toBe(false);
  });
});

describe("isSameEmail", () => {
  it("compares case-insensitively", () => {
    expect(isSameEmail("Raj@Example.com", "raj@example.com ")).toBe(true);
  });

  it("is false when either side is missing", () => {
    expect(isSameEmail(null, "a@b.co")).toBe(false);
    expect(isSameEmail("", "")).toBe(false);
  });
});

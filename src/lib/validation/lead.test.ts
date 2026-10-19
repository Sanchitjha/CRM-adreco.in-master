import { describe, expect, it } from "vitest";
import { createLeadSchema, updateStatusSchema } from "@/lib/validation/lead";

describe("createLeadSchema", () => {
  it("accepts a minimal valid lead", () => {
    const result = createLeadSchema.safeParse({ customerName: "Ravi Kumar", phone: "9876543210" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing customer name", () => {
    const result = createLeadSchema.safeParse({ customerName: "", phone: "9876543210" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email when one is given", () => {
    const result = createLeadSchema.safeParse({
      customerName: "Ravi Kumar",
      phone: "9876543210",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateStatusSchema", () => {
  it("rejects a status outside the enum", () => {
    const result = updateStatusSchema.safeParse({ leadId: "abc", status: "ARCHIVED" });
    expect(result.success).toBe(false);
  });

  it("accepts a known status", () => {
    const result = updateStatusSchema.safeParse({ leadId: "abc", status: "CONVERTED" });
    expect(result.success).toBe(true);
  });
});

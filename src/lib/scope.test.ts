import { describe, expect, it } from "vitest";
import { canSeeLead, canSeeQuotation, leadScope } from "@/lib/scope";

describe("leadScope", () => {
  it("limits a sales rep to their own leads", () => {
    expect(leadScope("SALES", "u1")).toEqual({ assignedToId: "u1" });
  });

  it("does not limit other roles", () => {
    for (const role of ["ADMIN", "DESIGN", "ACCOUNTS", "INSTALLATION", "SERVICE"] as const) {
      expect(leadScope(role, "u1")).toEqual({});
    }
  });
});

describe("canSeeQuotation", () => {
  const quote = { createdById: "writer", lead: { assignedToId: "owner" } };

  it("lets admins and design engineers open any quotation", () => {
    expect(canSeeQuotation("ADMIN", "x", quote)).toBe(true);
    expect(canSeeQuotation("DESIGN", "x", quote)).toBe(true);
  });

  it("lets a sales rep open quotes they wrote or whose lead is theirs", () => {
    expect(canSeeQuotation("SALES", "writer", quote)).toBe(true);
    expect(canSeeQuotation("SALES", "owner", quote)).toBe(true);
    expect(canSeeQuotation("SALES", "someone-else", quote)).toBe(false);
  });

  it("keeps quotations away from every other role", () => {
    expect(canSeeQuotation("ACCOUNTS", "owner", quote)).toBe(false);
    expect(canSeeQuotation("SERVICE", "writer", quote)).toBe(false);
  });
});

describe("canSeeLead", () => {
  it("lets a sales rep see only leads assigned to them", () => {
    expect(canSeeLead("SALES", "u1", { assignedToId: "u1" })).toBe(true);
    expect(canSeeLead("SALES", "u1", { assignedToId: "u2" })).toBe(false);
    expect(canSeeLead("SALES", "u1", { assignedToId: null })).toBe(false);
  });

  it("lets everyone else see any lead", () => {
    expect(canSeeLead("SERVICE", "u1", { assignedToId: "u2" })).toBe(true);
    expect(canSeeLead("ADMIN", "u1", { assignedToId: null })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { canSeeLead, leadScope } from "@/lib/scope";

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

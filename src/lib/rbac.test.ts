import { describe, expect, it } from "vitest";
import { canAccessDepartment, isAdmin } from "@/lib/rbac";

describe("isAdmin", () => {
  it("is true only for ADMIN", () => {
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isAdmin("SALES")).toBe(false);
  });
});

describe("canAccessDepartment", () => {
  it("lets admin access any department", () => {
    expect(canAccessDepartment("ADMIN", "Installation")).toBe(true);
    expect(canAccessDepartment("ADMIN", null)).toBe(true);
  });

  it("matches a role to its own department only", () => {
    expect(canAccessDepartment("INSTALLATION", "Installation")).toBe(true);
    expect(canAccessDepartment("INSTALLATION", "Accounts")).toBe(false);
  });

  it("denies access when there is no current department", () => {
    expect(canAccessDepartment("SALES", null)).toBe(false);
    expect(canAccessDepartment("SALES", undefined)).toBe(false);
  });
});

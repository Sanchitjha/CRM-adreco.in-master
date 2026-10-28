import { describe, expect, it } from "vitest";
import {
  FIELD_ROLES,
  MODULE_ACCESS,
  canAccessDepartment,
  canCreate,
  canManage,
  canManageDealerFinance,
  canSeePricing,
  canView,
  isAdmin,
  type ModuleKey,
} from "@/lib/rbac";

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

describe("module access", () => {
  const modules = Object.keys(MODULE_ACCESS) as ModuleKey[];

  it("lets admin into every module", () => {
    for (const m of modules) {
      expect(canView("ADMIN", m)).toBe(true);
      expect(canManage("ADMIN", m)).toBe(true);
    }
  });

  it("never lets a role change records in a module it cannot open", () => {
    for (const m of modules) {
      for (const role of MODULE_ACCESS[m].manage) expect(MODULE_ACCESS[m].view).toContain(role);
      for (const role of MODULE_ACCESS[m].create ?? []) expect(MODULE_ACCESS[m].view).toContain(role);
    }
  });

  it("keeps settings for admin only", () => {
    expect(canView("SALES", "settings")).toBe(false);
    expect(canView("SERVICE", "settings")).toBe(false);
  });

  it("lets the field teams see the catalog but not change it", () => {
    expect(canView("INSTALLATION", "products")).toBe(true);
    expect(canManage("INSTALLATION", "products")).toBe(false);
    expect(canManage("DESIGN", "products")).toBe(true);
  });

  it("lets sales raise a service ticket without being able to run it", () => {
    expect(canCreate("SALES", "tickets")).toBe(true);
    expect(canManage("SALES", "tickets")).toBe(false);
    expect(canManage("SERVICE", "tickets")).toBe(true);
  });

  it("gives installations to the installation team", () => {
    expect(canManage("INSTALLATION", "installations")).toBe(true);
    expect(canManage("SERVICE", "installations")).toBe(false);
    expect(canView("SERVICE", "installations")).toBe(true);
  });

  it("falls back to manage rights when a module has no separate create list", () => {
    expect(canCreate("ACCOUNTS", "salesOrders")).toBe(true);
    expect(canCreate("DESIGN", "salesOrders")).toBe(false);
  });
});

describe("commercial visibility", () => {
  it("hides pricing from the field teams", () => {
    expect(canSeePricing("INSTALLATION")).toBe(false);
    expect(canSeePricing("SERVICE")).toBe(false);
    expect(canSeePricing("SALES")).toBe(true);
  });

  it("limits dealer finance to admin and accounts", () => {
    expect(canManageDealerFinance("ACCOUNTS")).toBe(true);
    expect(canManageDealerFinance("SALES")).toBe(false);
  });

  it("treats installation and service as field staff", () => {
    expect(FIELD_ROLES).toEqual(["INSTALLATION", "SERVICE"]);
  });
});

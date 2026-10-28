import type { Role } from "@prisma/client";

/** Canonical department pipeline order — matches the seeded Department rows. */
export const DEPARTMENT_PIPELINE = [
  "Sales",
  "Design & Engineering",
  "Accounts",
  "Installation",
  "Service",
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  SALES: "Sales",
  DESIGN: "Design & Engineering",
  ACCOUNTS: "Accounts",
  INSTALLATION: "Installation",
  SERVICE: "Service",
};

/** Which department pipeline stage a given role owns, if any. Admin owns none/all. */
export const ROLE_TO_DEPARTMENT_NAME: Partial<Record<Role, string>> = {
  SALES: "Sales",
  DESIGN: "Design & Engineering",
  ACCOUNTS: "Accounts",
  INSTALLATION: "Installation",
  SERVICE: "Service",
};

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

/** Roles that can create and review site surveys (field sales + technical). */
const SURVEY_ROLES: Role[] = ["ADMIN", "SALES", "DESIGN"];

export function canAccessSurveys(role: Role): boolean {
  return SURVEY_ROLES.includes(role);
}

/** Roles that can prepare quotations (sales + technical proposals). */
const QUOTE_ROLES: Role[] = ["ADMIN", "SALES", "DESIGN"];

export function canAccessQuotations(role: Role): boolean {
  return QUOTE_ROLES.includes(role);
}

export type ModuleKey =
  | "salesOrders"
  | "installations"
  | "commissioning"
  | "products"
  | "serials"
  | "tickets"
  | "warranty"
  | "amc"
  | "dealers"
  | "settings";

type ModuleAccess = {
  /** Can open the module and read its records. */
  view: Role[];
  /** Can change records. Defaults to nothing beyond `view` readers. */
  manage: Role[];
  /** Can raise new records. Defaults to `manage`. */
  create?: Role[];
};

const EVERYONE: Role[] = ["ADMIN", "SALES", "DESIGN", "ACCOUNTS", "INSTALLATION", "SERVICE"];

/** Who can see and change what across the lifecycle modules. Sales reps are further limited to their own leads. */
export const MODULE_ACCESS: Record<ModuleKey, ModuleAccess> = {
  salesOrders: { view: ["ADMIN", "SALES", "ACCOUNTS"], manage: ["ADMIN", "SALES", "ACCOUNTS"] },
  installations: { view: ["ADMIN", "SALES", "INSTALLATION", "SERVICE"], manage: ["ADMIN", "INSTALLATION"] },
  commissioning: {
    view: ["ADMIN", "SALES", "INSTALLATION", "SERVICE"],
    manage: ["ADMIN", "INSTALLATION", "SERVICE"],
  },
  products: { view: EVERYONE, manage: ["ADMIN", "DESIGN"] },
  serials: {
    view: ["ADMIN", "SALES", "ACCOUNTS", "INSTALLATION", "SERVICE"],
    manage: ["ADMIN", "ACCOUNTS", "INSTALLATION"],
  },
  tickets: {
    view: ["ADMIN", "SALES", "INSTALLATION", "SERVICE"],
    manage: ["ADMIN", "SERVICE"],
    create: ["ADMIN", "SALES", "INSTALLATION", "SERVICE"],
  },
  warranty: { view: ["ADMIN", "SALES", "ACCOUNTS", "SERVICE"], manage: ["ADMIN", "SERVICE"] },
  amc: { view: ["ADMIN", "SALES", "ACCOUNTS", "SERVICE"], manage: ["ADMIN", "SALES", "SERVICE"] },
  dealers: { view: ["ADMIN", "SALES", "ACCOUNTS"], manage: ["ADMIN", "SALES"] },
  settings: { view: ["ADMIN"], manage: ["ADMIN"] },
};

export function canView(role: Role, module: ModuleKey): boolean {
  return MODULE_ACCESS[module].view.includes(role);
}

export function canManage(role: Role, module: ModuleKey): boolean {
  return MODULE_ACCESS[module].manage.includes(role);
}

export function canCreate(role: Role, module: ModuleKey): boolean {
  const access = MODULE_ACCESS[module];
  return (access.create ?? access.manage).includes(role);
}

/** Roles whose people go out to sites, so jobs, tickets and visits can be assigned to them. */
export const FIELD_ROLES: Role[] = ["INSTALLATION", "SERVICE"];

/** Dealer and customer prices are commercial information — hidden from the field teams. */
export function canSeePricing(role: Role): boolean {
  return role === "ADMIN" || role === "SALES" || role === "DESIGN" || role === "ACCOUNTS";
}

/** Targets, incentives and outstanding balances are finance matters. */
export function canManageDealerFinance(role: Role): boolean {
  return role === "ADMIN" || role === "ACCOUNTS";
}

/** True if the given role should be able to see/act on a lead currently sitting in `departmentName`. */
export function canAccessDepartment(role: Role, departmentName: string | null | undefined): boolean {
  if (isAdmin(role)) return true;
  if (!departmentName) return false;
  return ROLE_TO_DEPARTMENT_NAME[role] === departmentName;
}

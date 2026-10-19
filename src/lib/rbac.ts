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

/** True if the given role should be able to see/act on a lead currently sitting in `departmentName`. */
export function canAccessDepartment(role: Role, departmentName: string | null | undefined): boolean {
  if (isAdmin(role)) return true;
  if (!departmentName) return false;
  return ROLE_TO_DEPARTMENT_NAME[role] === departmentName;
}

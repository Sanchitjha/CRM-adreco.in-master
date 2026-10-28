import type { Prisma, Role } from "@prisma/client";

/** Sales reps only see records tied to leads assigned to them; every other role works across all customers. */
export function leadScope(role: Role, userId: string): Prisma.LeadWhereInput {
  return role === "SALES" ? { assignedToId: userId } : {};
}

export function canSeeLead(role: Role, userId: string, lead: { assignedToId: string | null }): boolean {
  return role !== "SALES" || lead.assignedToId === userId;
}

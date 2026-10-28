import { prisma } from "@/lib/db";
import { FIELD_ROLES } from "@/lib/rbac";

/** Active field staff — the people a job, ticket or maintenance visit can be assigned to. */
export async function fieldTechnicians(): Promise<{ id: string; name: string; role: string }[]> {
  return prisma.user.findMany({
    where: { active: true, role: { in: FIELD_ROLES } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
}

/** Whether `userId` is an active member of field staff. */
export async function isFieldTechnician(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { active: true, role: true } });
  return !!user && user.active && FIELD_ROLES.includes(user.role);
}

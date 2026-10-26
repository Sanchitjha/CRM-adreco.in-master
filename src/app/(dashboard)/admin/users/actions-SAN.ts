"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { ROLE_TO_DEPARTMENT_NAME } from "@/lib/rbac";
import { createUserSchema, ROLE_VALUES } from "@/lib/validation/user";
import type { ActionState } from "@/lib/action-state";
import type { Role } from "@prisma/client";
import { z } from "zod";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Admin access required.");
  return session;
}

async function departmentIdForRole(role: Role): Promise<string | null> {
  const name = ROLE_TO_DEPARTMENT_NAME[role];
  if (!name) return null;
  const dept = await prisma.department.findUnique({ where: { name } });
  return dept?.id ?? null;
}

export async function createUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();

  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return { error: "A user with this email already exists." };

  const passwordHash = await bcrypt.hash(data.password, 10);
  const departmentId = await departmentIdForRole(data.role);

  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, passwordHash, role: data.role, departmentId },
  });

  await logActivity({
    userId: session.user.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    details: { email: user.email, role: user.role },
  });

  revalidatePath("/admin/users");
  return {};
}

export async function toggleUserActive(userId: string) {
  const session = await requireAdmin();
  if (userId === session.user.id) throw new Error("You cannot deactivate your own account.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found.");

  await prisma.user.update({ where: { id: userId }, data: { active: !user.active } });

  await logActivity({
    userId: session.user.id,
    action: "USER_ACTIVE_TOGGLED",
    entityType: "User",
    entityId: userId,
    details: { active: !user.active },
  });

  revalidatePath("/admin/users");
}

const roleSchema = z.enum(ROLE_VALUES);

export async function changeUserRole(userId: string, role: string) {
  const session = await requireAdmin();
  if (userId === session.user.id) throw new Error("You cannot change your own role.");

  const parsedRole = roleSchema.parse(role);
  const departmentId = await departmentIdForRole(parsedRole);

  await prisma.user.update({ where: { id: userId }, data: { role: parsedRole, departmentId } });

  await logActivity({
    userId: session.user.id,
    action: "USER_ROLE_CHANGED",
    entityType: "User",
    entityId: userId,
    details: { role: parsedRole },
  });

  revalidatePath("/admin/users");
}

export async function resetUserPassword(userId: string, password: string) {
  const session = await requireAdmin();
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  await logActivity({
    userId: session.user.id,
    action: "USER_PASSWORD_RESET",
    entityType: "User",
    entityId: userId,
  });
}

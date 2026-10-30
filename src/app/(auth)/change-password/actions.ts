"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { auth, unstable_update } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { changePasswordSchema } from "@/lib/password-policy";
import type { ActionState } from "@/lib/action-state";

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return { error: "Your current password is not correct." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 10),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });
  await logActivity({ userId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id });

  // Refresh the session so the "must change password" flag clears now rather than at the next account re-check.
  await unstable_update({});
  redirect("/");
}

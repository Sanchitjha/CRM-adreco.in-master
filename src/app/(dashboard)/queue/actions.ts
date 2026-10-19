"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { nextDepartmentName } from "@/lib/department-pipeline";
import { createRequiredDocuments } from "@/lib/document-requirements";
import { canAccessDepartment } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";
import { z } from "zod";

const leadIdSchema = z.object({ leadId: z.string().min(1) });

async function loadActiveStage(leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { currentDepartment: true },
  });
  if (!lead || !lead.currentDepartmentId) return { lead: null, stage: null };

  const stage = await prisma.leadDepartmentHistory.findFirst({
    where: { leadId, departmentId: lead.currentDepartmentId, status: { not: "COMPLETED" } },
    orderBy: { enteredAt: "desc" },
  });
  return { lead, stage };
}

export async function startStage(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = leadIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const { lead, stage } = await loadActiveStage(parsed.data.leadId);
  if (!lead || !stage) return { error: "This lead has no active stage." };
  if (!canAccessDepartment(session.user.role, lead.currentDepartment?.name)) {
    return { error: "You do not have access to this stage." };
  }

  await prisma.leadDepartmentHistory.update({
    where: { id: stage.id },
    data: { status: "IN_PROGRESS", assignedToId: session.user.id },
  });

  await logActivity({
    userId: session.user.id,
    action: "DEPARTMENT_STAGE_STARTED",
    entityType: "Lead",
    entityId: lead.id,
    details: { department: lead.currentDepartment?.name },
  });

  revalidatePath("/queue");
  revalidatePath(`/leads/${lead.id}`);
  return {};
}

export async function completeStage(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = leadIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const { lead, stage } = await loadActiveStage(parsed.data.leadId);
  if (!lead || !stage) return { error: "This lead has no active stage." };
  if (!canAccessDepartment(session.user.role, lead.currentDepartment?.name)) {
    return { error: "You do not have access to this stage." };
  }

  const currentDeptName = lead.currentDepartment!.name;
  const upcomingName = nextDepartmentName(currentDeptName);
  const upcomingDept = upcomingName ? await prisma.department.findUnique({ where: { name: upcomingName } }) : null;

  await prisma.$transaction(async (tx) => {
    await tx.leadDepartmentHistory.update({
      where: { id: stage.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        assignedToId: stage.assignedToId ?? session.user.id,
      },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: { currentDepartmentId: upcomingDept?.id ?? null },
    });

    if (upcomingDept) {
      await tx.leadDepartmentHistory.create({
        data: { leadId: lead.id, departmentId: upcomingDept.id, status: "PENDING" },
      });
      await createRequiredDocuments(tx, lead.id, upcomingDept.name);
    }
  });

  await logActivity({
    userId: session.user.id,
    action: "DEPARTMENT_STAGE_COMPLETED",
    entityType: "Lead",
    entityId: lead.id,
    details: { department: currentDeptName, next: upcomingName },
  });

  revalidatePath("/queue");
  revalidatePath(`/leads/${lead.id}`);
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import type { ActionState } from "@/lib/action-state";
import { createTaskSchema, updateTaskStatusSchema } from "@/lib/validation/task";

export async function createTask(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (session?.user.role !== "ADMIN") return { error: "Only admin can assign tasks." };

  const parsed = createTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      assignedToId: data.assignedToId,
      assignedById: session.user.id,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      priority: data.priority ?? "MEDIUM",
      leadId: data.leadId || null,
    },
  });

  await logActivity({
    userId: session.user.id,
    action: "TASK_CREATED",
    entityType: "Task",
    entityId: task.id,
    details: { title: task.title, assignedToId: task.assignedToId },
  });

  revalidatePath("/tasks");
  return {};
}

export async function updateTaskStatus(taskId: string, status: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");

  const parsed = updateTaskStatusSchema.safeParse({ taskId, status });
  if (!parsed.success) throw new Error("Invalid status.");

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found.");
  if (session.user.role !== "ADMIN" && task.assignedToId !== session.user.id) {
    throw new Error("You do not have access to this task.");
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: parsed.data.status } });

  await logActivity({
    userId: session.user.id,
    action: "TASK_STATUS_CHANGED",
    entityType: "Task",
    entityId: taskId,
    details: { status: parsed.data.status },
  });

  revalidatePath("/tasks");
}

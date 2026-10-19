"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { nextDepartmentName } from "@/lib/department-pipeline";
import { createRequiredDocuments } from "@/lib/document-requirements";
import type { ActionState } from "@/lib/action-state";
import {
  addFollowUpSchema,
  assignLeadSchema,
  createLeadSchema,
  updateStatusSchema,
} from "@/lib/validation/lead";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input";
}

async function assertCanAccessLead(leadId: string, userId: string, role: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { lead: null, allowed: false };
  const allowed = role === "ADMIN" || lead.assignedToId === userId;
  return { lead, allowed };
}

export async function createLead(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SALES") {
    return { error: "You do not have permission to create leads." };
  }

  const parsed = createLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  const assignedToId = session.user.role === "SALES" ? session.user.id : data.assignedToId || null;

  const lead = await prisma.lead.create({
    data: {
      customerName: data.customerName,
      phone: data.phone,
      email: data.email || null,
      address: data.address || null,
      productCategory: data.productCategory || null,
      requirementNotes: data.requirementNotes || null,
      budget: data.budget === "" || data.budget === undefined ? null : data.budget,
      source: data.source || null,
      assignedToId,
      createdById: session.user.id,
    },
  });

  await logActivity({
    userId: session.user.id,
    action: "LEAD_CREATED",
    entityType: "Lead",
    entityId: lead.id,
    details: { customerName: lead.customerName },
  });

  revalidatePath("/leads");
  redirect(`/leads/${lead.id}`);
}

export async function addFollowUp(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = addFollowUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  const { lead, allowed } = await assertCanAccessLead(data.leadId, session.user.id, session.user.role);
  if (!lead || !allowed) return { error: "You do not have access to this lead." };

  await prisma.followUp.create({
    data: {
      leadId: data.leadId,
      userId: session.user.id,
      note: data.note,
      nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null,
      outcome: data.outcome || null,
    },
  });

  await logActivity({
    userId: session.user.id,
    action: "FOLLOW_UP_ADDED",
    entityType: "Lead",
    entityId: data.leadId,
  });

  revalidatePath(`/leads/${data.leadId}`);
  return {};
}

export async function updateLeadStatus(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  const { lead, allowed } = await assertCanAccessLead(data.leadId, session.user.id, session.user.role);
  if (!lead || !allowed) return { error: "You do not have access to this lead." };

  const isFirstConversion = data.status === "CONVERTED" && !lead.currentDepartmentId && !lead.convertedAt;

  if (isFirstConversion) {
    const salesDept = await prisma.department.findUnique({ where: { name: "Sales" } });
    const nextDeptName = nextDepartmentName("Sales");
    const nextDept = nextDeptName ? await prisma.department.findUnique({ where: { name: nextDeptName } }) : null;

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: data.leadId },
        data: {
          status: data.status,
          convertedAt: new Date(),
          currentDepartmentId: nextDept?.id ?? null,
        },
      });

      if (salesDept) {
        await tx.leadDepartmentHistory.create({
          data: {
            leadId: data.leadId,
            departmentId: salesDept.id,
            assignedToId: lead.assignedToId,
            status: "COMPLETED",
            enteredAt: lead.createdAt,
            completedAt: new Date(),
          },
        });
      }

      if (nextDept) {
        await tx.leadDepartmentHistory.create({
          data: {
            leadId: data.leadId,
            departmentId: nextDept.id,
            status: "PENDING",
          },
        });
        await createRequiredDocuments(tx, data.leadId, nextDept.name);
      }
    });
  } else {
    await prisma.lead.update({
      where: { id: data.leadId },
      data: { status: data.status },
    });
  }

  await logActivity({
    userId: session.user.id,
    action: "LEAD_STATUS_CHANGED",
    entityType: "Lead",
    entityId: data.leadId,
    details: { from: lead.status, to: data.status },
  });

  revalidatePath(`/leads/${data.leadId}`);
  revalidatePath("/leads");
  return {};
}

export async function assignLead(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") return { error: "Only admin can reassign leads." };

  const parsed = assignLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  const rep = await prisma.user.findUnique({ where: { id: data.assignedToId } });
  if (!rep || rep.role !== "SALES" || !rep.active) {
    return { error: "Choose an active sales rep to assign this lead to." };
  }

  await prisma.lead.update({
    where: { id: data.leadId },
    data: { assignedToId: data.assignedToId },
  });

  await logActivity({
    userId: session.user.id,
    action: "LEAD_REASSIGNED",
    entityType: "Lead",
    entityId: data.leadId,
    details: { assignedToId: data.assignedToId },
  });

  revalidatePath(`/leads/${data.leadId}`);
  revalidatePath("/leads");
  return {};
}

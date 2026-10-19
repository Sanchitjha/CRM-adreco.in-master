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
import { pushLeadToZoho } from "@/lib/zoho";

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

export async function logWhatsAppInteraction(params: {
  leadId: string;
  phone: string;
  message: string;
  templateId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "Unauthorized" };

  await prisma.followUp.create({
    data: {
      leadId: params.leadId,
      userId: session.user.id,
      note: `[WhatsApp Message] ${params.message}`,
      outcome: "Message sent via WhatsApp",
    },
  });

  await logActivity({
    userId: session.user.id,
    action: "WHATSAPP_MESSAGE_SENT",
    entityType: "Lead",
    entityId: params.leadId,
    details: { phone: params.phone, template: params.templateId },
  });

  revalidatePath(`/leads/${params.leadId}`);
  revalidatePath("/leads");
  return { success: true };
}

export async function quickMoveLeadStage(
  leadId: string,
  newStatus: import("@prisma/client").LeadStatus
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "Unauthorized" };

  const { lead, allowed } = await assertCanAccessLead(leadId, session.user.id, session.user.role);
  if (!lead || !allowed) return { success: false, error: "Access denied" };

  const isFirstConversion = newStatus === "CONVERTED" && !lead.currentDepartmentId && !lead.convertedAt;

  if (isFirstConversion) {
    const salesDept = await prisma.department.findUnique({ where: { name: "Sales" } });
    const nextDeptName = nextDepartmentName("Sales");
    const nextDept = nextDeptName ? await prisma.department.findUnique({ where: { name: nextDeptName } }) : null;

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: {
          status: newStatus,
          convertedAt: new Date(),
          currentDepartmentId: nextDept?.id ?? null,
        },
      });

      if (salesDept) {
        await tx.leadDepartmentHistory.create({
          data: {
            leadId,
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
            leadId,
            departmentId: nextDept.id,
            status: "PENDING",
          },
        });
        await createRequiredDocuments(tx, leadId, nextDept.name);
      }
    });
  } else {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: newStatus },
    });
  }

  await logActivity({
    userId: session.user.id,
    action: "LEAD_STATUS_CHANGED",
    entityType: "Lead",
    entityId: leadId,
    details: { from: lead.status, to: newStatus },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { success: true };
}

export async function syncLeadToZohoAction(
  leadId: string
): Promise<{ success: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, message: "Unauthorized" };

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { success: false, message: "Lead not found" };

  const result = await pushLeadToZoho({
    id: lead.id,
    customerName: lead.customerName,
    phone: lead.phone,
    email: lead.email,
    productCategory: lead.productCategory,
    budget: lead.budget ? Number(lead.budget) : null,
    source: lead.source,
    address: lead.address,
  });

  if (result.success) {
    await logActivity({
      userId: session.user.id,
      action: "LEAD_SYNCED_TO_ZOHO",
      entityType: "Lead",
      entityId: leadId,
      details: { zohoId: result.zohoId },
    });
  }

  return {
    success: result.success,
    message: result.success
      ? `Lead successfully synced to Zoho CRM! (Zoho ID: ${result.zohoId || "Created"})`
      : result.message || "Failed to sync to Zoho CRM",
  };
}



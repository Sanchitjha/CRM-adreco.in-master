"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser, type SessionUser } from "@/lib/action-auth";
import { canManage } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { isFieldTechnician } from "@/lib/people";
import { nextNumber } from "@/lib/sequence";
import {
  buildInstallChecklist,
  newChecklistId,
  parseInstallChecklist,
  parseSerialList,
} from "@/lib/lifecycle";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import {
  checklistOpSchema,
  createInstallationSchema,
  linkSerialsSchema,
  signOffSchema,
  unlinkSerialSchema,
  updateInstallationSchema,
  updateInstallationStatusSchema,
} from "@/lib/validation/installation";

const DENIED: ActionState = { error: "You do not have permission to manage installations." };
const MAX_CHECKLIST_ITEMS = 40;

/** Loads a job and decides whether this user may work on it: managers always, a technician on their own job. */
async function loadJob(id: string, user: SessionUser) {
  const job = await prisma.installation.findUnique({
    where: { id },
    include: { lead: true, commissioning: true },
  });
  if (!job) return { job: null, error: "Installation job not found." } as const;
  if (!canSeeLead(user.role, user.id, job.lead)) return { job: null, error: "You do not have access to this job." } as const;
  const mayOperate = canManage(user.role, "installations") || job.technicianId === user.id;
  if (!mayOperate) return { job: null, error: "You do not have permission to change this job." } as const;
  return { job, error: null } as const;
}

function revalidateJob(id: string) {
  revalidatePath("/installations");
  revalidatePath(`/installations/${id}`);
  revalidatePath("/commissioning");
  revalidatePath("/serial-numbers");
}

export async function createInstallation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "installations")) return DENIED;

  const parsed = createInstallationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const lead = await prisma.lead.findUnique({ where: { id: d.leadId } });
  if (!lead) return { error: "That customer no longer exists." };

  const orderId = textOrNull(d.salesOrderId);
  if (orderId) {
    const order = await prisma.salesOrder.findUnique({ where: { id: orderId }, select: { leadId: true, status: true } });
    if (!order || order.leadId !== lead.id) return { error: "That order does not belong to this customer." };
    if (order.status === "CANCELLED") return { error: "That order has been cancelled." };
  }

  const technicianId = textOrNull(d.technicianId);
  if (technicianId && !(await isFieldTechnician(technicianId))) {
    return { error: "Choose an active installation or service team member." };
  }

  const scheduledFor = dateOrNull(d.scheduledFor);

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.installation.create({
      data: {
        jobNumber: await nextNumber("INS", tx),
        leadId: lead.id,
        salesOrderId: orderId,
        createdById: user.id,
        technicianId,
        status: scheduledFor ? "SCHEDULED" : "PENDING",
        siteAddress: textOrNull(d.siteAddress) ?? lead.address,
        contactPerson: textOrNull(d.contactPerson) ?? lead.customerName,
        contactPhone: textOrNull(d.contactPhone) ?? lead.phone,
        scheduledFor,
        checklist: buildInstallChecklist(),
      },
    });

    // The first job on an order takes over the units that were dispatched against it.
    if (orderId) {
      const others = await tx.installation.count({
        where: { salesOrderId: orderId, id: { not: created.id }, status: { not: "CANCELLED" } },
      });
      if (others === 0) {
        await tx.serialNumber.updateMany({
          where: { salesOrderId: orderId, status: "DISPATCHED", installationId: null },
          data: { installationId: created.id },
        });
      }
    }
    return created;
  });

  await logActivity({
    userId: user.id,
    action: "INSTALLATION_CREATED",
    entityType: "Installation",
    entityId: job.id,
    details: { jobNumber: job.jobNumber, leadId: lead.id },
  });

  revalidateJob(job.id);
  redirect(`/installations/${job.id}`);
}

export async function updateInstallation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = updateInstallationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const { job, error } = await loadJob(d.installationId, user);
  if (!job) return { error };

  const technicianId = textOrNull(d.technicianId);
  if (technicianId && technicianId !== job.technicianId && !(await isFieldTechnician(technicianId))) {
    return { error: "Choose an active installation or service team member." };
  }
  // Only managers can reassign a job; a technician can update the site details and remarks.
  const reassign = canManage(user.role, "installations");

  const scheduledFor = dateOrNull(d.scheduledFor);
  let status = job.status;
  if (scheduledFor && status === "PENDING") status = "SCHEDULED";
  if (!scheduledFor && status === "SCHEDULED") status = "PENDING";

  await prisma.installation.update({
    where: { id: job.id },
    data: {
      siteAddress: textOrNull(d.siteAddress),
      contactPerson: textOrNull(d.contactPerson),
      contactPhone: textOrNull(d.contactPhone),
      scheduledFor,
      technicianId: reassign ? technicianId : job.technicianId,
      remarks: textOrNull(d.remarks),
      status,
    },
  });
  await logActivity({ userId: user.id, action: "INSTALLATION_UPDATED", entityType: "Installation", entityId: job.id });

  revalidateJob(job.id);
  return { message: "Job details saved." };
}

export async function updateInstallationStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = updateInstallationStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { installationId, status } = parsed.data;

  const { job, error } = await loadJob(installationId, user);
  if (!job) return { error };
  const from = job.status;
  if (from === status) return {};

  if (status === "COMPLETED") {
    const items = parseInstallChecklist(job.checklist);
    if (items.length === 0 || items.some((i) => !i.done)) return { error: "Tick every checklist item before completing the job." };
    if (!job.customerSignedBy) return { error: "Record the customer's sign-off before completing the job." };
  }
  if (from === "COMPLETED" && job.commissioning) {
    return { error: "Commissioning has already been started for this job, so it cannot be reopened." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.installation.update({
      where: { id: job.id },
      data: {
        status,
        startedAt: status === "IN_PROGRESS" && !job.startedAt ? now : undefined,
        completedAt: status === "COMPLETED" ? now : from === "COMPLETED" ? null : undefined,
      },
    });
    if (status === "COMPLETED") {
      await tx.serialNumber.updateMany({
        where: { installationId: job.id, status: "DISPATCHED" },
        data: { status: "INSTALLED", installedAt: now },
      });
    }
    if (from === "COMPLETED") {
      await tx.serialNumber.updateMany({
        where: { installationId: job.id, status: "INSTALLED" },
        data: { status: "DISPATCHED", installedAt: null },
      });
    }
    if (status === "CANCELLED") {
      await tx.serialNumber.updateMany({
        where: { installationId: job.id, status: "DISPATCHED" },
        data: { installationId: null },
      });
    }
  });

  await logActivity({
    userId: user.id,
    action: "INSTALLATION_STATUS_CHANGED",
    entityType: "Installation",
    entityId: job.id,
    details: { from, to: status },
  });

  revalidateJob(job.id);
  return {};
}

export async function updateChecklist(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = checklistOpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };
  const { installationId, op, itemId, label } = parsed.data;

  const { job, error } = await loadJob(installationId, user);
  if (!job) return { error };
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return { error: "Reopen the job before changing its checklist." };
  }

  let items = parseInstallChecklist(job.checklist);
  if (op === "toggle") {
    items = items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i));
  } else if (op === "remove") {
    items = items.filter((i) => i.id !== itemId);
  } else {
    const text = textOrNull(label);
    if (!text) return { error: "Enter the checklist item." };
    if (items.length >= MAX_CHECKLIST_ITEMS) return { error: `A checklist can have at most ${MAX_CHECKLIST_ITEMS} items.` };
    items = [...items, { id: newChecklistId(), label: text, done: false }];
  }

  await prisma.installation.update({ where: { id: job.id }, data: { checklist: items } });

  revalidatePath(`/installations/${job.id}`);
  revalidatePath("/installations");
  return op === "add" ? { message: "Item added." } : {};
}

export async function recordSignOff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = signOffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const { job, error } = await loadJob(parsed.data.installationId, user);
  if (!job) return { error };
  if (job.status === "CANCELLED") return { error: "This job was cancelled." };

  await prisma.installation.update({
    where: { id: job.id },
    data: { customerSignedBy: parsed.data.signedBy, customerSignedAt: new Date() },
  });
  await logActivity({
    userId: user.id,
    action: "CUSTOMER_SIGN_OFF_RECORDED",
    entityType: "Installation",
    entityId: job.id,
    details: { note: parsed.data.signedBy },
  });

  revalidatePath(`/installations/${job.id}`);
  return { message: "Customer sign-off recorded." };
}

export async function linkSerials(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = linkSerialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const { job, error } = await loadJob(parsed.data.installationId, user);
  if (!job) return { error };
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return { error: "Reopen the job before changing its equipment." };
  }

  const wanted = parseSerialList(parsed.data.serials);
  const units = await prisma.serialNumber.findMany({ where: { serialNo: { in: wanted } } });
  const found = new Set(units.map((u) => u.serialNo));
  const missing = wanted.filter((s) => !found.has(s));
  if (missing.length > 0) return { error: `Not registered: ${missing.slice(0, 5).join(", ")}.` };

  const wrongOwner = units.filter((u) => u.leadId !== job.leadId);
  if (wrongOwner.length > 0) {
    return { error: `Not dispatched to this customer: ${wrongOwner.slice(0, 5).map((u) => u.serialNo).join(", ")}.` };
  }
  const wrongState = units.filter((u) => u.status !== "DISPATCHED");
  if (wrongState.length > 0) {
    return { error: `Already installed or not dispatched: ${wrongState.slice(0, 5).map((u) => u.serialNo).join(", ")}.` };
  }

  await prisma.serialNumber.updateMany({
    where: { id: { in: units.map((u) => u.id) } },
    data: { installationId: job.id },
  });
  await logActivity({
    userId: user.id,
    action: "EQUIPMENT_LINKED",
    entityType: "Installation",
    entityId: job.id,
    details: { note: units.map((u) => u.serialNo).join(", ") },
  });

  revalidateJob(job.id);
  return { message: `${units.length} unit${units.length === 1 ? "" : "s"} linked to this job.` };
}

export async function unlinkSerial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = unlinkSerialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const { job, error } = await loadJob(parsed.data.installationId, user);
  if (!job) return { error };
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return { error: "Reopen the job before changing its equipment." };
  }

  const unit = await prisma.serialNumber.findUnique({ where: { id: parsed.data.serialId } });
  if (!unit || unit.installationId !== job.id) return { error: "That unit is not on this job." };

  await prisma.serialNumber.update({ where: { id: unit.id }, data: { installationId: null } });

  revalidateJob(job.id);
  return {};
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser, type SessionUser } from "@/lib/action-auth";
import { FIELD_ROLES, canManage } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { isFieldTechnician } from "@/lib/people";
import { nextNumber } from "@/lib/sequence";
import { today } from "@/lib/dates";
import { buildCommissioningChecklist, parseCommissioningChecklist, warrantyEndsOn } from "@/lib/lifecycle";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import {
  commissioningDetailsSchema,
  completeCommissioningSchema,
  setCheckSchema,
  startCommissioningSchema,
} from "@/lib/validation/commissioning";

const DENIED: ActionState = { error: "You do not have permission to commission equipment." };

async function loadReport(id: string, user: SessionUser) {
  const report = await prisma.commissioning.findUnique({
    where: { id },
    include: { installation: { include: { lead: true, serialNumbers: { include: { product: true } } } } },
  });
  if (!report) return { report: null, error: "Commissioning report not found." } as const;
  if (!canSeeLead(user.role, user.id, report.installation.lead)) {
    return { report: null, error: "You do not have access to this report." } as const;
  }
  const mayOperate = canManage(user.role, "commissioning") || report.engineerId === user.id;
  if (!mayOperate) return { report: null, error: "You do not have permission to change this report." } as const;
  return { report, error: null } as const;
}

function revalidateReport(id: string, installationId?: string) {
  revalidatePath("/commissioning");
  revalidatePath(`/commissioning/${id}`);
  revalidatePath("/serial-numbers");
  revalidatePath("/warranty");
  if (installationId) revalidatePath(`/installations/${installationId}`);
}

export async function startCommissioning(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "commissioning")) return DENIED;

  const parsed = startCommissioningSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const job = await prisma.installation.findUnique({
    where: { id: parsed.data.installationId },
    include: { lead: true, commissioning: true },
  });
  if (!job) return { error: "Installation job not found." };
  if (!canSeeLead(user.role, user.id, job.lead)) return { error: "You do not have access to this job." };
  if (job.commissioning) return { error: "Commissioning has already been started for this job." };
  if (job.status !== "COMPLETED") return { error: "Complete the installation before commissioning it." };

  const report = await prisma.$transaction(async (tx) =>
    tx.commissioning.create({
      data: {
        reportNumber: await nextNumber("COM", tx),
        installationId: job.id,
        engineerId: FIELD_ROLES.includes(user.role) ? user.id : null,
        checklist: buildCommissioningChecklist(),
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "COMMISSIONING_STARTED",
    entityType: "Commissioning",
    entityId: report.id,
    details: { reportNumber: report.reportNumber, jobNumber: job.jobNumber },
  });

  revalidateReport(report.id, job.id);
  redirect(`/commissioning/${report.id}`);
}

export async function setCheck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = setCheckSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { commissioningId, itemId, result, reading } = parsed.data;

  const { report, error } = await loadReport(commissioningId, user);
  if (!report) return { error };
  if (report.status === "COMPLETED") return { error: "This report is complete." };

  const items = parseCommissioningChecklist(report.checklist).map((i) =>
    i.id === itemId ? { ...i, result, reading: textOrNull(reading) ?? "" } : i,
  );
  await prisma.commissioning.update({ where: { id: report.id }, data: { checklist: items } });

  revalidatePath(`/commissioning/${report.id}`);
  return { message: "Saved." };
}

export async function saveCommissioningDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = commissioningDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const { report, error } = await loadReport(d.commissioningId, user);
  if (!report) return { error };
  if (report.status === "COMPLETED") return { error: "This report is complete." };

  const engineerId = textOrNull(d.engineerId);
  const canReassign = canManage(user.role, "commissioning");
  if (canReassign && engineerId && engineerId !== report.engineerId && !(await isFieldTechnician(engineerId))) {
    return { error: "Choose an active installation or service team member." };
  }

  const approvedBy = textOrNull(d.customerApprovedBy);
  await prisma.commissioning.update({
    where: { id: report.id },
    data: {
      engineerId: canReassign ? engineerId : report.engineerId,
      customerDemoDone: d.customerDemoDone === "on",
      customerApprovedBy: approvedBy,
      customerApprovedAt: approvedBy ? (report.customerApprovedBy === approvedBy ? report.customerApprovedAt : new Date()) : null,
      engineerRemarks: textOrNull(d.engineerRemarks),
    },
  });

  revalidatePath(`/commissioning/${report.id}`);
  return { message: "Saved." };
}

export async function completeCommissioning(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = completeCommissioningSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const { report, error } = await loadReport(parsed.data.commissioningId, user);
  if (!report) return { error };
  if (report.status === "COMPLETED") return { error: "This report is already complete." };

  const items = parseCommissioningChecklist(report.checklist);
  if (items.length === 0 || items.some((i) => i.result !== "PASS")) {
    return { error: "Every checklist item must be marked Pass before commissioning can be completed." };
  }
  if (!report.customerDemoDone) return { error: "Confirm that the customer demonstration was given." };
  if (!report.customerApprovedBy) return { error: "Record who approved the system on the customer's side." };

  const todayDate = today();
  const commissionedOn = dateOrNull(parsed.data.commissionedOn) ?? todayDate;
  if (commissionedOn.getTime() > todayDate.getTime()) return { error: "The commissioning date cannot be in the future." };

  const units = report.installation.serialNumbers.filter((u) => u.status === "INSTALLED" || u.status === "DISPATCHED");

  await prisma.$transaction(async (tx) => {
    await tx.commissioning.update({
      where: { id: report.id },
      data: { status: "COMPLETED", commissionedOn },
    });
    // Commissioning starts each unit's warranty clock, for the period set on its product.
    for (const unit of units) {
      await tx.serialNumber.update({
        where: { id: unit.id },
        data: {
          status: "COMMISSIONED",
          installedAt: unit.installedAt ?? commissionedOn,
          commissionedAt: commissionedOn,
          warrantyStartsOn: commissionedOn,
          warrantyEndsOn: warrantyEndsOn(commissionedOn, unit.product.warrantyMonths),
        },
      });
    }
  });

  await logActivity({
    userId: user.id,
    action: "COMMISSIONING_COMPLETED",
    entityType: "Commissioning",
    entityId: report.id,
    details: { units: units.length },
  });

  revalidateReport(report.id, report.installationId);
  return {
    message:
      units.length > 0
        ? `Commissioning complete. Warranty has started for ${units.length} unit${units.length === 1 ? "" : "s"}.`
        : "Commissioning complete. No equipment was linked to the installation, so no warranty was started.",
  };
}

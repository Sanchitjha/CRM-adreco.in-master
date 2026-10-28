"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import { canManage } from "@/lib/rbac";
import { nextNumber } from "@/lib/sequence";
import { today } from "@/lib/dates";
import { isInWarranty } from "@/lib/lifecycle";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import {
  createClaimSchema,
  decideClaimSchema,
  resolveClaimSchema,
  updateWarrantyDatesSchema,
} from "@/lib/validation/warranty";

function revalidateClaim(id: string) {
  revalidatePath("/warranty");
  revalidatePath(`/warranty/claims/${id}`);
}

export async function createClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "warranty")) return { error: "Only the service team can raise warranty claims." };

  const parsed = createClaimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const unit = await prisma.serialNumber.findUnique({ where: { id: d.serialNumberId } });
  if (!unit) return { error: "That machine no longer exists." };
  if (!isInWarranty(unit.warrantyEndsOn, today())) {
    return { error: "This machine is not under warranty, so a warranty claim cannot be raised." };
  }

  const ticketId = textOrNull(d.ticketId);
  if (ticketId) {
    const ticket = await prisma.serviceTicket.findUnique({ where: { id: ticketId }, select: { serialNumberId: true } });
    if (!ticket || ticket.serialNumberId !== unit.id) return { error: "That ticket is not for this machine." };
  }

  const claim = await prisma.$transaction(async (tx) =>
    tx.warrantyClaim.create({
      data: {
        claimNumber: await nextNumber("WC", tx),
        serialNumberId: unit.id,
        ticketId,
        issue: d.issue,
        claimedParts: textOrNull(d.claimedParts),
        createdById: user.id,
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "WARRANTY_CLAIM_RAISED",
    entityType: "WarrantyClaim",
    entityId: claim.id,
    details: { claimNumber: claim.claimNumber, serialNo: unit.serialNo },
  });

  revalidateClaim(claim.id);
  redirect(`/warranty/claims/${claim.id}`);
}

export async function decideClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Only an administrator can approve or reject a warranty claim." };

  const parsed = decideClaimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const claim = await prisma.warrantyClaim.findUnique({ where: { id: d.claimId } });
  if (!claim) return { error: "Claim not found." };
  if (claim.status !== "SUBMITTED") return { error: "This claim has already been decided." };
  if (d.decision === "REJECTED" && !textOrNull(d.decisionNote)) return { error: "Give a reason for rejecting the claim." };

  await prisma.warrantyClaim.update({
    where: { id: claim.id },
    data: { status: d.decision, decisionNote: textOrNull(d.decisionNote), decidedById: user.id, decidedAt: new Date() },
  });
  await logActivity({
    userId: user.id,
    action: "WARRANTY_CLAIM_DECIDED",
    entityType: "WarrantyClaim",
    entityId: claim.id,
    details: { from: claim.status, to: d.decision, note: textOrNull(d.decisionNote) ?? "" },
  });

  revalidateClaim(claim.id);
  return {};
}

export async function resolveClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "warranty")) return { error: "Only the service team can resolve warranty claims." };

  const parsed = resolveClaimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const claim = await prisma.warrantyClaim.findUnique({ where: { id: parsed.data.claimId } });
  if (!claim) return { error: "Claim not found." };
  if (claim.status !== "APPROVED") return { error: "Only an approved claim can be resolved." };

  await prisma.warrantyClaim.update({
    where: { id: claim.id },
    data: { status: "RESOLVED", resolution: parsed.data.resolution, resolvedAt: new Date() },
  });
  await logActivity({
    userId: user.id,
    action: "WARRANTY_CLAIM_RESOLVED",
    entityType: "WarrantyClaim",
    entityId: claim.id,
    details: { from: claim.status, to: "RESOLVED" },
  });

  revalidateClaim(claim.id);
  return {};
}

/** Lets an administrator correct or extend a unit's warranty (for example, a goodwill extension). */
export async function updateWarrantyDates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Only an administrator can change warranty dates." };

  const parsed = updateWarrantyDatesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const starts = dateOrNull(parsed.data.warrantyStartsOn);
  const ends = dateOrNull(parsed.data.warrantyEndsOn);
  if (!starts || !ends) return { error: "Enter valid dates." };
  if (ends.getTime() < starts.getTime()) return { error: "The warranty cannot end before it starts." };

  const unit = await prisma.serialNumber.findUnique({ where: { id: parsed.data.serialId } });
  if (!unit) return { error: "Serial number not found." };

  await prisma.serialNumber.update({
    where: { id: unit.id },
    data: { warrantyStartsOn: starts, warrantyEndsOn: ends },
  });
  await logActivity({
    userId: user.id,
    action: "WARRANTY_DATES_CHANGED",
    entityType: "SerialNumber",
    entityId: unit.id,
    details: { note: `${parsed.data.warrantyStartsOn} to ${parsed.data.warrantyEndsOn}` },
  });

  revalidatePath("/warranty");
  revalidatePath(`/serial-numbers/${unit.id}`);
  return { message: "Warranty dates updated." };
}

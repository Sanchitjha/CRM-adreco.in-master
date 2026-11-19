"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import { canEditMachines, canManage } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import { parseSerialList, warrantyEndsOn } from "@/lib/lifecycle";
import { isRecordedMachine } from "@/lib/installed-base";
import {
  MAX_SERIALS_PER_BATCH,
  registerSerialsSchema,
  serialIdSchema,
  updateMachineSchema,
  updateSerialSchema,
} from "@/lib/validation/serial";

const DENIED: ActionState = { error: "You do not have permission to manage serial numbers." };
const DENIED_EDIT: ActionState = { error: "You do not have permission to change machines." };

export async function registerSerials(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "serials")) return DENIED;

  const parsed = registerSerialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const serials = parseSerialList(d.serials);
  if (serials.length === 0) return { error: "Enter at least one serial number." };
  if (serials.length > MAX_SERIALS_PER_BATCH) {
    return { error: `Register at most ${MAX_SERIALS_PER_BATCH} serial numbers at a time.` };
  }

  const product = await prisma.product.findUnique({ where: { id: d.productId } });
  if (!product) return { error: "Choose a product." };
  if (product.isSparePart) return { error: "Spare parts are counted by quantity, not by serial number." };

  const commissionedOn = dateOrNull(d.commissionedOn);
  const leadId = textOrNull(d.leadId);
  if (commissionedOn && !leadId) return { error: "Choose the customer the unit was commissioned for." };
  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) return { error: "That customer no longer exists." };
  }

  const clashes = await prisma.serialNumber.findMany({
    where: { serialNo: { in: serials } },
    select: { serialNo: true },
  });
  if (clashes.length > 0) {
    const shown = clashes.slice(0, 5).map((c) => c.serialNo).join(", ");
    const more = clashes.length > 5 ? ` and ${clashes.length - 5} more` : "";
    return { error: `Already registered: ${shown}${more}. Remove them and try again.` };
  }

  // A unit registered against a customer is an existing installation; commissioning it starts the warranty.
  const status = leadId ? (commissionedOn ? "COMMISSIONED" : "INSTALLED") : "IN_STOCK";
  const warrantyEnds = commissionedOn ? warrantyEndsOn(commissionedOn, product.warrantyMonths) : null;

  await prisma.serialNumber.createMany({
    data: serials.map((serialNo) => ({
      serialNo,
      productId: product.id,
      status,
      manufacturedOn: dateOrNull(d.manufacturedOn),
      leadId,
      installedAt: leadId ? (commissionedOn ?? new Date()) : null,
      commissionedAt: commissionedOn,
      warrantyStartsOn: commissionedOn,
      warrantyEndsOn: warrantyEnds,
      notes: textOrNull(d.notes),
    })),
  });

  const created = await prisma.serialNumber.findMany({
    where: { serialNo: { in: serials } },
    select: { id: true },
  });
  await Promise.all(
    created.map((c) =>
      logActivity({
        userId: user.id,
        action: "SERIAL_REGISTERED",
        entityType: "SerialNumber",
        entityId: c.id,
        details: { product: product.name },
      }),
    ),
  );

  revalidatePath("/serial-numbers");
  revalidatePath(`/products/${product.id}`);
  redirect(created.length === 1 ? `/serial-numbers/${created[0].id}` : `/serial-numbers?productId=${product.id}`);
}

export async function updateSerial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "serials")) return DENIED;

  const parsed = updateSerialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const serial = await prisma.serialNumber.findUnique({ where: { id: d.serialId }, select: { id: true } });
  if (!serial) return { error: "Serial number not found." };

  await prisma.serialNumber.update({
    where: { id: d.serialId },
    data: { manufacturedOn: dateOrNull(d.manufacturedOn), notes: textOrNull(d.notes) },
  });
  await logActivity({ userId: user.id, action: "SERIAL_UPDATED", entityType: "SerialNumber", entityId: d.serialId });

  revalidatePath(`/serial-numbers/${d.serialId}`);
  return { message: "Saved." };
}

/** Takes an unused unit out of circulation, or returns it to stock. Units already with a customer cannot be scrapped. */
export async function toggleSerialScrapped(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "serials")) return DENIED;

  const parsed = serialIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const serial = await prisma.serialNumber.findUnique({ where: { id: parsed.data.serialId } });
  if (!serial) return { error: "Serial number not found." };
  if (serial.status !== "IN_STOCK" && serial.status !== "SCRAPPED") {
    return { error: "Only units that are still in stock can be scrapped." };
  }

  const next = serial.status === "IN_STOCK" ? "SCRAPPED" : "IN_STOCK";
  await prisma.serialNumber.update({ where: { id: serial.id }, data: { status: next } });
  await logActivity({
    userId: user.id,
    action: "SERIAL_STATUS_CHANGED",
    entityType: "SerialNumber",
    entityId: serial.id,
    details: { from: serial.status, to: next },
  });

  revalidatePath("/serial-numbers");
  revalidatePath(`/serial-numbers/${serial.id}`);
  return {};
}

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

/**
 * Corrects a machine: its serial number, its dates and notes, and (for a machine that was recorded by hand, with no
 * order or installation job behind it) its model and customer. The warranty dates of a machine that came through an
 * order stay with administrators, as before.
 */
export async function updateMachine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canEditMachines(user.role)) return DENIED_EDIT;

  const parsed = updateMachineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const machine = await prisma.serialNumber.findUnique({
    where: { id: d.serialId },
    include: { amcUnits: { include: { amc: { select: { contractNumber: true } } } } },
  });
  if (!machine) return { error: "Machine not found." };
  const recorded = isRecordedMachine(machine);
  const changed: string[] = [];
  const data: Prisma.SerialNumberUncheckedUpdateInput = {};

  if (d.serialNo !== machine.serialNo) {
    const clash = await prisma.serialNumber.findFirst({
      where: { id: { not: machine.id }, serialNo: { equals: d.serialNo, mode: "insensitive" } },
      select: { serialNo: true },
    });
    if (clash) return { error: `The serial number ${clash.serialNo} is already used by another machine.` };
    data.serialNo = d.serialNo;
    changed.push("serial number");
  }

  if (d.productId && d.productId !== machine.productId) {
    if (!recorded) return { error: "The model of a machine that came through an order or an installation job cannot be changed here." };
    const product = await prisma.product.findUnique({ where: { id: d.productId }, select: { id: true, isSparePart: true } });
    if (!product || product.isSparePart) return { error: "Choose a machine model from the list." };
    data.productId = product.id;
    changed.push("model");
  }

  if (d.leadId && d.leadId !== machine.leadId) {
    if (!recorded) return { error: "The customer of a machine that came through an order or an installation job cannot be changed here." };
    if (machine.amcUnits.length > 0) {
      return { error: `This machine is covered by contract ${machine.amcUnits[0].amc.contractNumber}. Take it off the contract first, then change its customer.` };
    }
    const lead = await prisma.lead.findUnique({ where: { id: d.leadId }, select: { id: true } });
    if (!lead) return { error: "That customer no longer exists." };
    data.leadId = lead.id;
    changed.push("customer");
  }

  const installedAt = dateOrNull(d.installedAt);
  const commissionedAt = dateOrNull(d.commissionedAt);
  const startsOn = dateOrNull(d.warrantyStartsOn);
  const endsOn = dateOrNull(d.warrantyEndsOn);
  if (machine.status === "COMMISSIONED" && !commissionedAt) return { error: "A commissioned machine needs its commissioning date." };
  if (!!startsOn !== !!endsOn) return { error: "Enter both the day the warranty starts and the day it ends, or leave both empty." };
  if (startsOn && endsOn && endsOn.getTime() < startsOn.getTime()) return { error: "The warranty cannot end before it starts." };

  if (iso(installedAt) !== iso(machine.installedAt)) {
    data.installedAt = installedAt;
    changed.push("installation date");
  }
  if (iso(commissionedAt) !== iso(machine.commissionedAt)) {
    data.commissionedAt = commissionedAt;
    changed.push("commissioning date");
  }
  if (iso(startsOn) !== iso(machine.warrantyStartsOn) || iso(endsOn) !== iso(machine.warrantyEndsOn)) {
    if (user.role !== "ADMIN" && !recorded) {
      return { error: "Only an administrator can change the warranty dates of a machine that came through an order or an installation job." };
    }
    data.warrantyStartsOn = startsOn;
    data.warrantyEndsOn = endsOn;
    changed.push("warranty dates");
  }
  const manufacturedOn = dateOrNull(d.manufacturedOn);
  if (iso(manufacturedOn) !== iso(machine.manufacturedOn)) {
    data.manufacturedOn = manufacturedOn;
    changed.push("manufacturing date");
  }
  const notes = textOrNull(d.notes);
  if (notes !== machine.notes) {
    data.notes = notes;
    changed.push("notes");
  }

  if (changed.length === 0) return { message: "Nothing was changed." };

  await prisma.serialNumber.update({ where: { id: machine.id }, data });
  await logActivity({
    userId: user.id,
    action: "SERIAL_UPDATED",
    entityType: "SerialNumber",
    entityId: machine.id,
    details: { note: `Changed: ${changed.join(", ")}` },
  });

  revalidatePath("/serial-numbers");
  revalidatePath(`/serial-numbers/${machine.id}`);
  revalidatePath("/warranty");
  revalidatePath("/amc");
  redirect(`/serial-numbers/${machine.id}`);
}

/**
 * Removes a machine that was recorded by hand by mistake, together with the contract coverage it had. Only for an
 * administrator, and only when no order, job, ticket or claim depends on it.
 */
export async function removeMachine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Only an administrator can remove a machine." };

  const parsed = serialIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const machine = await prisma.serialNumber.findUnique({
    where: { id: parsed.data.serialId },
    include: { amcUnits: true, _count: { select: { tickets: true, claims: true } } },
  });
  if (!machine) return { error: "Machine not found." };
  if (!isRecordedMachine(machine)) return { error: "A machine that came through an order or an installation job cannot be removed." };
  if (machine._count.tickets > 0 || machine._count.claims > 0) {
    return { error: "This machine has service tickets or warranty claims, so it cannot be removed." };
  }

  const contractIds = [...new Set(machine.amcUnits.map((u) => u.amcId))];
  await prisma.$transaction(async (tx) => {
    await tx.amcUnit.deleteMany({ where: { serialNumberId: machine.id } });
    // A contract left with no machines at all has nothing to maintain, so it goes too.
    for (const amcId of contractIds) {
      const left = await tx.amcUnit.count({ where: { amcId } });
      if (left === 0) await tx.amcContract.delete({ where: { id: amcId } });
    }
    await tx.serialNumber.delete({ where: { id: machine.id } });
  });
  await logActivity({
    userId: user.id,
    action: "SERIAL_REMOVED",
    entityType: "SerialNumber",
    entityId: machine.id,
    details: { note: machine.serialNo },
  });

  revalidatePath("/serial-numbers");
  revalidatePath("/warranty");
  revalidatePath("/amc");
  redirect("/warranty?view=all");
}

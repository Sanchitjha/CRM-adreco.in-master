"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import { canManage } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import { parseSerialList, warrantyEndsOn } from "@/lib/lifecycle";
import {
  MAX_SERIALS_PER_BATCH,
  registerSerialsSchema,
  serialIdSchema,
  updateSerialSchema,
} from "@/lib/validation/serial";

const DENIED: ActionState = { error: "You do not have permission to manage serial numbers." };

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

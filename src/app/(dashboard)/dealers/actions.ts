"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import { canManage, canManageDealerFinance } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import {
  addTargetSchema,
  dealerIdSchema,
  dealerSchema,
  outstandingSchema,
  setStockSchema,
  targetIdSchema,
  updateDealerSchema,
} from "@/lib/validation/dealer";

const DENIED: ActionState = { error: "You do not have permission to manage dealers." };
const FINANCE_DENIED: ActionState = { error: "Only admin and accounts can change targets and balances." };

function dealerData(d: ReturnType<typeof dealerSchema.parse>) {
  return {
    name: d.name,
    code: textOrNull(d.code),
    contactPerson: textOrNull(d.contactPerson),
    phone: textOrNull(d.phone),
    email: textOrNull(d.email),
    address: textOrNull(d.address),
    city: textOrNull(d.city),
    state: textOrNull(d.state),
    territory: textOrNull(d.territory),
    gstin: textOrNull(d.gstin),
    notes: textOrNull(d.notes),
  };
}

function isDuplicateCode(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function revalidateDealer(id: string) {
  revalidatePath("/dealers");
  revalidatePath(`/dealers/${id}`);
}

export async function createDealer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "dealers")) return DENIED;

  const parsed = dealerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  let id: string;
  try {
    id = (await prisma.dealer.create({ data: dealerData(parsed.data) })).id;
  } catch (err) {
    if (isDuplicateCode(err)) return { error: `Dealer code “${parsed.data.code}” is already used.` };
    throw err;
  }

  await logActivity({
    userId: user.id,
    action: "DEALER_CREATED",
    entityType: "Dealer",
    entityId: id,
    details: { name: parsed.data.name },
  });
  revalidatePath("/dealers");
  redirect(`/dealers/${id}`);
}

export async function updateDealer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "dealers")) return DENIED;

  const parsed = updateDealerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { dealerId, ...rest } = parsed.data;

  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId }, select: { id: true } });
  if (!dealer) return { error: "Dealer not found." };

  try {
    await prisma.dealer.update({ where: { id: dealerId }, data: dealerData(rest) });
  } catch (err) {
    if (isDuplicateCode(err)) return { error: `Dealer code “${rest.code}” is already used.` };
    throw err;
  }

  await logActivity({ userId: user.id, action: "DEALER_UPDATED", entityType: "Dealer", entityId: dealerId });
  revalidateDealer(dealerId);
  redirect(`/dealers/${dealerId}`);
}

export async function toggleDealerActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "dealers")) return DENIED;

  const parsed = dealerIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const dealer = await prisma.dealer.findUnique({ where: { id: parsed.data.dealerId } });
  if (!dealer) return { error: "Dealer not found." };

  await prisma.dealer.update({ where: { id: dealer.id }, data: { active: !dealer.active } });
  await logActivity({
    userId: user.id,
    action: dealer.active ? "DEALER_DEACTIVATED" : "DEALER_REACTIVATED",
    entityType: "Dealer",
    entityId: dealer.id,
  });
  revalidateDealer(dealer.id);
  return {};
}

export async function addTarget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManageDealerFinance(user.role)) return FINANCE_DENIED;

  const parsed = addTargetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const start = dateOrNull(d.startDate);
  const end = dateOrNull(d.endDate);
  if (!start || !end) return { error: "Enter valid dates." };
  if (end.getTime() < start.getTime()) return { error: "The period cannot end before it starts." };

  const dealer = await prisma.dealer.findUnique({ where: { id: d.dealerId }, select: { id: true } });
  if (!dealer) return { error: "Dealer not found." };

  await prisma.dealerTarget.create({
    data: {
      dealerId: dealer.id,
      periodLabel: d.periodLabel,
      startDate: start,
      endDate: end,
      targetAmount: d.targetAmount,
      incentivePct: d.incentivePct ?? 0,
    },
  });
  await logActivity({
    userId: user.id,
    action: "DEALER_TARGET_ADDED",
    entityType: "Dealer",
    entityId: dealer.id,
    details: { note: d.periodLabel },
  });

  revalidateDealer(dealer.id);
  return { message: "Target added." };
}

export async function deleteTarget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManageDealerFinance(user.role)) return FINANCE_DENIED;

  const parsed = targetIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const target = await prisma.dealerTarget.findUnique({ where: { id: parsed.data.targetId } });
  if (!target) return { error: "Target not found." };

  await prisma.dealerTarget.delete({ where: { id: target.id } });
  await logActivity({
    userId: user.id,
    action: "DEALER_TARGET_REMOVED",
    entityType: "Dealer",
    entityId: target.dealerId,
    details: { note: target.periodLabel },
  });

  revalidateDealer(target.dealerId);
  return {};
}

export async function setDealerStock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "dealers")) return DENIED;

  const parsed = setStockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { dealerId, productId, quantity } = parsed.data;

  const [dealer, product] = await Promise.all([
    prisma.dealer.findUnique({ where: { id: dealerId }, select: { id: true } }),
    prisma.product.findUnique({ where: { id: productId }, select: { name: true } }),
  ]);
  if (!dealer) return { error: "Dealer not found." };
  if (!product) return { error: "Product not found." };

  await prisma.dealerStock.upsert({
    where: { dealerId_productId: { dealerId, productId } },
    create: { dealerId, productId, quantity },
    update: { quantity },
  });
  await logActivity({
    userId: user.id,
    action: "DEALER_STOCK_SET",
    entityType: "Dealer",
    entityId: dealerId,
    details: { note: `${product.name}: ${quantity}` },
  });

  revalidateDealer(dealerId);
  return { message: `Stock of ${product.name} set to ${quantity}.` };
}

export async function updateOutstanding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManageDealerFinance(user.role)) return FINANCE_DENIED;

  const parsed = outstandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const dealer = await prisma.dealer.findUnique({ where: { id: parsed.data.dealerId } });
  if (!dealer) return { error: "Dealer not found." };

  await prisma.dealer.update({
    where: { id: dealer.id },
    data: { outstandingBalance: parsed.data.outstandingBalance },
  });
  await logActivity({
    userId: user.id,
    action: "DEALER_BALANCE_UPDATED",
    entityType: "Dealer",
    entityId: dealer.id,
    details: { from: String(dealer.outstandingBalance), to: String(parsed.data.outstandingBalance) },
  });

  revalidateDealer(dealer.id);
  return { message: "Outstanding balance updated." };
}

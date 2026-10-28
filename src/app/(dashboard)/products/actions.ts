"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import { canManage } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";
import { DEFAULT_WARRANTY_MONTHS } from "@/lib/lifecycle";
import { firstIssueMessage, textOrNull } from "@/lib/validation/common";
import { adjustStockSchema, productIdSchema, productSchema, updateProductSchema } from "@/lib/validation/product";

const DENIED: ActionState = { error: "You do not have permission to change the product catalog." };

function productData(d: ReturnType<typeof productSchema.parse>) {
  return {
    name: d.name,
    modelCode: d.modelCode,
    category: textOrNull(d.category),
    series: textOrNull(d.series),
    description: textOrNull(d.description),
    isSparePart: d.isSparePart === "on",
    heatingCapacityKw: d.heatingCapacityKw ?? null,
    inputPowerKw: d.inputPowerKw ?? null,
    cop: d.cop ?? null,
    refrigerant: textOrNull(d.refrigerant),
    compressor: textOrNull(d.compressor),
    operatingRange: textOrNull(d.operatingRange),
    heatExchanger: textOrNull(d.heatExchanger),
    warrantyMonths: d.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS,
    dealerPrice: d.dealerPrice ?? null,
    customerPrice: d.customerPrice ?? null,
    stockQty: d.stockQty ?? 0,
    datasheetUrl: textOrNull(d.datasheetUrl),
  };
}

function isDuplicateModel(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "products")) return DENIED;

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  let id: string;
  try {
    const product = await prisma.product.create({ data: productData(parsed.data) });
    id = product.id;
  } catch (err) {
    if (isDuplicateModel(err)) return { error: `A product with model code “${parsed.data.modelCode}” already exists.` };
    throw err;
  }

  await logActivity({
    userId: user.id,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: id,
    details: { name: parsed.data.name, modelCode: parsed.data.modelCode },
  });
  revalidatePath("/products");
  redirect(`/products/${id}`);
}

export async function updateProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "products")) return DENIED;

  const parsed = updateProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { productId, ...rest } = parsed.data;

  const existing = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!existing) return { error: "Product not found." };

  try {
    await prisma.product.update({ where: { id: productId }, data: productData(rest) });
  } catch (err) {
    if (isDuplicateModel(err)) return { error: `Another product already uses model code “${rest.modelCode}”.` };
    throw err;
  }

  await logActivity({ userId: user.id, action: "PRODUCT_UPDATED", entityType: "Product", entityId: productId });
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

export async function toggleProductActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "products")) return DENIED;

  const parsed = productIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product) return { error: "Product not found." };

  await prisma.product.update({ where: { id: product.id }, data: { active: !product.active } });
  await logActivity({
    userId: user.id,
    action: product.active ? "PRODUCT_DEACTIVATED" : "PRODUCT_REACTIVATED",
    entityType: "Product",
    entityId: product.id,
  });
  revalidatePath("/products");
  revalidatePath(`/products/${product.id}`);
  return {};
}

export async function adjustStock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "products")) return DENIED;

  const parsed = adjustStockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { productId, delta, note } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { stockQty: true } });
  if (!product) return { error: "Product not found." };

  // A removal only goes through while enough stock remains, so two people can never take the same unit.
  const result = await prisma.product.updateMany({
    where: { id: productId, ...(delta < 0 ? { stockQty: { gte: -delta } } : {}) },
    data: { stockQty: { increment: delta } },
  });
  if (result.count === 0) {
    return { error: `Only ${product.stockQty} in stock — you cannot remove ${-delta}.` };
  }

  await logActivity({
    userId: user.id,
    action: "STOCK_ADJUSTED",
    entityType: "Product",
    entityId: productId,
    details: { from: String(product.stockQty), to: String(product.stockQty + delta), note: textOrNull(note) ?? "" },
  });
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  return { message: `Stock is now ${product.stockQty + delta}.` };
}

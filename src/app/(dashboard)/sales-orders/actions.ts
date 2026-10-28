"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser, type SessionUser } from "@/lib/action-auth";
import { canManage } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { nextNumber } from "@/lib/sequence";
import { ensureLeadConverted } from "@/lib/lead-conversion";
import { parseSerialList } from "@/lib/lifecycle";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import {
  attachSerialsSchema,
  convertQuotationSchema,
  detachSerialSchema,
  updateDispatchSchema,
  updateOrderDetailsSchema,
  updateOrderStatusSchema,
} from "@/lib/validation/order";

const DENIED: ActionState = { error: "You do not have permission to manage sales orders." };

/** The order, if it exists and this user may work on it (sales reps only on their own leads). */
async function loadOrder(orderId: string, user: SessionUser) {
  const order = await prisma.salesOrder.findUnique({ where: { id: orderId }, include: { lead: true } });
  if (!order) return { order: null, error: "Sales order not found." };
  if (!canSeeLead(user.role, user.id, order.lead)) return { order: null, error: "You do not have access to this order." };
  return { order, error: null };
}

function revalidateOrder(orderId: string, leadId?: string) {
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${orderId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

export async function convertQuotationToOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "salesOrders")) return DENIED;

  const parsed = convertQuotationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const quote = await prisma.quotation.findUnique({
    where: { id: parsed.data.quotationId },
    include: { items: true, lead: true, siteSurvey: true, salesOrder: true },
  });
  if (!quote) return { error: "Quotation not found." };
  if (!canSeeLead(user.role, user.id, quote.lead)) return { error: "You do not have access to this quotation." };
  if (quote.salesOrder) return { error: `Already converted to order ${quote.salesOrder.orderNumber}.` };
  if (quote.status !== "ACCEPTED") return { error: "Only an accepted quotation can be converted to a sales order." };

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextNumber("SO", tx);
    return tx.salesOrder.create({
      data: {
        orderNumber,
        leadId: quote.leadId,
        quotationId: quote.id,
        createdById: user.id,
        billingAddress: quote.lead.address,
        shippingAddress: quote.siteSurvey?.siteAddress ?? quote.lead.address,
        subtotal: quote.subtotal,
        discountPct: quote.discountPct,
        gstPct: quote.gstPct,
        installationCharge: quote.installationCharge,
        transportCharge: quote.transportCharge,
        grandTotal: quote.grandTotal,
        items: {
          create: quote.items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          })),
        },
      },
    });
  });

  const converted = await ensureLeadConverted(quote.leadId);

  await logActivity({
    userId: user.id,
    action: "SALES_ORDER_CREATED",
    entityType: "SalesOrder",
    entityId: order.id,
    details: { orderNumber: order.orderNumber, quoteNumber: quote.quoteNumber, leadConverted: converted },
  });

  revalidatePath("/leads");
  revalidatePath(`/quotations/${quote.id}`);
  revalidateOrder(order.id, quote.leadId);
  redirect(`/sales-orders/${order.id}`);
}

export async function updateOrderDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "salesOrders")) return DENIED;

  const parsed = updateOrderDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const { order, error } = await loadOrder(d.orderId, user);
  if (!order) return { error };

  const received = d.amountReceived ?? 0;
  if (received > Number(order.grandTotal)) return { error: "The amount received cannot be more than the order total." };

  await prisma.salesOrder.update({
    where: { id: order.id },
    data: {
      deliveryDate: dateOrNull(d.deliveryDate),
      paymentTerms: textOrNull(d.paymentTerms),
      customerPoNumber: textOrNull(d.customerPoNumber),
      billingAddress: textOrNull(d.billingAddress),
      shippingAddress: textOrNull(d.shippingAddress),
      amountReceived: received,
      notes: textOrNull(d.notes),
    },
  });
  await logActivity({ userId: user.id, action: "SALES_ORDER_UPDATED", entityType: "SalesOrder", entityId: order.id });

  revalidateOrder(order.id);
  return { message: "Order details saved." };
}

export async function updateDispatchDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "salesOrders")) return DENIED;

  const parsed = updateDispatchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const { order, error } = await loadOrder(d.orderId, user);
  if (!order) return { error };

  await prisma.salesOrder.update({
    where: { id: order.id },
    data: {
      transporter: textOrNull(d.transporter),
      lrNumber: textOrNull(d.lrNumber),
      ewayBillNo: textOrNull(d.ewayBillNo),
    },
  });
  await logActivity({ userId: user.id, action: "DISPATCH_DETAILS_UPDATED", entityType: "SalesOrder", entityId: order.id });

  revalidateOrder(order.id);
  return { message: "Dispatch details saved." };
}

export async function updateOrderStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "salesOrders")) return DENIED;

  const parsed = updateOrderStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { orderId, status } = parsed.data;

  const { order, error } = await loadOrder(orderId, user);
  if (!order) return { error };
  if (order.status === status) return {};

  const now = new Date();

  if (status === "CANCELLED") {
    const inUse = await prisma.serialNumber.count({
      where: { salesOrderId: order.id, status: { in: ["INSTALLED", "COMMISSIONED"] } },
    });
    if (inUse > 0) return { error: "Units from this order are already installed, so it cannot be cancelled." };
  }

  await prisma.$transaction(async (tx) => {
    if (status === "CANCELLED") {
      // Units that were only dispatched go back to stock.
      await tx.serialNumber.updateMany({
        where: { salesOrderId: order.id, status: "DISPATCHED" },
        data: { salesOrderId: null, leadId: null, status: "IN_STOCK", dispatchedAt: null, installationId: null },
      });
    }
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status,
        dispatchedAt: (status === "DISPATCHED" || status === "DELIVERED") && !order.dispatchedAt ? now : undefined,
        deliveredAt: status === "DELIVERED" ? now : undefined,
      },
    });
  });

  await logActivity({
    userId: user.id,
    action: "SALES_ORDER_STATUS_CHANGED",
    entityType: "SalesOrder",
    entityId: order.id,
    details: { from: order.status, to: status },
  });

  revalidatePath("/serial-numbers");
  revalidateOrder(order.id, order.leadId);
  return {};
}

export async function attachSerials(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "salesOrders")) return DENIED;

  const parsed = attachSerialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const { order, error } = await loadOrder(parsed.data.orderId, user);
  if (!order) return { error };
  if (order.status === "CANCELLED" || order.status === "DELIVERED") {
    return { error: `A ${order.status.toLowerCase()} order cannot take more units.` };
  }

  const wanted = parseSerialList(parsed.data.serials);
  const units = await prisma.serialNumber.findMany({ where: { serialNo: { in: wanted } } });

  const found = new Set(units.map((u) => u.serialNo));
  const missing = wanted.filter((s) => !found.has(s));
  if (missing.length > 0) {
    return { error: `Not registered: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}. Register them under Serial numbers first.` };
  }
  const unavailable = units.filter((u) => u.status !== "IN_STOCK");
  if (unavailable.length > 0) {
    return {
      error: `Not in stock: ${unavailable
        .slice(0, 5)
        .map((u) => `${u.serialNo} (${u.status.toLowerCase().replace("_", " ")})`)
        .join(", ")}.`,
    };
  }

  const now = new Date();
  await prisma.serialNumber.updateMany({
    where: { id: { in: units.map((u) => u.id) } },
    data: { salesOrderId: order.id, leadId: order.leadId, status: "DISPATCHED", dispatchedAt: now },
  });

  await Promise.all([
    logActivity({
      userId: user.id,
      action: "SERIALS_DISPATCHED",
      entityType: "SalesOrder",
      entityId: order.id,
      details: { count: units.length },
    }),
    ...units.map((u) =>
      logActivity({
        userId: user.id,
        action: "SERIAL_DISPATCHED",
        entityType: "SerialNumber",
        entityId: u.id,
        details: { order: order.orderNumber },
      }),
    ),
  ]);

  revalidatePath("/serial-numbers");
  revalidateOrder(order.id);
  return { message: `${units.length} unit${units.length === 1 ? "" : "s"} dispatched on this order.` };
}

export async function detachSerial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "salesOrders")) return DENIED;

  const parsed = detachSerialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const { order, error } = await loadOrder(parsed.data.orderId, user);
  if (!order) return { error };

  const unit = await prisma.serialNumber.findUnique({ where: { id: parsed.data.serialId } });
  if (!unit || unit.salesOrderId !== order.id) return { error: "That unit is not on this order." };
  if (unit.status !== "DISPATCHED") return { error: "Only units that have not been installed can be taken off the order." };

  await prisma.serialNumber.update({
    where: { id: unit.id },
    data: { salesOrderId: null, leadId: null, status: "IN_STOCK", dispatchedAt: null, installationId: null },
  });
  await logActivity({
    userId: user.id,
    action: "SERIAL_RETURNED_TO_STOCK",
    entityType: "SerialNumber",
    entityId: unit.id,
    details: { order: order.orderNumber },
  });

  revalidatePath("/serial-numbers");
  revalidateOrder(order.id);
  return {};
}

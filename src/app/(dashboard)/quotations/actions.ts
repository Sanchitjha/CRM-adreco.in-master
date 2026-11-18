"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { canAccessQuotations } from "@/lib/rbac";
import { canEditQuotation } from "@/lib/scope";
import { stripEchoedFigures } from "@/lib/quotation-lines";
import { nextNumber } from "@/lib/sequence";
import type { ActionState } from "@/lib/action-state";
import {
  createQuotationSchema,
  updateQuotationSchema,
  updateQuoteStatusSchema,
  quoteItemsSchema,
  computeQuoteTotals,
} from "@/lib/validation/quotation";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input";
}

/**
 * The line items from the form's JSON, checked. A description that ends in a copy of the line's own quantity, rate and
 * amount (a table row pasted into it) is tidied, so those figures are not printed twice.
 */
function readItems(itemsJson: string): { items: z.infer<typeof quoteItemsSchema> } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(itemsJson);
  } catch {
    return { error: "Could not read the line items." };
  }
  const parsed = quoteItemsSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  return {
    items: parsed.data.map((i) => ({ ...i, description: stripEchoedFigures(i.description, i.quantity, i.unitPrice) })),
  };
}

/** ADMIN & DESIGN can quote any lead; SALES only leads assigned to them. */
async function canQuoteLead(leadId: string, userId: string, role: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true } });
  if (!lead) return false;
  if (role === "ADMIN" || role === "DESIGN") return true;
  if (role === "SALES") return lead.assignedToId === userId;
  return false;
}

/**
 * Quotes share the atomic document counter used by orders and jobs, so two people saving at once can't collide and
 * deleting a quote can't reuse its number. Quotes numbered before the counter existed (from a row count) are
 * respected: the first number issued for a year carries on from the highest one already in use.
 */
async function nextQuoteNumber(): Promise<string> {
  const now = new Date();
  const key = `Q-${now.getFullYear()}`;
  return prisma.$transaction(async (tx) => {
    if (!(await tx.sequence.findUnique({ where: { key } }))) {
      const latest = await tx.quotation.findFirst({
        where: { quoteNumber: { startsWith: `${key}-` } },
        orderBy: { quoteNumber: "desc" },
        select: { quoteNumber: true },
      });
      const floor = Number(latest?.quoteNumber.split("-").pop()) || 0;
      await tx.sequence.upsert({ where: { key }, create: { key, value: floor }, update: {} });
    }
    return nextNumber("Q", tx, now);
  });
}

export async function createQuotation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessQuotations(session.user.role)) {
    return { error: "You do not have permission to create quotations." };
  }

  const parsed = createQuotationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  const read = readItems(data.itemsJson);
  if ("error" in read) return { error: read.error };
  const items = read.items;

  if (!(await canQuoteLead(data.leadId, session.user.id, session.user.role))) {
    return { error: "You do not have access to that lead." };
  }

  // Only link a survey that belongs to this lead.
  let siteSurveyId: string | null = null;
  if (data.siteSurveyId) {
    const survey = await prisma.siteSurvey.findUnique({
      where: { id: data.siteSurveyId },
      select: { leadId: true },
    });
    if (survey && survey.leadId === data.leadId) siteSurveyId = data.siteSurveyId;
  }

  const totals = computeQuoteTotals({
    items,
    discountPct: data.discountPct,
    gstPct: data.gstPct,
    installationCharge: data.installationCharge,
    transportCharge: data.transportCharge,
  });

  const quoteNumber = await nextQuoteNumber();

  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber,
      leadId: data.leadId,
      siteSurveyId,
      createdById: session.user.id,
      discountPct: data.discountPct ?? 0,
      gstPct: data.gstPct ?? 18,
      installationCharge: data.installationCharge ?? 0,
      transportCharge: data.transportCharge ?? 0,
      subtotal: totals.subtotal,
      grandTotal: totals.grandTotal,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      notes: data.notes || null,
      terms: data.terms || null,
      items: {
        create: items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: Math.round(i.quantity * i.unitPrice * 100) / 100,
        })),
      },
    },
  });

  await logActivity({
    userId: session.user.id,
    action: "QUOTATION_CREATED",
    entityType: "Quotation",
    entityId: quotation.id,
    details: { quoteNumber, leadId: data.leadId, grandTotal: totals.grandTotal },
  });

  revalidatePath("/quotations");
  revalidatePath(`/leads/${data.leadId}`);
  redirect(`/quotations/${quotation.id}`);
}

/**
 * Changes a saved quotation: its lines, discount, GST, charges, validity, notes and terms. The lead, the number and the
 * status stay as they are. Not possible once the quotation has been turned into a sales order, because the order holds
 * a copy of its amounts.
 */
export async function updateQuotation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessQuotations(session.user.role)) {
    return { error: "You do not have permission to change quotations." };
  }

  const parsed = updateQuotationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  const read = readItems(data.itemsJson);
  if ("error" in read) return { error: read.error };
  const items = read.items;

  const quote = await prisma.quotation.findUnique({
    where: { id: data.quoteId },
    select: { id: true, quoteNumber: true, leadId: true, createdById: true, grandTotal: true, salesOrder: { select: { orderNumber: true } } },
  });
  if (!quote) return { error: "Quotation not found." };
  if (!canEditQuotation(session.user.role, session.user.id, quote)) {
    return { error: "You can only change quotations you created." };
  }
  if (quote.salesOrder) {
    return { error: `This quotation has already become sales order ${quote.salesOrder.orderNumber}, so it can no longer be changed.` };
  }

  const totals = computeQuoteTotals({
    items,
    discountPct: data.discountPct,
    gstPct: data.gstPct,
    installationCharge: data.installationCharge,
    transportCharge: data.transportCharge,
  });

  // The old lines are replaced by the new ones in one step, so the quotation is never left half-changed.
  await prisma.$transaction(async (tx) => {
    await tx.quotationItem.deleteMany({ where: { quotationId: quote.id } });
    await tx.quotation.update({
      where: { id: quote.id },
      data: {
        discountPct: data.discountPct ?? 0,
        gstPct: data.gstPct ?? 18,
        installationCharge: data.installationCharge ?? 0,
        transportCharge: data.transportCharge ?? 0,
        subtotal: totals.subtotal,
        grandTotal: totals.grandTotal,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: data.notes || null,
        terms: data.terms || null,
        items: {
          create: items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: Math.round(i.quantity * i.unitPrice * 100) / 100,
          })),
        },
      },
    });
  });

  await logActivity({
    userId: session.user.id,
    action: "QUOTATION_UPDATED",
    entityType: "Quotation",
    entityId: quote.id,
    details: { quoteNumber: quote.quoteNumber, grandTotalBefore: Number(quote.grandTotal), grandTotalAfter: totals.grandTotal },
  });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quote.id}`);
  revalidatePath(`/leads/${quote.leadId}`);
  redirect(`/quotations/${quote.id}`);
}

export async function updateQuoteStatus(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessQuotations(session.user.role)) {
    return { error: "You do not have permission to update quotations." };
  }

  const parsed = updateQuoteStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  const quote = await prisma.quotation.findUnique({
    where: { id: data.quoteId },
    select: { leadId: true, createdById: true, status: true },
  });
  if (!quote) return { error: "Quotation not found." };

  if (session.user.role === "SALES" && quote.createdById !== session.user.id) {
    return { error: "You can only update quotations you created." };
  }

  await prisma.quotation.update({
    where: { id: data.quoteId },
    data: { status: data.status },
  });

  await logActivity({
    userId: session.user.id,
    action: "QUOTATION_STATUS_CHANGED",
    entityType: "Quotation",
    entityId: data.quoteId,
    details: { from: quote.status, to: data.status },
  });

  revalidatePath(`/quotations/${data.quoteId}`);
  revalidatePath("/quotations");
  revalidatePath(`/leads/${quote.leadId}`);
  return {};
}

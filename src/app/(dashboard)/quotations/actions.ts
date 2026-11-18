"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { canAccessQuotations } from "@/lib/rbac";
import { canEditQuotation, canSeeQuotation } from "@/lib/scope";
import { nextNumber } from "@/lib/sequence";
import type { ActionState } from "@/lib/action-state";
import {
  createQuotationSchema,
  updateQuoteStatusSchema,
  quoteItemsSchema,
  computeQuoteTotals,
  type QuoteItemInput,
} from "@/lib/validation/quotation";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input";
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

type ParsedQuotationForm = {
  data: z.infer<typeof createQuotationSchema>;
  items: QuoteItemInput[];
  totals: ReturnType<typeof computeQuoteTotals>;
};

/** Reads the quotation form (used to create and to edit): the fields, the line items and the totals worked from them. */
function parseQuotationForm(formData: FormData): { error: string } | ParsedQuotationForm {
  const parsed = createQuotationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(data.itemsJson);
  } catch {
    return { error: "Could not read the line items." };
  }
  const itemsParsed = quoteItemsSchema.safeParse(rawItems);
  if (!itemsParsed.success) return { error: firstIssueMessage(itemsParsed.error.issues) };
  const items = itemsParsed.data;

  const totals = computeQuoteTotals({
    items,
    discountPct: data.discountPct,
    gstPct: data.gstPct,
    installationCharge: data.installationCharge,
    transportCharge: data.transportCharge,
  });
  return { data, items, totals };
}

const lineItemRows = (items: QuoteItemInput[]) =>
  items.map((i) => ({
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: Math.round(i.quantity * i.unitPrice * 100) / 100,
  }));

export async function createQuotation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessQuotations(session.user.role)) {
    return { error: "You do not have permission to create quotations." };
  }

  const form = parseQuotationForm(formData);
  if ("error" in form) return form;
  const { data, items, totals } = form;

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
      items: { create: lineItemRows(items) },
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
 * Changes a saved quotation: its line items, charges, validity, notes and terms. The customer and the quotation number
 * stay as they are. A quotation that has become a sales order is no longer edited, because the order already holds
 * its prices; change the order instead.
 */
export async function updateQuotation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { role, id: userId } = session.user;
  if (!canAccessQuotations(role)) return { error: "You do not have permission to edit quotations." };

  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return { error: "Quotation not found." };

  const quote = await prisma.quotation.findUnique({
    where: { id: quoteId },
    include: { lead: { select: { assignedToId: true } }, salesOrder: { select: { orderNumber: true } } },
  });
  if (!quote || !canSeeQuotation(role, userId, quote)) return { error: "Quotation not found." };
  if (!canEditQuotation(role, userId, quote)) return { error: "You can only edit quotations you created." };
  if (quote.salesOrder) {
    return { error: `This quotation became sales order ${quote.salesOrder.orderNumber}, so it can no longer be edited.` };
  }

  const form = parseQuotationForm(formData);
  if ("error" in form) return form;
  const { data, items, totals } = form;

  await prisma.$transaction([
    prisma.quotationItem.deleteMany({ where: { quotationId: quote.id } }),
    prisma.quotation.update({
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
        items: { create: lineItemRows(items) },
      },
    }),
  ]);

  await logActivity({
    userId,
    action: "QUOTATION_UPDATED",
    entityType: "Quotation",
    entityId: quote.id,
    details: {
      quoteNumber: quote.quoteNumber,
      grandTotal: { from: Number(quote.grandTotal), to: totals.grandTotal },
    },
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

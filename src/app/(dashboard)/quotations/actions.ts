"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { canAccessQuotations } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";
import {
  createQuotationSchema,
  updateQuoteStatusSchema,
  quoteItemsSchema,
  computeQuoteTotals,
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

async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  const latest = await prisma.quotation.findFirst({
    where: { quoteNumber: { startsWith: prefix } },
    orderBy: { quoteNumber: "desc" },
    select: { quoteNumber: true },
  });
  let seq = 1;
  if (latest?.quoteNumber) {
    const parts = latest.quoteNumber.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}${seq.toString().padStart(4, "0")}`;
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

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(data.itemsJson);
  } catch {
    return { error: "Could not read the line items." };
  }
  const itemsParsed = quoteItemsSchema.safeParse(rawItems);
  if (!itemsParsed.success) return { error: firstIssueMessage(itemsParsed.error.issues) };
  const items = itemsParsed.data;

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

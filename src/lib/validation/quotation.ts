import { z } from "zod";

export const QUOTE_STATUS_VALUES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const;

export const QUOTE_STATUS_LABELS: Record<(typeof QUOTE_STATUS_VALUES)[number], string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

/** A single line item as submitted from the form (via itemsJson). */
export const quoteItemSchema = z.object({
  description: z.string().trim().min(1, "Item description is required"),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  unitPrice: z.coerce.number().nonnegative("Unit price cannot be negative"),
});

export const quoteItemsSchema = z.array(quoteItemSchema).min(1, "Add at least one line item");

export type QuoteItemInput = z.infer<typeof quoteItemSchema>;

const pct = z.coerce.number().min(0).max(100).optional();
const money = z.coerce.number().min(0).optional();

export const createQuotationSchema = z.object({
  leadId: z.string().min(1, "Choose a lead"),
  siteSurveyId: z.string().trim().optional(),
  discountPct: pct,
  gstPct: pct,
  installationCharge: money,
  transportCharge: money,
  validUntil: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  itemsJson: z.string().min(1, "Add at least one line item"),
});

export const updateQuoteStatusSchema = z.object({
  quoteId: z.string().min(1),
  status: z.enum(QUOTE_STATUS_VALUES),
});

/** Totals computed from line items + charges, shared by the form preview and the server. */
export function computeQuoteTotals(input: {
  items: { quantity: number; unitPrice: number }[];
  discountPct?: number;
  gstPct?: number;
  installationCharge?: number;
  transportCharge?: number;
}) {
  const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const discountPct = input.discountPct ?? 0;
  const gstPct = input.gstPct ?? 0;
  const installationCharge = input.installationCharge ?? 0;
  const transportCharge = input.transportCharge ?? 0;

  const discountAmount = (subtotal * discountPct) / 100;
  const taxable = subtotal - discountAmount + installationCharge + transportCharge;
  const gstAmount = (taxable * gstPct) / 100;
  const grandTotal = taxable + gstAmount;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    installationCharge: round2(installationCharge),
    transportCharge: round2(transportCharge),
    taxable: round2(taxable),
    gstAmount: round2(gstAmount),
    grandTotal: round2(grandTotal),
  };
}

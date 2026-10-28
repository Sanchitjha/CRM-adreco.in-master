import { z } from "zod";
import {
  optionalNumber,
  optionalText,
  requiredDateString,
  requiredMoney,
} from "@/lib/validation/common";

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const dealerSchema = z.object({
  name: z.string().trim().min(1, "Dealer name is required"),
  code: optionalText,
  contactPerson: optionalText,
  phone: optionalText,
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
  address: optionalText,
  city: optionalText,
  state: optionalText,
  territory: optionalText,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || GSTIN.test(v), "Enter a valid 15-character GSTIN")
    .optional(),
  notes: optionalText,
});

export const updateDealerSchema = dealerSchema.extend({ dealerId: z.string().min(1) });

export const dealerIdSchema = z.object({ dealerId: z.string().min(1) });

export const addTargetSchema = z.object({
  dealerId: z.string().min(1),
  periodLabel: z.string().trim().min(1, "Name the period, e.g. FY 2026-27 Q3").max(80),
  startDate: requiredDateString("Enter the period start date"),
  endDate: requiredDateString("Enter the period end date"),
  targetAmount: requiredMoney("Enter the target amount").refine((n) => n > 0, "The target must be more than zero"),
  incentivePct: optionalNumber.refine((n) => n === undefined || n <= 100, "Incentive cannot be more than 100%"),
});

export const targetIdSchema = z.object({ targetId: z.string().min(1) });

export const setStockSchema = z.object({
  dealerId: z.string().min(1),
  productId: z.string().min(1, "Choose a product"),
  quantity: z.coerce.number({ error: "Enter the quantity" }).int("Enter a whole number").min(0, "Quantity cannot be negative"),
});

export const outstandingSchema = z.object({
  dealerId: z.string().min(1),
  outstandingBalance: requiredMoney("Enter the outstanding amount"),
});

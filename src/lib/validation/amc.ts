import { z } from "zod";
import { optionalText, requiredDateString, requiredMoney } from "@/lib/validation/common";

export const createAmcSchema = z.object({
  leadId: z.string().min(1, "Choose a customer"),
  startDate: requiredDateString("Enter the start date"),
  endDate: requiredDateString("Enter the end date"),
  visitsPerYear: z.coerce
    .number({ error: "Enter the number of visits per year" })
    .int("Enter a whole number")
    .min(1, "At least one visit a year")
    .max(52, "That is more than one visit a week"),
  amount: requiredMoney("Enter the contract amount"),
  coveredParts: optionalText,
  notes: optionalText,
});

export const amcIdSchema = z.object({ amcId: z.string().min(1) });

export const completeVisitSchema = z.object({
  visitId: z.string().min(1),
  technicianId: optionalText,
  notes: optionalText,
});

export const rescheduleVisitSchema = z.object({
  visitId: z.string().min(1),
  scheduledFor: requiredDateString("Enter the new date"),
});

export const visitIdSchema = z.object({ visitId: z.string().min(1) });

import { z } from "zod";
import { optionalText, requiredDateString } from "@/lib/validation/common";

export const createClaimSchema = z.object({
  serialNumberId: z.string().min(1, "Choose the machine"),
  ticketId: optionalText,
  issue: z.string().trim().min(1, "Describe the fault").max(500, "Keep the description under 500 characters"),
  claimedParts: optionalText,
});

export const decideClaimSchema = z.object({
  claimId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  decisionNote: optionalText,
});

export const resolveClaimSchema = z.object({
  claimId: z.string().min(1),
  resolution: z.string().trim().min(1, "Describe how the claim was resolved"),
});

export const updateWarrantyDatesSchema = z.object({
  serialId: z.string().min(1),
  warrantyStartsOn: requiredDateString("Enter the warranty start date"),
  warrantyEndsOn: requiredDateString("Enter the warranty end date"),
});

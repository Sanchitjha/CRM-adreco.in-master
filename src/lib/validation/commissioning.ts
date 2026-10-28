import { z } from "zod";
import { optionalDateString, optionalText } from "@/lib/validation/common";

export const startCommissioningSchema = z.object({ installationId: z.string().min(1) });

export const setCheckSchema = z.object({
  commissioningId: z.string().min(1),
  itemId: z.string().min(1),
  result: z.enum(["PENDING", "PASS", "FAIL"]),
  reading: optionalText,
});

export const commissioningDetailsSchema = z.object({
  commissioningId: z.string().min(1),
  engineerId: optionalText,
  customerDemoDone: z.string().optional(),
  customerApprovedBy: optionalText,
  engineerRemarks: optionalText,
});

export const completeCommissioningSchema = z.object({
  commissioningId: z.string().min(1),
  commissionedOn: optionalDateString,
});

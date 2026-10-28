import { z } from "zod";
import { optionalDateString, optionalText } from "@/lib/validation/common";

export const MAX_SERIALS_PER_BATCH = 200;

export const registerSerialsSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  serials: z.string().trim().min(1, "Enter at least one serial number"),
  manufacturedOn: optionalDateString,
  leadId: optionalText,
  commissionedOn: optionalDateString,
  notes: optionalText,
});

export const updateSerialSchema = z.object({
  serialId: z.string().min(1),
  manufacturedOn: optionalDateString,
  notes: optionalText,
});

export const serialIdSchema = z.object({ serialId: z.string().min(1) });

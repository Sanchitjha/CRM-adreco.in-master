import { z } from "zod";
import { OPTION_GROUP_KEYS } from "@/lib/settings";

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;

const optionalText = z.string().trim().optional();

export const companyProfileSchema = z.object({
  legalName: z.string().trim().min(1, "Legal name is required"),
  tradeName: optionalText,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || GSTIN.test(v), "Enter a valid 15-character GSTIN")
    .optional(),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || PAN.test(v), "Enter a valid 10-character PAN")
    .optional(),
  address: optionalText,
  city: optionalText,
  state: optionalText,
  pincode: optionalText,
  phone: optionalText,
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
  website: z.union([z.string().trim().url("Website must start with http:// or https://"), z.literal("")]).optional(),
  logoUrl: z.union([z.string().trim().url("Logo link must start with http:// or https://"), z.literal("")]).optional(),
  bankDetails: optionalText,
});

export const addOptionSchema = z.object({
  group: z.enum(OPTION_GROUP_KEYS as [string, ...string[]]),
  value: z.string().trim().min(1, "Enter a value").max(120, "Keep it under 120 characters"),
});

export const optionIdSchema = z.object({ id: z.string().min(1) });

export const slaSchema = z.object({
  CRITICAL: z.coerce.number().int().min(1, "Hours must be at least 1").max(2160),
  HIGH: z.coerce.number().int().min(1, "Hours must be at least 1").max(2160),
  MEDIUM: z.coerce.number().int().min(1, "Hours must be at least 1").max(2160),
  LOW: z.coerce.number().int().min(1, "Hours must be at least 1").max(2160),
});

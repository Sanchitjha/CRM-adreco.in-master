import { z } from "zod";

export const LEAD_STATUS_VALUES = ["NEW", "CONTACTED", "FOLLOW_UP", "QUOTED", "CONVERTED", "LOST"] as const;

export const PRODUCT_CATEGORIES = [
  "Commercial Heat Pump",
  "Domestic Heat Pump",
  "EVI Heat Pump",
  "Heat Pump Central Heating System",
  "Swimming Pool Heat Pump",
] as const;

export const createLeadSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required"),
  phone: z.string().trim().min(1, "Phone is required"),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
  address: z.string().trim().optional(),
  productCategory: z.string().trim().optional(),
  requirementNotes: z.string().trim().optional(),
  budget: z.union([z.coerce.number().positive(), z.literal("")]).optional(),
  source: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
  dealerId: z.string().trim().optional(),
  contactRole: z.string().trim().max(80).optional(),
  projectStage: z.string().trim().max(80).optional(),
  referredBy: z.string().trim().max(200).optional(),
  competitor: z.string().trim().max(120).optional(),
});

/** Another person on a lead's project: the owner, the site in-charge, the contractor, the architect. */
export const addContactSchema = z.object({
  leadId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  role: z.string().trim().max(80).optional(),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || v.replace(/\D/g, "").length >= 7, "That phone number looks too short")
    .optional(),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
});

export const addFollowUpSchema = z.object({
  leadId: z.string().min(1),
  note: z.string().trim().min(1, "Note is required"),
  nextFollowUpDate: z.string().trim().optional(),
  outcome: z.string().trim().optional(),
});

export const updateStatusSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(LEAD_STATUS_VALUES),
});

export const assignLeadSchema = z.object({
  leadId: z.string().min(1),
  assignedToId: z.string().min(1),
});

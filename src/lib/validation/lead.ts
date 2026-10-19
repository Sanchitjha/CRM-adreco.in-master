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

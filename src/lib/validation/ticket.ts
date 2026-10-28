import { z } from "zod";
import { optionalDateString, optionalText, requiredPositiveInt } from "@/lib/validation/common";

export const TICKET_STATUS_VALUES = ["OPEN", "ASSIGNED", "VISIT", "DIAGNOSIS", "PARTS", "REPAIR", "CLOSED"] as const;
export const TICKET_PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const createTicketSchema = z.object({
  leadId: z.string().min(1, "Choose a customer"),
  serialNumberId: optionalText,
  subject: z.string().trim().min(1, "Enter a short subject").max(160, "Keep the subject under 160 characters"),
  description: optionalText,
  complaintType: optionalText,
  priority: z.enum(TICKET_PRIORITY_VALUES),
  visitScheduledFor: optionalDateString,
});

export const assignTicketSchema = z.object({
  ticketId: z.string().min(1),
  technicianId: z.string().min(1, "Choose a technician"),
});

export const updateTicketStatusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(TICKET_STATUS_VALUES),
  note: optionalText,
});

export const ticketNotesSchema = z.object({
  ticketId: z.string().min(1),
  diagnosis: optionalText,
  resolution: optionalText,
  customerSignedOffBy: optionalText,
  visitScheduledFor: optionalDateString,
});

export const ticketIdSchema = z.object({ ticketId: z.string().min(1) });

export const addPartSchema = z.object({
  ticketId: z.string().min(1),
  productId: z.string().min(1, "Choose a spare part"),
  quantity: requiredPositiveInt("Enter a quantity of at least 1"),
});

export const removePartSchema = z.object({ partId: z.string().min(1) });

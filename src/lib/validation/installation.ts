import { z } from "zod";
import { optionalDateString, optionalText } from "@/lib/validation/common";

export const INSTALLATION_STATUS_VALUES = ["PENDING", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export const createInstallationSchema = z.object({
  leadId: z.string().min(1, "Choose a customer"),
  salesOrderId: optionalText,
  siteAddress: optionalText,
  contactPerson: optionalText,
  contactPhone: optionalText,
  scheduledFor: optionalDateString,
  technicianId: optionalText,
});

export const updateInstallationSchema = z.object({
  installationId: z.string().min(1),
  siteAddress: optionalText,
  contactPerson: optionalText,
  contactPhone: optionalText,
  scheduledFor: optionalDateString,
  technicianId: optionalText,
  remarks: optionalText,
});

export const updateInstallationStatusSchema = z.object({
  installationId: z.string().min(1),
  status: z.enum(INSTALLATION_STATUS_VALUES),
});

export const checklistOpSchema = z.object({
  installationId: z.string().min(1),
  op: z.enum(["toggle", "add", "remove"]),
  itemId: optionalText,
  label: optionalText,
});

export const linkSerialsSchema = z.object({
  installationId: z.string().min(1),
  serials: z.string().trim().min(1, "Enter at least one serial number"),
});

export const unlinkSerialSchema = z.object({ installationId: z.string().min(1), serialId: z.string().min(1) });

export const signOffSchema = z.object({
  installationId: z.string().min(1),
  signedBy: z.string().trim().min(1, "Enter the name of the person signing off"),
});

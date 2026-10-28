import type {
  AmcVisitStatus,
  ClaimStatus,
  CommissioningStatus,
  InstallationStatus,
  SalesOrderStatus,
  SerialStatus,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";
import type { AmcState, SlaState, WarrantyState } from "@/lib/lifecycle";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "purple";
export type StatusMeta = { label: string; tone: Tone };

export function statusOptions<T extends string>(map: Record<T, StatusMeta>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value].label }));
}

export const ORDER_STATUS: Record<SalesOrderStatus, StatusMeta> = {
  CONFIRMED: { label: "Confirmed", tone: "info" },
  IN_PRODUCTION: { label: "In production", tone: "purple" },
  DISPATCHED: { label: "Dispatched", tone: "warning" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const INSTALLATION_STATUS: Record<InstallationStatus, StatusMeta> = {
  PENDING: { label: "Pending", tone: "neutral" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const COMMISSIONING_STATUS: Record<CommissioningStatus, StatusMeta> = {
  IN_PROGRESS: { label: "In progress", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
};

export const SERIAL_STATUS: Record<SerialStatus, StatusMeta> = {
  IN_STOCK: { label: "In stock", tone: "neutral" },
  DISPATCHED: { label: "Dispatched", tone: "info" },
  INSTALLED: { label: "Installed", tone: "purple" },
  COMMISSIONED: { label: "Commissioned", tone: "success" },
  SCRAPPED: { label: "Scrapped", tone: "danger" },
};

export const TICKET_STATUS: Record<TicketStatus, StatusMeta> = {
  OPEN: { label: "Open", tone: "warning" },
  ASSIGNED: { label: "Assigned", tone: "info" },
  VISIT: { label: "Site visit", tone: "info" },
  DIAGNOSIS: { label: "Diagnosis", tone: "purple" },
  PARTS: { label: "Awaiting parts", tone: "warning" },
  REPAIR: { label: "Repair", tone: "brand" },
  CLOSED: { label: "Closed", tone: "success" },
};

export const TICKET_PRIORITY: Record<TicketPriority, StatusMeta> = {
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "info" },
  HIGH: { label: "High", tone: "warning" },
  CRITICAL: { label: "Critical", tone: "danger" },
};

export const CLAIM_STATUS: Record<ClaimStatus, StatusMeta> = {
  SUBMITTED: { label: "Submitted", tone: "info" },
  APPROVED: { label: "Approved", tone: "brand" },
  REJECTED: { label: "Rejected", tone: "danger" },
  RESOLVED: { label: "Resolved", tone: "success" },
};

export const AMC_STATE: Record<AmcState, StatusMeta> = {
  ACTIVE: { label: "Active", tone: "success" },
  EXPIRING: { label: "Renewal due", tone: "warning" },
  EXPIRED: { label: "Expired", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const AMC_VISIT_STATUS: Record<AmcVisitStatus, StatusMeta> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  SKIPPED: { label: "Skipped", tone: "neutral" },
};

export const WARRANTY_STATE: Record<WarrantyState, StatusMeta> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  ACTIVE: { label: "In warranty", tone: "success" },
  EXPIRING: { label: "Expiring soon", tone: "warning" },
  EXPIRED: { label: "Out of warranty", tone: "danger" },
};

export const SLA_STATE: Record<SlaState, StatusMeta> = {
  ON_TRACK: { label: "SLA on track", tone: "success" },
  DUE_SOON: { label: "SLA due soon", tone: "warning" },
  BREACHED: { label: "SLA breached", tone: "danger" },
  MET: { label: "SLA met", tone: "success" },
};

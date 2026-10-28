/**
 * Pure business rules for the customer lifecycle (installation → commissioning → warranty → service/AMC).
 * Kept free of database and framework imports so they can be unit-tested.
 * Date-only values are UTC midnight of the calendar day (see `lib/dates.ts`).
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const DEFAULT_WARRANTY_MONTHS = 12;
export const EXPIRING_SOON_DAYS = 30;
/** AMC renewal reminders fire at these many days before the contract ends. */
export const RENEWAL_REMINDER_DAYS = [60, 30, 7] as const;
export const SLA_DUE_SOON_HOURS = 4;

/* ----------------------------------------------------------------- Date maths */

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Adds calendar months, clamping to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/* ------------------------------------------------------------------- Warranty */

export type WarrantyState = "NOT_STARTED" | "ACTIVE" | "EXPIRING" | "EXPIRED";

export function warrantyEndsOn(startsOn: Date, months: number): Date {
  return addMonthsUtc(startsOn, months > 0 ? months : DEFAULT_WARRANTY_MONTHS);
}

export function warrantyState(
  endsOn: Date | null | undefined,
  todayDate: Date,
  expiringDays: number = EXPIRING_SOON_DAYS,
): WarrantyState {
  if (!endsOn) return "NOT_STARTED";
  const left = daysBetween(todayDate, endsOn);
  if (left < 0) return "EXPIRED";
  if (left <= expiringDays) return "EXPIRING";
  return "ACTIVE";
}

/** True while a warranty still covers the unit (including its last day). */
export function isInWarranty(endsOn: Date | null | undefined, todayDate: Date): boolean {
  return !!endsOn && daysBetween(todayDate, endsOn) >= 0;
}

/* ------------------------------------------------------------------------ AMC */

export type AmcState = "ACTIVE" | "EXPIRING" | "EXPIRED" | "CANCELLED";

/** Smallest reminder window the contract has entered (7, 30 or 60 days), or null when it is not near renewal. */
export function renewalBucket(endDate: Date, todayDate: Date): 7 | 30 | 60 | null {
  const left = daysBetween(todayDate, endDate);
  if (left < 0) return null;
  if (left <= 7) return 7;
  if (left <= 30) return 30;
  if (left <= 60) return 60;
  return null;
}

export function amcState(
  contract: { status: "ACTIVE" | "CANCELLED"; endDate: Date },
  todayDate: Date,
): AmcState {
  if (contract.status === "CANCELLED") return "CANCELLED";
  if (daysBetween(todayDate, contract.endDate) < 0) return "EXPIRED";
  return renewalBucket(contract.endDate, todayDate) ? "EXPIRING" : "ACTIVE";
}

/**
 * Evenly spaced preventive-maintenance dates across the contract term — each visit sits in the middle of its
 * interval, so none lands on the first or last day.
 */
export function buildVisitSchedule(start: Date, end: Date, visitsPerYear: number): Date[] {
  if (visitsPerYear <= 0 || end.getTime() <= start.getTime()) return [];
  const termDays = (end.getTime() - start.getTime()) / DAY_MS;
  const count = Math.max(1, Math.round((termDays / 365.25) * visitsPerYear));
  const step = termDays / count;
  return Array.from({ length: count }, (_, i) => addDaysUtc(start, Math.round((i + 0.5) * step)));
}

/* ------------------------------------------------------------------------ SLA */

export type SlaState = "ON_TRACK" | "DUE_SOON" | "BREACHED" | "MET";

export function slaDueAt(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * HOUR_MS);
}

export function slaState(
  ticket: { slaDueAt: Date | null; closedAt: Date | null },
  now: Date = new Date(),
): SlaState | null {
  if (!ticket.slaDueAt) return null;
  if (ticket.closedAt) return ticket.closedAt.getTime() <= ticket.slaDueAt.getTime() ? "MET" : "BREACHED";
  const left = ticket.slaDueAt.getTime() - now.getTime();
  if (left < 0) return "BREACHED";
  if (left <= SLA_DUE_SOON_HOURS * HOUR_MS) return "DUE_SOON";
  return "ON_TRACK";
}

/* ------------------------------------------------------------------ Checklists */

export const DEFAULT_INSTALL_CHECKLIST = [
  "Site inspected and base / foundation ready",
  "Unit positioned and levelled",
  "Water inlet and outlet piping connected",
  "Electrical supply and earthing connected",
  "Controller and sensors installed",
  "Insulation and cladding complete",
  "Leak and pressure test done",
  "Customer briefed on operation",
] as const;

export const DEFAULT_COMMISSIONING_CHECKLIST = [
  "Electrical — supply voltage and phase sequence",
  "Electrical — earthing and protection",
  "Water flow rate",
  "Inlet and outlet water temperature",
  "Refrigerant and operating pressure",
  "Compressor current draw",
  "Performance — heating output against rating",
  "Controller settings and alarms tested",
] as const;

export type InstallChecklistItem = { id: string; label: string; done: boolean };

export type CheckResult = "PENDING" | "PASS" | "FAIL";
export type CommissioningCheckItem = { id: string; label: string; result: CheckResult; reading: string };

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function buildInstallChecklist(labels: readonly string[] = DEFAULT_INSTALL_CHECKLIST): InstallChecklistItem[] {
  return labels.map((label) => ({ id: newId(), label, done: false }));
}

export function buildCommissioningChecklist(
  labels: readonly string[] = DEFAULT_COMMISSIONING_CHECKLIST,
): CommissioningCheckItem[] {
  return labels.map((label) => ({ id: newId(), label, result: "PENDING", reading: "" }));
}

/** Tolerant readers: stored JSON is only ever written by this app, but a bad row should not break the page. */
export function parseInstallChecklist(value: unknown): InstallChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.label !== "string") return [];
    return [{ id: r.id, label: r.label, done: r.done === true }];
  });
}

export function parseCommissioningChecklist(value: unknown): CommissioningCheckItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.label !== "string") return [];
    const result: CheckResult = r.result === "PASS" || r.result === "FAIL" ? r.result : "PENDING";
    return [{ id: r.id, label: r.label, result, reading: typeof r.reading === "string" ? r.reading : "" }];
  });
}

/* ------------------------------------------------------------- Serial parsing */

/** Splits pasted serial numbers (one per line, or comma/semicolon separated) into unique, trimmed values. */
export function parseSerialList(input: string): string[] {
  const seen = new Set<string>();
  for (const part of input.split(/[\n\r,;]+/)) {
    const serial = part.trim();
    if (serial) seen.add(serial);
  }
  return [...seen];
}

/* --------------------------------------------------------------- Dealer targets */

/** Incentive is earned on the full achieved amount once the target has been met. */
export function dealerIncentive(achieved: number, target: number, incentivePct: number): number {
  if (target <= 0 || achieved < target) return 0;
  return Math.round(((achieved * incentivePct) / 100) * 100) / 100;
}

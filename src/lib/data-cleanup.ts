/**
 * Clearing out old leads from the admin panel: which ones fall in the chosen period, and which ones are never
 * deleted because real business has grown on them. Pure rules only; the queries and the deletion are in
 * src/app/(dashboard)/admin/data/actions.ts.
 */
import type { LeadStatus } from "@prisma/client";
import { addMonthsUtc } from "@/lib/lifecycle";
import { parseDateInput, today } from "@/lib/dates";

export const CLEANUP_MONTH_CHOICES = [1, 2, 3, 4, 5, 6, 9, 12] as const;

/** "all" is only meant for clearing one specific import: the scope decides whether it is allowed. */
export type CleanupRange = { kind: "older"; months: number } | { kind: "range"; from: string; to: string } | { kind: "all" };

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The first instant of an Indian calendar day, given as "YYYY-MM-DD". */
function startOfIstDay(day: string): Date {
  return new Date(parseDateInput(day)!.getTime() - IST_OFFSET_MS);
}

export function rangeFromInput(input: {
  mode?: string | null;
  months?: string | null;
  from?: string | null;
  to?: string | null;
}): { ok: true; range: CleanupRange } | { ok: false; error: string } {
  if (input.mode === "all") return { ok: true, range: { kind: "all" } };
  if (input.mode === "range") {
    if (!parseDateInput(input.from ?? "") || !parseDateInput(input.to ?? "")) {
      return { ok: false, error: "Choose both a “from” date and a “to” date." };
    }
    if ((input.from as string) > (input.to as string)) return { ok: false, error: "The “from” date is after the “to” date." };
    return { ok: true, range: { kind: "range", from: input.from as string, to: input.to as string } };
  }
  const months = Number(input.months);
  if (!Number.isInteger(months) || months < 1 || months > 120) return { ok: false, error: "Choose how many months back to clear." };
  return { ok: true, range: { kind: "older", months } };
}

/**
 * The instants a lead's creation time must fall between: at or after `from` (when there is one) and before `before`.
 * "Older than 3 months" means created before the start of the day three months ago.
 */
export function rangeBounds(range: CleanupRange, now: Date = new Date()): { from: Date | null; before: Date } {
  if (range.kind === "all") return { from: null, before: new Date("9999-12-31T00:00:00.000Z") };
  if (range.kind === "older") {
    const cutoff = addMonthsUtc(today(now), -range.months);
    return { from: null, before: new Date(cutoff.getTime() - IST_OFFSET_MS) };
  }
  return { from: startOfIstDay(range.from), before: new Date(startOfIstDay(range.to).getTime() + DAY_MS) };
}

export function describeRange(range: CleanupRange, now: Date = new Date()): string {
  if (range.kind === "all") return "created on any date";
  if (range.kind === "range") return `created from ${range.from} to ${range.to}`;
  const cutoff = addMonthsUtc(today(now), -range.months).toISOString().slice(0, 10);
  return `created before ${cutoff} (more than ${range.months} month${range.months === 1 ? "" : "s"} ago)`;
}

export type CleanupFacts = {
  status: LeadStatus;
  convertedAt: Date | null;
  currentDepartmentId: string | null;
  orders: number;
  installations: number;
  tickets: number;
  serials: number;
  amcContracts: number;
  quotations: number;
  surveys: number;
};

/** Why a lead is kept even though it is in the period. */
export type Protection = "converted" | "business" | "quotes";

export const PROTECTION_LABELS: Record<Protection, string> = {
  converted: "Converted customers",
  business: "Customers with orders, installations, tickets, machines or maintenance contracts",
  quotes: "Leads with quotations or site surveys",
};

/**
 * A lead that became a customer, or that has an order, a job, a machine, a ticket or a contract, is never cleared.
 * Quotations and site surveys protect a lead too, unless the person chose to include them.
 */
export function protectionOf(f: CleanupFacts, includeQuoted: boolean): Protection | null {
  if (f.status === "CONVERTED" || f.convertedAt !== null || f.currentDepartmentId !== null) return "converted";
  if (f.orders + f.installations + f.tickets + f.serials + f.amcContracts > 0) return "business";
  if (!includeQuoted && f.quotations + f.surveys > 0) return "quotes";
  return null;
}

/** What the administrator types to confirm, so a stray click cannot clear data. */
export function confirmPhrase(count: number): string {
  return `DELETE ${count}`;
}

/** "2026-08" for the Indian calendar month a lead was created in. */
export function monthKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
}

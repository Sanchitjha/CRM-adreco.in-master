import { addMonthsUtc } from "@/lib/lifecycle";
import { parseDateInput } from "@/lib/dates";
import type { ImportRow } from "@/lib/lead-import";

/** The "last N months" choices offered next to the sheet's own date column. */
export const PERIOD_MONTH_CHOICES = [1, 2, 3, 4, 5, 6, 9, 12] as const;

/**
 * Which part of the sheet to bring in, judged by each prospect's enquiry date: all of it, the last few months, or
 * everything between two dates.
 */
export type ImportPeriod =
  | { kind: "all" }
  | { kind: "months"; months: number }
  | { kind: "range"; from: string | null; to: string | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Dates win over months; anything blank or invalid means "all". */
export function periodFromInput(input: { months?: string | null; from?: string | null; to?: string | null }): ImportPeriod {
  const from = parseDateInput(input.from ?? "") ? (input.from as string) : null;
  const to = parseDateInput(input.to ?? "") ? (input.to as string) : null;
  if (from || to) return { kind: "range", from, to };

  const months = Number(input.months);
  if (Number.isInteger(months) && months >= 1 && months <= 60) return { kind: "months", months };
  return { kind: "all" };
}

export function periodProblem(period: ImportPeriod): string | null {
  if (period.kind === "range" && period.from && period.to && period.from > period.to) {
    return "The “from” date is after the “to” date.";
  }
  return null;
}

/** The first and last day to keep (inclusive), where the period has one. `todayDate` is today's date at UTC midnight. */
export function periodBounds(period: ImportPeriod, todayDate: Date): { from: string | null; to: string | null } {
  if (period.kind === "months") return { from: iso(addMonthsUtc(todayDate, -period.months)), to: null };
  if (period.kind === "range") return { from: period.from, to: period.to };
  return { from: null, to: null };
}

export function describePeriod(period: ImportPeriod, todayDate: Date): string {
  if (period.kind === "all") return "everything in the file";
  const { from, to } = periodBounds(period, todayDate);
  if (period.kind === "months") return `the last ${period.months} month${period.months === 1 ? "" : "s"} (from ${from})`;
  if (from && to) return `${from} to ${to}`;
  return from ? `from ${from}` : `up to ${to}`;
}

export type PeriodResult = {
  kept: ImportRow[];
  /** Rows dated outside the period. */
  outside: number;
  /** Rows with no date at all: they cannot be placed in a period, so they are left out when one is chosen. */
  undated: number;
};

export function applyPeriod(rows: ImportRow[], period: ImportPeriod, todayDate: Date): PeriodResult {
  if (period.kind === "all") return { kept: rows, outside: 0, undated: 0 };

  const { from, to } = periodBounds(period, todayDate);
  const kept: ImportRow[] = [];
  let outside = 0;
  let undated = 0;
  for (const row of rows) {
    const day = row.enquiryDate;
    if (!day) {
      undated += 1;
    } else if ((from && day < from) || (to && day > to)) {
      outside += 1;
    } else {
      kept.push(row);
    }
  }
  return { kept, outside, undated };
}

/**
 * Adreco operates in India, so calendar dates are always shown and entered in IST regardless of where the
 * server runs. Date-only values are stored as UTC midnight of that calendar day.
 */
const TZ = "Asia/Kolkata";

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** "YYYY-MM-DD" for an <input type="date">, or "" when there is no date. */
export function toDateInput(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Parses "YYYY-MM-DD" into UTC midnight of that day; null for blank or invalid input. */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today's calendar date in IST, as UTC midnight — comparable with stored date-only values. */
export function today(now: Date = new Date()): Date {
  return parseDateInput(toDateInput(now))!;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The last instant of today's Indian calendar day — the cut-off for "due today". */
export function endOfTodayIst(now: Date = new Date()): Date {
  return new Date(today(now).getTime() + DAY_MS - IST_OFFSET_MS - 1);
}

/** Hour of the day (0–23) in India, for greetings. */
export function istHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
}

/** Whole days elapsed since a moment; negative when it lies in the future. */
export function daysSince(value: Date | string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(value).getTime()) / DAY_MS);
}

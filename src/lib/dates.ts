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

/** The first instant of today's Indian calendar day. */
export function startOfTodayIst(now: Date = new Date()): Date {
  return new Date(today(now).getTime() - IST_OFFSET_MS);
}

/** The first instant of the Indian calendar day `daysAgo` days before today (0 is today, 1 is yesterday). */
export function startOfDayIstAgo(daysAgo: number, now: Date = new Date()): Date {
  return new Date(startOfTodayIst(now).getTime() - daysAgo * DAY_MS);
}

/** Time of day in India, e.g. "5:42 pm". */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });
}

/** A date for headings, e.g. "Wed, 5 Nov 2026". */
export function formatLongDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  // Built from parts so the punctuation does not depend on the locale data of the machine it runs on.
  const parts = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`;
}

/** Hour of the day (0–23) in India, for greetings. */
export function istHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
}

/** Whole days elapsed since a moment; negative when it lies in the future. */
export function daysSince(value: Date | string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(value).getTime()) / DAY_MS);
}

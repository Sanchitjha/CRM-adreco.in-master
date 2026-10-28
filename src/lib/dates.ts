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

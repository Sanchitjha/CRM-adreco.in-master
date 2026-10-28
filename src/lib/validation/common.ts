import { z } from "zod";
import { parseDateInput } from "@/lib/dates";

export function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input";
}

/** Forms submit "" for an untouched input; treat that as "not provided". */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = z.string().trim().optional();

export const requiredId = (message: string) => z.string().trim().min(1, message);

export const optionalNumber = z.preprocess(blankToUndefined, z.coerce.number().nonnegative("Enter a number of zero or more").optional());

export const optionalInt = z.preprocess(
  blankToUndefined,
  z.coerce.number().int("Enter a whole number").nonnegative("Enter a number of zero or more").optional(),
);

export const optionalMoney = optionalNumber;

export const requiredMoney = (message = "Enter an amount") =>
  z.coerce.number({ error: message }).nonnegative("Amount cannot be negative");

export const requiredPositiveInt = (message = "Enter a quantity of at least 1") =>
  z.coerce.number({ error: message }).int("Enter a whole number").positive(message);

export const optionalDateString = z.preprocess(
  blankToUndefined,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional(),
);

export const requiredDateString = (message = "Enter a date") =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);

/** "" / undefined → null, otherwise the trimmed text. */
export function textOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function dateOrNull(value: string | undefined): Date | null {
  return parseDateInput(value);
}

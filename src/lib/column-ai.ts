/**
 * Working out what each column of an uploaded sheet is, when its headings are not the usual ones. Only the headings
 * go to the AI, never any row of customer data, and a sheet whose first row looks like data (a phone number, an email
 * address) is not sent at all.
 */
import { askModelJson, type AiConfig, type AiPrompt } from "@/lib/ai";
import { IMPORT_FIELDS, type ImportField } from "@/lib/lead-import";

const MAX_HEADINGS = 60;
const HEADING_LENGTH = 60;

const VALID_FIELDS = new Set<string>(IMPORT_FIELDS.map((f) => f.field));

/** A first row made of words is a heading row. One with a phone number or an email address in it is customer data. */
export function headingsSafeToSend(headings: string[]): boolean {
  return headings.every((h) => {
    const text = h.trim();
    return text.length <= 80 && !text.includes("@") && text.replace(/\D/g, "").length < 7;
  });
}

export function buildColumnPrompt(headings: string[]): AiPrompt {
  const fields = IMPORT_FIELDS.map((f) => `- ${f.field}: ${f.meaning}`).join("\n");
  const system = [
    "You match the column headings of a sales team's spreadsheet to the fields of a CRM.",
    "You are given only the headings, numbered from 0. You never see any rows. Headings may be in English, Hindi or Hinglish.",
    "",
    "Fields:",
    fields,
    "",
    'Reply with JSON only, in this form: {"columns":[{"index":0,"field":"phone"}]}.',
    "Include every heading. Use null as the field when a heading fits none of them. Use each field at most once.",
  ].join("\n");

  const list = headings
    .slice(0, MAX_HEADINGS)
    .map((text, index) => ({ index, text: text.trim().slice(0, HEADING_LENGTH) }))
    .filter((h) => h.text !== "");
  return { system, user: JSON.stringify({ headings: list }) };
}

/** The AI's answer as column index to field, keeping only what is valid and each field once. */
export function parseColumnAnswer(raw: unknown, headingCount: number): Map<number, ImportField> {
  const out = new Map<number, ImportField>();
  const columns = (raw as { columns?: unknown } | null)?.columns;
  if (!Array.isArray(columns)) return out;

  const usedFields = new Set<string>();
  for (const entry of columns) {
    const { index, field } = (entry ?? {}) as { index?: unknown; field?: unknown };
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= headingCount) continue;
    if (typeof field !== "string" || !VALID_FIELDS.has(field)) continue;
    if (out.has(index) || usedFields.has(field)) continue;
    usedFields.add(field);
    out.set(index, field as ImportField);
  }
  return out;
}

export type ColumnSuggestion =
  | { ok: true; map: Map<number, ImportField>; model: string }
  | { ok: false; reason: string };

export async function suggestColumns(
  config: AiConfig,
  headings: string[],
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ColumnSuggestion> {
  if (!headingsSafeToSend(headings)) {
    return { ok: false, reason: "The first row looks like customer data rather than headings, so it was not sent to the AI." };
  }
  const answer = await askModelJson(config, buildColumnPrompt(headings), options);
  if (!answer.ok) return answer;
  const map = parseColumnAnswer(answer.value, headings.length);
  if (map.size === 0) return { ok: false, reason: "The AI did not recognise any of the headings." };
  return { ok: true, map, model: answer.model };
}

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  adviceToJson,
  blockedFor,
  buildLeadFacts,
  generateHeuristicInsight,
  getAiConfig,
  hashAdviceInput,
  isAdviceStale,
  isClosedStatus,
  normalizeAdvice,
  requestAdvice,
  toInsight,
  type AdviceDraft,
  type AdviceResult,
  type AiProvider,
  type LeadAiInsight,
  type LeadForAi,
} from "@/lib/ai";

/**
 * What happened when the advice for a lead was asked for.
 * - rules: no AI is set up, or the lead is closed, so the built-in advice is shown.
 * - cached: the saved AI answer is still good.
 * - generated: the AI was asked just now and its answer is saved.
 * - failed: the AI did not answer. The insight is its earlier answer for the same facts, or else the built-in advice.
 */
export type AdviceOutcome =
  | { kind: "rules"; insight: LeadAiInsight }
  | { kind: "cached"; insight: LeadAiInsight }
  | { kind: "generated"; insight: LeadAiInsight }
  | { kind: "failed"; insight: LeadAiInsight; reason: string };

type StoredAdvice = { inputHash: string; generatedAt: Date; draft: AdviceDraft; model: string };

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 300);
}

async function readStored(leadId: string): Promise<StoredAdvice | null> {
  const row = await prisma.leadAiAdvice.findUnique({ where: { leadId } });
  if (!row) return null;
  // Checked again on the way out, so a row written by an older version of the code is simply ignored.
  const draft = normalizeAdvice(row.insight);
  if (!draft) return null;
  return { inputHash: row.inputHash, generatedAt: row.generatedAt, draft, model: row.model };
}

async function saveStored(
  leadId: string,
  inputHash: string,
  draft: AdviceDraft,
  provider: AiProvider,
  model: string,
  generatedAt: Date,
): Promise<void> {
  const insight = adviceToJson(draft) as Prisma.InputJsonObject;
  await prisma.leadAiAdvice.upsert({
    where: { leadId },
    create: { leadId, insight, inputHash, provider, model, generatedAt },
    update: { insight, inputHash, provider, model, generatedAt },
  });
}

/**
 * The advice for a lead. A saved AI answer is used while it is less than a day old and the lead has not changed in
 * any way the AI is told about; otherwise the AI is asked again. When it does not answer, the older answer for the
 * same facts is shown if there is one, and the built-in rules if not. With `refresh` (a person pressed the button) an
 * answer older than half a minute is replaced even though it is still fresh.
 */
export async function getLeadAdvice(
  lead: LeadForAi,
  options: { refresh?: boolean; now?: Date } = {},
): Promise<AdviceOutcome> {
  const rules = generateHeuristicInsight(lead);
  const config = getAiConfig();
  if (!config || isClosedStatus(lead.status)) return { kind: "rules", insight: rules };

  const refresh = Boolean(options.refresh);
  const now = options.now ?? new Date();
  const facts = buildLeadFacts(lead, now);
  const inputHash = hashAdviceInput(config, facts);

  let stored: StoredAdvice | null;
  try {
    stored = await readStored(lead.id);
  } catch (error) {
    // Without the table the answer could not be kept, and every page view would ask (and pay) again. So do not ask.
    console.warn("Saved AI advice could not be read, so the built-in advice is shown:", errorText(error));
    return { kind: "rules", insight: rules };
  }

  const sameFacts = stored && stored.inputHash === inputHash ? stored : null;
  const fromSaved = (saved: StoredAdvice, note?: string): LeadAiInsight => ({
    ...toInsight(saved.draft, lead.customerName, { model: saved.model, generatedAt: saved.generatedAt }),
    ...(note ? { note } : {}),
  });

  if (sameFacts && !isAdviceStale(sameFacts.generatedAt, now, refresh)) {
    return { kind: "cached", insight: fromSaved(sameFacts) };
  }

  const pausedMs = refresh ? 0 : blockedFor(config.provider, now.getTime());
  const result: AdviceResult =
    pausedMs > 0
      ? { ok: false, reason: `Paused for another ${Math.ceil(pausedMs / 1000)} seconds after a recent problem.` }
      : await requestAdvice(config, facts);

  if (result.ok) {
    const generatedAt = new Date();
    try {
      await saveStored(lead.id, inputHash, result.draft, result.provider, result.model, generatedAt);
    } catch (error) {
      console.warn("The AI's advice could not be saved:", errorText(error));
    }
    return { kind: "generated", insight: toInsight(result.draft, lead.customerName, { model: result.model, generatedAt }) };
  }

  console.warn("The AI did not answer:", result.reason);
  const insight = sameFacts
    ? fromSaved(sameFacts, "The AI did not answer just now, so this is its earlier advice.")
    : { ...rules, note: "The AI did not answer just now, so this is the built-in advice." };
  return { kind: "failed", insight, reason: result.reason };
}

/** The advice for a lead page. It never fails: whatever goes wrong, the built-in advice is shown. */
export async function getLeadInsight(lead: LeadForAi): Promise<LeadAiInsight> {
  try {
    return (await getLeadAdvice(lead)).insight;
  } catch (error) {
    console.warn("AI advice failed unexpectedly, so the built-in advice is shown:", errorText(error));
    return generateHeuristicInsight(lead);
  }
}

"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import type { ActionState } from "@/lib/action-state";
import { SAMPLE_FACTS, getAiConfig, getAiStatus, requestAdvice, toInsight } from "@/lib/ai";

/**
 * Asks the AI about a made-up lead, so the key, the model and the billing can be checked without opening a real lead.
 * No customer's details are involved, and the key is never shown: a failure says what the provider said.
 */
export async function testAi(): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return { error: "Only administrators can do this." };

  const config = getAiConfig();
  if (!config) return { error: "No AI key is set, so there is nothing to test. See DEPLOYMENT.md, section 5c." };

  const recent = await prisma.activityLog.count({
    where: { userId: session.user.id, action: "AI_TEST_RUN", createdAt: { gt: new Date(Date.now() - 20_000) } },
  });
  if (recent > 0) return { error: "You tested a moment ago. Please wait a few seconds before testing again." };

  const result = await requestAdvice(config, SAMPLE_FACTS);
  await logActivity({
    userId: session.user.id,
    action: "AI_TEST_RUN",
    entityType: "User",
    entityId: session.user.id,
    details: { provider: config.provider, model: config.model, ok: result.ok, ms: result.ok ? result.ms : null },
  });

  if (!result.ok) return { error: `The AI did not work. ${result.reason}` };

  const status = getAiStatus();
  const label = status.configured ? status.providerLabel : "The AI";
  const sample = toInsight(result.draft, "the customer", { model: result.model, generatedAt: new Date() });
  return {
    message: `It works. ${label} (${result.model}) answered in ${(result.ms / 1000).toFixed(1)} seconds. For the made-up sample lead it gave ${sample.score} out of 100 and suggested: ${sample.recommendedAction}`,
  };
}

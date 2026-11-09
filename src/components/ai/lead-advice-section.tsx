import { isAiConfigured, isClosedStatus, type LeadForAi } from "@/lib/ai";
import { getLeadInsight } from "@/lib/ai-insight";
import { AiLeadAdvisor, type AiLeadAdvisorProps } from "@/components/ai/ai-lead-advisor";

/**
 * The advice card on a lead. It is loaded on its own, inside a Suspense boundary on the lead page, so that asking the
 * AI (a few seconds, the first time a lead is opened in a day) never holds the rest of the page back.
 */
export async function LeadAdviceSection({
  aiInput,
  ...advisor
}: { aiInput: LeadForAi } & Omit<AiLeadAdvisorProps, "insight" | "canRefresh">) {
  const insight = await getLeadInsight(aiInput);
  return <AiLeadAdvisor {...advisor} insight={insight} canRefresh={isAiConfigured() && !isClosedStatus(aiInput.status)} />;
}

/** Shown in the card's place while the advice is being worked out. */
export function AdviceSkeleton() {
  return (
    <div
      className="rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50/40 via-white to-sky-50/30 p-5 shadow-sm"
      aria-busy="true"
    >
      <div className="flex items-center gap-2.5 border-b border-brand-100/60 pb-3.5">
        <span className="size-8 animate-pulse rounded-lg bg-brand-100" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-56 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">Preparing advice for this lead…</p>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

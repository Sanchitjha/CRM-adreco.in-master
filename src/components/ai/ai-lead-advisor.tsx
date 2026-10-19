"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, MessageCircle, AlertTriangle, CheckCircle2, TrendingUp, RefreshCw } from "lucide-react";
import { type LeadAiInsight } from "@/lib/ai";
import { WhatsAppAction } from "@/components/whatsapp/whatsapp-modal";

export function AiLeadAdvisor({
  customerName,
  phone,
  leadId,
  productCategory,
  budget,
  quoteNumber,
  grandTotal,
  insight,
}: {
  customerName: string;
  phone: string;
  leadId: string;
  productCategory?: string | null;
  budget?: number | string | null;
  quoteNumber?: string | null;
  grandTotal?: number | string | null;
  insight: LeadAiInsight;
}) {
  const [currentInsight, setCurrentInsight] = useState<LeadAiInsight>(insight);

  const scoreColor =
    currentInsight.score >= 75
      ? "text-emerald-600 bg-emerald-50 ring-emerald-200"
      : currentInsight.score >= 50
      ? "text-amber-600 bg-amber-50 ring-amber-200"
      : "text-rose-600 bg-rose-50 ring-rose-200";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50/40 via-white to-sky-50/30 p-5 shadow-sm">
      {/* Decorative gradient blur */}
      <div className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full bg-brand-400/10 blur-2xl" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-100/60 pb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">AI Deal Copilot & Strategic Advisor</h3>
            <p className="text-xs text-slate-500">Autonomous sales intelligence for Adreco heat pumps</p>
          </div>
        </div>

        {/* Win Probability Pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Win Probability:</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${
              currentInsight.winProbability === "High"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : currentInsight.winProbability === "Medium"
                ? "bg-amber-50 text-amber-700 ring-amber-200"
                : "bg-rose-50 text-rose-700 ring-rose-200"
            }`}
          >
            <TrendingUp className="size-3" />
            {currentInsight.winProbability}
          </span>
        </div>
      </div>

      {/* Body Grid */}
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        {/* Score column */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white/90 p-4 text-center shadow-xs">
          <span className="text-xs font-medium text-slate-400">Deal Score</span>
          <div className="mt-1 flex items-baseline gap-0.5">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900">
              {currentInsight.score}
            </span>
            <span className="text-xs font-medium text-slate-400">/100</span>
          </div>
          <span className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${scoreColor}`}>
            {currentInsight.urgency === "Urgent" ? "Action Needed" : "On Track"}
          </span>
        </div>

        {/* Summary & Recommended Next Step */}
        <div className="space-y-3 sm:col-span-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Deal Assessment
            </h4>
            <p className="mt-0.5 text-sm font-medium text-slate-800">{currentInsight.summary}</p>
          </div>

          <div className="rounded-xl border border-brand-200/60 bg-brand-50/50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-900">
              <CheckCircle2 className="size-3.5 text-brand-600" />
              Recommended Next Step
            </div>
            <p className="mt-1 text-sm text-brand-950 font-medium">
              {currentInsight.recommendedAction}
            </p>
          </div>
        </div>
      </div>

      {/* 1-Click AI Drafted WhatsApp Message */}
      <div className="mt-4 rounded-xl border border-emerald-200/80 bg-white p-3.5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 fill-emerald-600 text-emerald-600" />
            <span className="text-xs font-semibold text-slate-800">
              AI-Generated WhatsApp Pitch
            </span>
          </div>
          <WhatsAppAction
            customerName={customerName}
            phone={phone}
            leadId={leadId}
            productCategory={productCategory}
            budget={budget}
            quoteNumber={quoteNumber}
            grandTotal={grandTotal}
            suggestedMessage={currentInsight.suggestedWhatsAppMessage}
            variant="small"
            label="Send via WhatsApp"
          />
        </div>
        <p className="mt-2 text-xs italic text-slate-600 font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          &ldquo;{currentInsight.suggestedWhatsAppMessage}&rdquo;
        </p>
      </div>
    </div>
  );
}

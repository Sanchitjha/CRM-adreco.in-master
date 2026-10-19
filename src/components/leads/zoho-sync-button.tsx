"use client";

import { useState, useTransition } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Share2 } from "lucide-react";
import { syncLeadToZohoAction } from "@/app/(dashboard)/leads/actions";

export function ZohoSyncButton({ leadId }: { leadId: string }) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function handleSync() {
    setFeedback(null);
    startTransition(async () => {
      const res = await syncLeadToZohoAction(leadId);
      setFeedback({
        tone: res.success ? "success" : "error",
        text: res.message,
      });
      setTimeout(() => setFeedback(null), 5000);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
      >
        <Share2 className="size-3.5 text-amber-600" />
        {isPending ? "Syncing to Zoho CRM..." : "Push Lead to Zoho CRM"}
      </button>

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
            feedback.tone === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.tone === "success" ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}
    </div>
  );
}

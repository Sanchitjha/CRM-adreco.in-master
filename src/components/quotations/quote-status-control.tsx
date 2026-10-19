"use client";

import { useActionState } from "react";
import type { QuoteStatus } from "@prisma/client";
import { updateQuoteStatus } from "@/app/(dashboard)/quotations/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { QUOTE_STATUS_VALUES, QUOTE_STATUS_LABELS } from "@/lib/validation/quotation";

export function QuoteStatusControl({
  quoteId,
  currentStatus,
}: {
  quoteId: string;
  currentStatus: QuoteStatus;
}) {
  const [state, formAction, pending] = useActionState(updateQuoteStatus, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="quoteId" value={quoteId} />
      <select name="status" defaultValue={currentStatus} className="select w-auto min-w-32 py-1.5 text-sm">
        {QUOTE_STATUS_VALUES.map((s) => (
          <option key={s} value={s}>
            {QUOTE_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
        {pending ? "Updating…" : "Update"}
      </button>
      {state.error && <span className="form-error">{state.error}</span>}
    </form>
  );
}

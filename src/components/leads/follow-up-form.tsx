"use client";

import { useActionState } from "react";
import { addFollowUp } from "@/app/(dashboard)/leads/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";

export function FollowUpForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addFollowUp, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />

      <div>
        <label className="label" htmlFor="note">
          Note
        </label>
        <textarea id="note" name="note" required rows={2} className="textarea" placeholder="What was discussed?" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nextFollowUpDate">
            Next follow-up date
          </label>
          <input type="date" id="nextFollowUpDate" name="nextFollowUpDate" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="outcome">
            Outcome
          </label>
          <input
            type="text"
            id="outcome"
            name="outcome"
            placeholder="e.g. Interested, asked for quote"
            className="input"
          />
        </div>
      </div>

      {state.error && <p className="form-error">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "Saving…" : "Log follow-up"}
      </button>
    </form>
  );
}

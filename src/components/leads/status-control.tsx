"use client";

import { useActionState } from "react";
import type { LeadStatus } from "@prisma/client";
import { updateLeadStatus } from "@/app/(dashboard)/leads/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { LEAD_STATUS_VALUES } from "@/lib/validation/lead";

export function StatusControl({ leadId, currentStatus }: { leadId: string; currentStatus: LeadStatus }) {
  const [state, formAction, pending] = useActionState(updateLeadStatus, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <select name="status" defaultValue={currentStatus} className="select w-auto min-w-40 py-1.5 text-sm">
        {LEAD_STATUS_VALUES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
        {pending ? "Updating…" : "Update status"}
      </button>
      {state.error && <span className="form-error">{state.error}</span>}
    </form>
  );
}

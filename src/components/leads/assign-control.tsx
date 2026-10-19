"use client";

import { useActionState } from "react";
import { assignLead } from "@/app/(dashboard)/leads/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";

type SalesUser = { id: string; name: string };

export function AssignControl({
  leadId,
  currentAssignedToId,
  salesUsers,
}: {
  leadId: string;
  currentAssignedToId: string | null;
  salesUsers: SalesUser[];
}) {
  const [state, formAction, pending] = useActionState(assignLead, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <select name="assignedToId" defaultValue={currentAssignedToId ?? ""} className="select w-auto min-w-40 py-1.5 text-sm">
        <option value="" disabled>
          Choose rep…
        </option>
        {salesUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
        {pending ? "Saving…" : "Reassign"}
      </button>
      {state.error && <span className="form-error">{state.error}</span>}
    </form>
  );
}

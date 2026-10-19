"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import type { StageStatus } from "@prisma/client";
import { completeStage, startStage } from "@/app/(dashboard)/queue/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";

export function StageActions({ leadId, stageStatus }: { leadId: string; stageStatus: StageStatus }) {
  const [startState, startAction, startPending] = useActionState(startStage, INITIAL_ACTION_STATE);
  const [completeState, completeAction, completePending] = useActionState(completeStage, INITIAL_ACTION_STATE);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {stageStatus === "PENDING" && (
        <form action={startAction}>
          <input type="hidden" name="leadId" value={leadId} />
          <button type="submit" disabled={startPending} className="btn btn-secondary btn-sm">
            {startPending ? "Starting…" : "Start"}
          </button>
        </form>
      )}
      <form action={completeAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <button type="submit" disabled={completePending} className="btn btn-primary btn-sm">
          {completePending ? "Saving…" : "Complete"}
          <ArrowRight className="size-3.5" />
        </button>
      </form>
      {(startState.error || completeState.error) && (
        <span className="form-error">{startState.error ?? completeState.error}</span>
      )}
    </div>
  );
}

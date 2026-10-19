"use client";

import { useActionState } from "react";
import type { SurveyStatus } from "@prisma/client";
import { updateSurveyStatus } from "@/app/(dashboard)/surveys/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { SURVEY_STATUS_VALUES, SURVEY_STATUS_LABELS } from "@/lib/validation/survey";

export function SurveyStatusControl({
  surveyId,
  currentStatus,
}: {
  surveyId: string;
  currentStatus: SurveyStatus;
}) {
  const [state, formAction, pending] = useActionState(updateSurveyStatus, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="surveyId" value={surveyId} />
      <select name="status" defaultValue={currentStatus} className="select w-auto min-w-36 py-1.5 text-sm">
        {SURVEY_STATUS_VALUES.map((s) => (
          <option key={s} value={s}>
            {SURVEY_STATUS_LABELS[s]}
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

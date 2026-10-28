"use client";

import { useActionState } from "react";
import { setCheck } from "@/app/(dashboard)/commissioning/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import type { CommissioningCheckItem } from "@/lib/lifecycle";

function Row({
  commissioningId,
  item,
  editable,
}: {
  commissioningId: string;
  item: CommissioningCheckItem;
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(setCheck, INITIAL_ACTION_STATE);

  const tone =
    item.result === "PASS"
      ? "border-l-emerald-500"
      : item.result === "FAIL"
        ? "border-l-rose-500"
        : "border-l-transparent";

  return (
    <li className={`border-l-4 px-5 py-3 ${tone}`}>
      <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_130px_1fr_auto] sm:items-center">
        <input type="hidden" name="commissioningId" value={commissioningId} />
        <input type="hidden" name="itemId" value={item.id} />
        <span className="text-sm text-slate-700">{item.label}</span>
        <select
          name="result"
          defaultValue={item.result}
          disabled={!editable}
          aria-label={`Result for ${item.label}`}
          className="select py-1.5 text-sm"
        >
          <option value="PENDING">Pending</option>
          <option value="PASS">Pass</option>
          <option value="FAIL">Fail</option>
        </select>
        <input
          name="reading"
          defaultValue={item.reading}
          disabled={!editable}
          aria-label={`Reading for ${item.label}`}
          placeholder="Reading / remark"
          className="input py-1.5 text-sm"
        />
        {editable && (
          <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </form>
      {state.error && <p className="form-error mt-1">{state.error}</p>}
    </li>
  );
}

/** Pass / fail checklist with a recorded reading for each commissioning test. */
export function CommissioningChecklist({
  commissioningId,
  items,
  editable,
}: {
  commissioningId: string;
  items: CommissioningCheckItem[];
  editable: boolean;
}) {
  const passed = items.filter((i) => i.result === "PASS").length;
  const failed = items.filter((i) => i.result === "FAIL").length;

  return (
    <div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-3 text-xs text-slate-500">
        <span>
          <span className="font-semibold text-emerald-600">{passed}</span> passed
        </span>
        <span>
          <span className="font-semibold text-rose-600">{failed}</span> failed
        </span>
        <span>
          <span className="font-semibold text-slate-700">{items.length - passed - failed}</span> pending
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {items.map((item) => (
          <Row key={item.id} commissioningId={commissioningId} item={item} editable={editable} />
        ))}
      </ul>
    </div>
  );
}

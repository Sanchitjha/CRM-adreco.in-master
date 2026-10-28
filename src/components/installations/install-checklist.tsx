"use client";

import { useActionState } from "react";
import { Circle, CircleCheck, X } from "lucide-react";
import { updateChecklist } from "@/app/(dashboard)/installations/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import type { InstallChecklistItem } from "@/lib/lifecycle";
import { AutoForm } from "@/components/auto-form";

function Row({
  installationId,
  item,
  editable,
}: {
  installationId: string;
  item: InstallChecklistItem;
  editable: boolean;
}) {
  const [toggleState, toggleAction, toggling] = useActionState(updateChecklist, INITIAL_ACTION_STATE);
  const [removeState, removeAction, removing] = useActionState(updateChecklist, INITIAL_ACTION_STATE);
  const error = toggleState.error ?? removeState.error;

  return (
    <li className="flex items-start gap-3 px-5 py-2.5">
      <form action={toggleAction} className="mt-0.5">
        <input type="hidden" name="installationId" value={installationId} />
        <input type="hidden" name="op" value="toggle" />
        <input type="hidden" name="itemId" value={item.id} />
        <button
          type="submit"
          disabled={!editable || toggling}
          aria-pressed={item.done}
          aria-label={`${item.done ? "Untick" : "Tick"} ${item.label}`}
          className="text-slate-300 transition hover:text-brand-500 disabled:cursor-default disabled:hover:text-slate-300"
        >
          {item.done ? <CircleCheck className="size-5 text-emerald-500" /> : <Circle className="size-5" />}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <span className={`text-sm ${item.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.label}</span>
        {error && <p className="form-error">{error}</p>}
      </div>
      {editable && (
        <form action={removeAction}>
          <input type="hidden" name="installationId" value={installationId} />
          <input type="hidden" name="op" value="remove" />
          <input type="hidden" name="itemId" value={item.id} />
          <button
            type="submit"
            disabled={removing}
            aria-label={`Remove ${item.label}`}
            className="flex size-6 items-center justify-center rounded text-slate-300 hover:bg-rose-50 hover:text-rose-600"
          >
            <X className="size-4" />
          </button>
        </form>
      )}
    </li>
  );
}

/** Tick-off list for the on-site installation steps, with room to add job-specific items. */
export function InstallChecklist({
  installationId,
  items,
  editable,
}: {
  installationId: string;
  items: InstallChecklistItem[];
  editable: boolean;
}) {
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div>
      <div className="px-5 pb-3 pt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
          <span>
            {done} of {items.length} done
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-slate-400">No checklist items.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {items.map((item) => (
            <Row key={item.id} installationId={installationId} item={item} editable={editable} />
          ))}
        </ul>
      )}
      {editable && (
        <div className="border-t border-[var(--border)] px-5 py-4">
          <AutoForm
            action={updateChecklist}
            submitLabel="Add item"
            columns={1}
            compact
            resetOnSuccess
            fields={[
              { kind: "hidden", name: "installationId", value: installationId },
              { kind: "hidden", name: "op", value: "add" },
              { name: "label", label: "Add a step", placeholder: "e.g. Chimney clearance checked", required: true },
            ]}
          />
        </div>
      )}
    </div>
  );
}

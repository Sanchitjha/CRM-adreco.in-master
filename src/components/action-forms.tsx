"use client";

import { useActionState } from "react";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import type { FormAction } from "@/components/auto-form";

/** A dropdown + "Update" button that posts to a server action — for status and assignment controls. */
export function SelectActionForm({
  action,
  hidden,
  name,
  current,
  options,
  submitLabel = "Update",
  placeholder,
  notePlaceholder,
}: {
  action: FormAction;
  hidden: Record<string, string>;
  name: string;
  current?: string | null;
  options: { value: string; label: string }[];
  submitLabel?: string;
  placeholder?: string;
  /** When set, a free-text note box is shown and sent as `note`. */
  notePlaceholder?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <select name={name} defaultValue={current ?? ""} className="select w-auto min-w-36 py-1.5 text-sm">
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
          {pending ? "Updating…" : submitLabel}
        </button>
      </div>
      {notePlaceholder && <input name="note" className="input py-1.5 text-sm" placeholder={notePlaceholder} />}
      {state.error && <p className="form-error">{state.error}</p>}
      {!state.error && state.message && <p className="text-xs text-emerald-600">{state.message}</p>}
    </form>
  );
}

/** A single button that posts hidden fields to a server action, with optional confirmation. */
export function ActionButton({
  action,
  hidden,
  label,
  pendingLabel,
  variant = "secondary",
  confirm,
  small = true,
}: {
  action: FormAction;
  hidden: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  confirm?: string;
  small?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} className={`btn btn-${variant} ${small ? "btn-sm" : ""}`}>
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
      {state.error && <span className="form-error max-w-xs whitespace-normal">{state.error}</span>}
      {!state.error && state.message && <span className="text-xs text-emerald-600">{state.message}</span>}
    </form>
  );
}

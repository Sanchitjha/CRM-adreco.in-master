"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Base = { name: string; label: string; hint?: string; span?: 1 | 2 };
type Option = { value: string; label: string };

export type FieldDef =
  | (Base & {
      kind?: "text" | "email" | "tel" | "number" | "date" | "url";
      required?: boolean;
      placeholder?: string;
      defaultValue?: string | number | null;
      min?: number;
      max?: number;
      step?: string;
      list?: string[];
    })
  | (Base & {
      kind: "select";
      options: Option[];
      required?: boolean;
      placeholder?: string;
      defaultValue?: string | null;
    })
  | (Base & {
      kind: "textarea";
      required?: boolean;
      placeholder?: string;
      defaultValue?: string | null;
      rows?: number;
    })
  | (Base & { kind: "checkbox"; defaultChecked?: boolean })
  | (Base & { kind: "checkboxes"; options: (Option & { hint?: string })[]; emptyText?: string })
  | { kind: "hidden"; name: string; value: string };

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Declarative form: pass field definitions from a server page and a server action, and it renders the inputs,
 * the pending state and the error / success message. Used for every create and edit form in the lifecycle modules.
 */
export function AutoForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
  columns = 2,
  resetOnSuccess,
  compact,
}: {
  action: FormAction;
  fields: FieldDef[];
  submitLabel: string;
  pendingLabel?: string;
  columns?: 1 | 2;
  resetOnSuccess?: boolean;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  // Several forms can share a page and a field name, so each form namespaces its element ids.
  const formId = useId();

  useEffect(() => {
    if (resetOnSuccess && state.message && !state.error) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={compact ? "space-y-3" : "space-y-5"}>
      {fields
        .filter((f): f is Extract<FieldDef, { kind: "hidden" }> => f.kind === "hidden")
        .map((f) => (
          <input key={f.name} type="hidden" name={f.name} value={f.value} />
        ))}

      <div className={`grid gap-4 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {fields
          .filter((f): f is Exclude<FieldDef, { kind: "hidden" }> => f.kind !== "hidden")
          .map((f) => (
            <div key={f.name} className={f.span === 2 || f.kind === "checkboxes" ? "sm:col-span-2" : ""}>
              <FieldInput field={f} formId={formId} />
            </div>
          ))}
      </div>

      {state.error && (
        <p className="form-error flex items-center gap-2" role="alert">
          <TriangleAlert className="size-4 shrink-0" />
          {state.error}
        </p>
      )}
      {!state.error && state.message && (
        <p className="flex items-center gap-2 text-sm text-emerald-600" role="status">
          <CircleCheck className="size-4 shrink-0" />
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? (pendingLabel ?? "Saving…") : submitLabel}
        </button>
      </div>
    </form>
  );
}

function FieldInput({ field, formId }: { field: Exclude<FieldDef, { kind: "hidden" }>; formId: string }) {
  const id = `${formId}-${field.name}`;
  const required = "required" in field ? field.required : false;

  const label = (
    <label htmlFor={id} className="label">
      {field.label}
      {required && <span className="text-rose-500"> *</span>}
    </label>
  );
  const hint = field.hint ? <p className="mt-1 text-xs text-slate-400">{field.hint}</p> : null;

  switch (field.kind) {
    case "select":
      return (
        <>
          {label}
          <select
            key={field.defaultValue ?? ""}
            id={id}
            name={field.name}
            required={field.required}
            className="select"
            defaultValue={field.defaultValue ?? ""}
          >
            <option value="" disabled={field.required}>
              {field.placeholder ?? "Select…"}
            </option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint}
        </>
      );
    case "textarea":
      return (
        <>
          {label}
          <textarea
            id={id}
            name={field.name}
            required={field.required}
            rows={field.rows ?? 3}
            placeholder={field.placeholder}
            defaultValue={field.defaultValue ?? ""}
            className="textarea"
          />
          {hint}
        </>
      );
    case "checkbox":
      return (
        <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 pt-1">
          <input
            id={id}
            name={field.name}
            type="checkbox"
            defaultChecked={field.defaultChecked}
            className="mt-0.5 size-4 rounded border-slate-300 accent-[var(--primary)]"
          />
          <span className="text-sm text-slate-700">
            {field.label}
            {field.hint && <span className="block text-xs text-slate-400">{field.hint}</span>}
          </span>
        </label>
      );
    case "checkboxes":
      return (
        <fieldset>
          <legend className="label">{field.label}</legend>
          {field.options.length === 0 ? (
            <p className="text-sm text-slate-400">{field.emptyText ?? "Nothing to choose from."}</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
              {field.options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    name={field.name}
                    value={o.value}
                    className="mt-0.5 size-4 rounded border-slate-300 accent-[var(--primary)]"
                  />
                  <span className="text-sm text-slate-700">
                    {o.label}
                    {o.hint && <span className="block text-xs text-slate-400">{o.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {hint}
        </fieldset>
      );
    default: {
      const listId = field.list ? `${id}-list` : undefined;
      return (
        <>
          {label}
          <input
            id={id}
            name={field.name}
            type={field.kind ?? "text"}
            required={field.required}
            placeholder={field.placeholder}
            defaultValue={field.defaultValue ?? ""}
            min={field.min}
            max={field.max}
            step={field.step}
            list={listId}
            className="input"
          />
          {listId && (
            <datalist id={listId}>
              {field.list!.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          )}
          {hint}
        </>
      );
    }
  }
}

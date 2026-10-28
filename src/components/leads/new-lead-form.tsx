"use client";

import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";
import { createLead } from "@/app/(dashboard)/leads/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";

type SalesUser = { id: string; name: string };
type DealerOption = { id: string; name: string };

export function NewLeadForm({
  salesUsers,
  categories,
  sources,
  dealers,
}: {
  salesUsers: SalesUser[] | null;
  categories: string[];
  sources: string[];
  dealers: DealerOption[];
}) {
  const [state, formAction, pending] = useActionState(createLead, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name" name="customerName" required />
        <Field label="Phone" name="phone" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" type="email" />
        <div>
          <label htmlFor="source" className="label">
            Source
          </label>
          <input
            id="source"
            name="source"
            list="lead-sources"
            placeholder="e.g. Website enquiry, referral"
            className="input"
          />
          <datalist id="lead-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <Field label="Address" name="address" placeholder="Site / billing address" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="productCategory">
            Product category
          </label>
          <select id="productCategory" name="productCategory" className="select" defaultValue="">
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Field label="Budget (₹)" name="budget" type="number" placeholder="Estimated value" />
      </div>

      {dealers.length > 0 && (
        <div>
          <label className="label" htmlFor="dealerId">
            Dealer
          </label>
          <select id="dealerId" name="dealerId" className="select" defaultValue="">
            <option value="">Direct enquiry — no dealer</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Choose the dealer if this lead came through a channel partner.</p>
        </div>
      )}

      {salesUsers && (
        <div>
          <label className="label" htmlFor="assignedToId">
            Assign to
          </label>
          <select id="assignedToId" name="assignedToId" className="select" defaultValue="">
            <option value="">Unassigned</option>
            {salesUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="requirementNotes">
          Requirement notes
        </label>
        <textarea
          id="requirementNotes"
          name="requirementNotes"
          rows={3}
          className="textarea"
          placeholder="Application, capacity, water temperature, site conditions…"
        />
      </div>

      {state.error && (
        <p className="form-error flex items-center gap-2">
          <TriangleAlert className="size-4" />
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Creating…" : "Create lead"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

"use client";

import { startTransition, useActionState, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createLead } from "@/app/(dashboard)/leads/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { CONTACT_ROLES, PROJECT_STAGES } from "@/lib/lead-options";

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
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Submitting through the action prop makes React clear every field once the action returns, even when the server
  // asked for a correction or showed the duplicate warning. Dispatching by hand keeps what the person typed.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  // Changing the phone or email invalidates an earlier "create anyway".
  function resetConfirmation(event: React.FormEvent<HTMLFormElement>) {
    const name = (event.target as HTMLInputElement).name;
    if ((name === "phone" || name === "email") && confirmRef.current) confirmRef.current.value = "";
  }

  function createAnyway() {
    if (confirmRef.current) confirmRef.current.value = "1";
    formRef.current?.requestSubmit();
  }

  // Until the page has hydrated there is no submit handler yet, so hold the button back rather than let the browser
  // post the form natively.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const duplicates = state.duplicates ?? [];

  return (
    <form ref={formRef} method="post" onSubmit={handleSubmit} onChange={resetConfirmation} className="space-y-5">
      <input ref={confirmRef} type="hidden" name="confirmDuplicate" defaultValue="" />

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
          <label htmlFor="contactRole" className="label">
            Their role on the project
          </label>
          <input
            id="contactRole"
            name="contactRole"
            list="contact-roles"
            placeholder="e.g. Owner, Site in-charge"
            className="input"
          />
          <datalist id="contact-roles">
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="projectStage">
            Project stage
          </label>
          <select id="projectStage" name="projectStage" className="select" defaultValue="">
            <option value="">Select…</option>
            {PROJECT_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Referred by" name="referredBy" placeholder="e.g. a plumber, an architect" />
        <Field label="Competitor in mind" name="competitor" placeholder="Brand they are comparing" />
      </div>

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

      {duplicates.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <TriangleAlert className="size-4 shrink-0" />
            {state.error}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/leads/${d.id}`} target="_blank" className="font-medium underline underline-offset-2">
                  {d.customerName}
                </Link>{" "}
                · {d.phone} · {d.status.replace("_", " ").toLowerCase()}
                {d.ownerName ? ` · owned by ${d.ownerName}` : " · unassigned"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Open the existing lead and add a follow-up there, or create this one anyway if it is a different enquiry.
          </p>
          <button type="button" onClick={createAnyway} disabled={pending} className="btn btn-secondary btn-sm mt-3">
            Create anyway
          </button>
        </div>
      ) : (
        state.error && (
          <p className="form-error flex items-center gap-2" role="alert">
            <TriangleAlert className="size-4" />
            {state.error}
          </p>
        )
      )}

      <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
        <button type="submit" disabled={pending || !hydrated} className="btn btn-primary">
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

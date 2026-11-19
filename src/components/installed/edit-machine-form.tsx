"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, useSyncExternalStore } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { updateMachine } from "@/app/(dashboard)/serial-numbers/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { CustomerSearch, type CustomerChoice } from "@/components/installed/customer-search";

export type MachineFormValues = {
  id: string;
  serialNo: string;
  productId: string;
  customer: CustomerChoice | null;
  installedAt: string;
  commissionedAt: string;
  warrantyStartsOn: string;
  warrantyEndsOn: string;
  manufacturedOn: string;
  notes: string;
};

function Field({ label, htmlFor, hint, required, children }: { label: string; htmlFor: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

const lockedClass = "input bg-slate-50 text-slate-600";

/**
 * The form that corrects a machine. The model and the customer can be changed only for a machine that was recorded by
 * hand; the warranty dates only by an administrator or for such a machine. A locked box is read-only, not disabled, so
 * it is still sent and the server sees the same value it already has.
 */
export function EditMachineForm({
  machine,
  products,
  customers,
  canChangeModelAndCustomer,
  canEditWarranty,
  lockedNote,
}: {
  machine: MachineFormValues;
  products: { id: string; name: string; modelCode: string }[];
  customers: CustomerChoice[];
  canChangeModelAndCustomer: boolean;
  canEditWarranty: boolean;
  lockedNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateMachine, INITIAL_ACTION_STATE);
  const [customer, setCustomer] = useState<CustomerChoice | null>(machine.customer);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const model = products.find((p) => p.id === machine.productId);

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="serialId" value={machine.id} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Serial number" htmlFor="serialNo" required hint="Change a reference number (REF-…) to the real serial number when you have it.">
          <input id="serialNo" name="serialNo" defaultValue={machine.serialNo} className="input" autoComplete="off" />
        </Field>

        {canChangeModelAndCustomer ? (
          <Field label="Model" htmlFor="productId">
            <select id="productId" name="productId" defaultValue={machine.productId} className="select">
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.modelCode})
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Model" htmlFor="model-locked">
            <input id="model-locked" value={model ? `${model.name} (${model.modelCode})` : ""} readOnly className={lockedClass} />
          </Field>
        )}
      </div>

      <div>
        <p className="label">Customer</p>
        {canChangeModelAndCustomer ? (
          <>
            <input type="hidden" name="leadId" value={customer?.id ?? ""} />
            <CustomerSearch customers={customers} value={customer} onChange={setCustomer} inputId="machine-customer" />
          </>
        ) : (
          <p className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm text-slate-700">{customer?.name ?? "No customer"}</p>
        )}
        {lockedNote && <p className="mt-1 text-xs text-slate-500">{lockedNote}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Installed on" htmlFor="installedAt">
          <input id="installedAt" name="installedAt" type="date" defaultValue={machine.installedAt} className="input" />
        </Field>
        <Field label="Commissioned on" htmlFor="commissionedAt" hint="The day it was handed over and started working.">
          <input id="commissionedAt" name="commissionedAt" type="date" defaultValue={machine.commissionedAt} className="input" />
        </Field>
        <Field label="Warranty starts" htmlFor="warrantyStartsOn">
          <input id="warrantyStartsOn" name="warrantyStartsOn" type="date" defaultValue={machine.warrantyStartsOn} readOnly={!canEditWarranty} className={canEditWarranty ? "input" : lockedClass} />
        </Field>
        <Field label="Warranty ends" htmlFor="warrantyEndsOn" hint={canEditWarranty ? "Change this to correct the warranty or to grant an extension." : "Only an administrator can change the warranty dates of this machine."}>
          <input id="warrantyEndsOn" name="warrantyEndsOn" type="date" defaultValue={machine.warrantyEndsOn} readOnly={!canEditWarranty} className={canEditWarranty ? "input" : lockedClass} />
        </Field>
        <Field label="Manufactured on" htmlFor="manufacturedOn">
          <input id="manufacturedOn" name="manufacturedOn" type="date" defaultValue={machine.manufacturedOn} className="input" />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <textarea id="notes" name="notes" rows={3} defaultValue={machine.notes} className="textarea" />
      </Field>

      {state.error && (
        <p className="form-error flex items-start gap-2" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}
      {!state.error && state.message && (
        <p className="flex items-start gap-2 text-sm text-emerald-600" role="status">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !hydrated} className="btn btn-primary min-h-11">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/serial-numbers/${machine.id}`} className="btn btn-secondary min-h-11">
          Cancel
        </Link>
      </div>
    </form>
  );
}

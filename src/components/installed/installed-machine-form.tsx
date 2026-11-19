"use client";

import { startTransition, useActionState, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CalendarClock, Cpu, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import { CustomerSearch, type CustomerChoice } from "@/components/installed/customer-search";
import { addInstalled } from "@/app/(dashboard)/warranty/installed/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { endOfTerm } from "@/lib/installed-base";
import { warrantyDates } from "@/lib/installed-plan";
import { DEFAULT_WARRANTY_MONTHS, warrantyState } from "@/lib/lifecycle";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type ModelChoice = { id: string; name: string; modelCode: string; capacityKw: number | null; warrantyMonths: number };

const WARRANTY_CHOICES = [6, 12, 18, 24, 36, 60];
const AMC_TERMS = [12, 24, 36];

const dayOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const monthsText = (months: number) => (months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`);

const STATE_TEXT = { NOT_STARTED: "not started", ACTIVE: "in warranty", EXPIRING: "ends soon", EXPIRED: "expired" } as const;

function Section({ icon: Icon, title, hint, children }: { icon: typeof Cpu; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, required, hint, children }: { label: string; htmlFor: string; required?: boolean; hint?: string; children: React.ReactNode }) {
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

export function InstalledMachineForm({
  customers,
  models,
  initialLeadId,
}: {
  customers: CustomerChoice[];
  models: ModelChoice[];
  initialLeadId?: string;
}) {
  const [state, formAction, pending] = useActionState(addInstalled, INITIAL_ACTION_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const initial = customers.find((c) => c.id === initialLeadId) ?? null;
  const [mode, setMode] = useState<"existing" | "new">(customers.length === 0 ? "new" : "existing");
  const [customer, setCustomer] = useState<CustomerChoice | null>(initial);
  const [productId, setProductId] = useState("");
  const [installedOn, setInstalledOn] = useState("");
  const [warrantyChoice, setWarrantyChoice] = useState("default");
  const [warrantyEndsOn, setWarrantyEndsOn] = useState("");
  const [hasAmc, setHasAmc] = useState(false);
  const [amcStart, setAmcStart] = useState("");
  const [amcTerm, setAmcTerm] = useState("12");
  const [amcEnd, setAmcEnd] = useState("");

  const today = todayIso();
  const model = models.find((m) => m.id === productId) ?? null;

  // What the warranty will be, as soon as there is a date to count from.
  const warrantyPreview = useMemo(() => {
    if (!installedOn) return null;
    const months = warrantyChoice === "default" || warrantyChoice === "custom" ? null : Number(warrantyChoice);
    const ends = warrantyChoice === "custom" ? warrantyEndsOn || null : null;
    if (warrantyChoice === "custom" && !ends) return null;
    const { startsOn, endsOn } = warrantyDates({ installedOn, warrantyMonths: months, warrantyEndsOn: ends }, model?.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS);
    const status = warrantyState(dayOf(endsOn), dayOf(today));
    return { startsOn, endsOn, status };
  }, [installedOn, warrantyChoice, warrantyEndsOn, model, today]);

  const amcPreview = useMemo(() => {
    if (!hasAmc || !amcStart) return null;
    const end = amcTerm === "custom" ? amcEnd : endOfTerm(amcStart, Number(amcTerm));
    if (!end || end <= amcStart) return null;
    const left = Math.round((dayOf(end).getTime() - dayOf(today).getTime()) / 86_400_000);
    return { end, status: left < 0 ? "expired" : left <= 60 ? "ends soon" : "active" };
  }, [hasAmc, amcStart, amcTerm, amcEnd, today]);

  // Submitting through the action prop would clear every box once the action returns, even when the server refused
  // the input. Dispatching by hand keeps what the person typed so they can correct it.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} method="post" onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="customerMode" value={mode} />
      <input type="hidden" name="leadId" value={mode === "existing" ? (customer?.id ?? "") : ""} />

      <Section icon={UserRound} title="1. Customer" hint="Who the machines are installed for: a hotel, a company or a person.">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Customer">
          {(
            [
              ["existing", "Already in the CRM"],
              ["new", "New customer"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "min-h-11 rounded-lg px-3 text-sm font-medium transition",
                mode === value ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          <CustomerSearch
            customers={customers}
            value={customer}
            onChange={setCustomer}
            noMatchHint="No customer matches. Choose “New customer” above to add one."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Customer or hotel name" htmlFor="customerName" required hint="For a group with many hotels, add the city: Sunrise Hotel, Pune.">
                <input id="customerName" name="customerName" className="input" autoComplete="off" />
              </Field>
            </div>
            <Field label="Address or city" htmlFor="address">
              <input id="address" name="address" className="input" autoComplete="off" />
            </Field>
            <Field label="Phone" htmlFor="phone" hint="Optional. The reception or the contact person's number.">
              <input id="phone" name="phone" type="tel" inputMode="tel" className="input" autoComplete="off" />
            </Field>
            <Field label="Contact person" htmlFor="contactPerson">
              <input id="contactPerson" name="contactPerson" className="input" autoComplete="off" />
            </Field>
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" inputMode="email" className="input" autoComplete="off" />
            </Field>
          </div>
        )}
      </Section>

      <Section icon={Cpu} title="2. Machine" hint="What was installed, and how many.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Model" htmlFor="productId" hint={model ? `${model.capacityKw ? `${model.capacityKw} kW` : "Capacity not set"} · standard warranty ${monthsText(model.warrantyMonths)}` : "Pick the model from the catalogue. If it is not there, choose “Other”."}>
              <select id="productId" name="productId" className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Not sure / not recorded</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.modelCode})
                  </option>
                ))}
                <option value="other">Other: not in the catalogue</option>
              </select>
            </Field>
          </div>
          {productId === "other" && (
            <>
              <Field label="Model name" htmlFor="model" hint="As it is written on the machine or in your records.">
                <input id="model" name="model" className="input" autoComplete="off" />
              </Field>
              <Field label="Capacity (kW)" htmlFor="capacityKw" hint="The heating output, for example 33.">
                <input id="capacityKw" name="capacityKw" inputMode="decimal" className="input" autoComplete="off" />
              </Field>
            </>
          )}
          {productId === "" && (
            <Field label="Capacity (kW)" htmlFor="capacityKw" hint="Optional: the heating output, for example 33.">
              <input id="capacityKw" name="capacityKw" inputMode="decimal" className="input" autoComplete="off" />
            </Field>
          )}
          <Field label="How many machines" htmlFor="quantity" hint="Of this model, at this place.">
            <input id="quantity" name="quantity" type="number" inputMode="numeric" min={1} max={200} defaultValue={1} className="input" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Serial numbers" htmlFor="serials" hint="Optional. One per line or separated by commas. If you leave it empty, the CRM gives each machine a reference number (REF-…) that you can change later.">
              <textarea id="serials" name="serials" rows={2} className="textarea" />
            </Field>
          </div>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="3. Installation and warranty" hint="The warranty is counted from the installation date.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Installed on" htmlFor="installedOn" required hint="The day it was installed or handed over.">
            <input id="installedOn" name="installedOn" type="date" max={today} className="input" value={installedOn} onChange={(e) => setInstalledOn(e.target.value)} />
          </Field>
          <Field label="Warranty" htmlFor="warrantyChoice">
            <select id="warrantyChoice" name="warrantyChoice" className="select" value={warrantyChoice} onChange={(e) => setWarrantyChoice(e.target.value)}>
              <option value="default">Standard for the model{model ? ` (${monthsText(model.warrantyMonths)})` : ""}</option>
              {WARRANTY_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {monthsText(m)}
                </option>
              ))}
              <option value="custom">I know the end date</option>
            </select>
          </Field>
          {warrantyChoice === "custom" && (
            <Field label="Warranty ends on" htmlFor="warrantyEndsOn" required>
              <input id="warrantyEndsOn" name="warrantyEndsOn" type="date" className="input" value={warrantyEndsOn} onChange={(e) => setWarrantyEndsOn(e.target.value)} />
            </Field>
          )}
        </div>
        {warrantyPreview && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" aria-live="polite">
            Warranty from <b>{formatDate(warrantyPreview.startsOn)}</b> to <b>{formatDate(warrantyPreview.endsOn)}</b>:{" "}
            <span className={warrantyPreview.status === "EXPIRED" ? "font-medium text-rose-700" : "font-medium text-emerald-700"}>{STATE_TEXT[warrantyPreview.status]}</span>.
          </p>
        )}
      </Section>

      <Section icon={CalendarClock} title="4. Maintenance contract (AMC)" hint="Only if the customer has one for these machines.">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
          <input type="checkbox" name="hasAmc" checked={hasAmc} onChange={(e) => setHasAmc(e.target.checked)} className="size-5 rounded border-slate-300 accent-[var(--primary)]" />
          <span className="text-sm font-medium text-slate-800">This customer has an AMC for these machines</span>
        </label>

        {hasAmc && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="AMC starts on" htmlFor="amcStart" required>
              <input id="amcStart" name="amcStart" type="date" className="input" value={amcStart} onChange={(e) => setAmcStart(e.target.value)} />
            </Field>
            <Field label="AMC period" htmlFor="amcTerm">
              <select id="amcTerm" name="amcTerm" className="select" value={amcTerm} onChange={(e) => setAmcTerm(e.target.value)}>
                {AMC_TERMS.map((m) => (
                  <option key={m} value={m}>
                    {monthsText(m)}
                  </option>
                ))}
                <option value="custom">I know the end date</option>
              </select>
            </Field>
            {amcTerm === "custom" && (
              <Field label="AMC ends on" htmlFor="amcEnd" required>
                <input id="amcEnd" name="amcEnd" type="date" className="input" value={amcEnd} onChange={(e) => setAmcEnd(e.target.value)} />
              </Field>
            )}
            <Field label="AMC charges (₹)" htmlFor="amcAmount" hint="The annual maintenance charge.">
              <input id="amcAmount" name="amcAmount" inputMode="decimal" className="input" autoComplete="off" />
            </Field>
            <Field label="Visits per year" htmlFor="amcVisits">
              <input id="amcVisits" name="amcVisits" type="number" inputMode="numeric" min={1} max={52} defaultValue={2} className="input" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Covered parts" htmlFor="amcParts" hint="Optional: what the contract includes.">
                <textarea id="amcParts" name="amcParts" rows={2} className="textarea" />
              </Field>
            </div>
            {amcPreview && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:col-span-2" aria-live="polite">
                AMC from <b>{formatDate(amcStart)}</b> to <b>{formatDate(amcPreview.end)}</b>:{" "}
                <span className={amcPreview.status === "expired" ? "font-medium text-rose-700" : "font-medium text-emerald-700"}>{amcPreview.status}</span>.
              </p>
            )}
          </div>
        )}
      </Section>

      <section className="rounded-xl border border-[var(--border)] bg-white p-4 sm:p-5">
        <Field label="Notes" htmlFor="notes" hint="Optional: anything worth remembering about the site or the machines.">
          <textarea id="notes" name="notes" rows={2} className="textarea" />
        </Field>
      </section>

      {state.error && (
        <p className="form-error flex items-start gap-2" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !hydrated || (mode === "existing" && !customer)} className="btn btn-primary min-h-11 w-full sm:w-auto">
          {pending ? "Saving…" : "Save installation"}
        </button>
        {mode === "existing" && !customer && <span className="text-xs text-slate-400">Choose the customer first.</span>}
      </div>
    </form>
  );
}

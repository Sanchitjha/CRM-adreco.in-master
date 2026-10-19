"use client";

import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";
import { createSurvey } from "@/app/(dashboard)/surveys/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { APPLICATIONS, ELECTRICAL_SUPPLY, INSTALL_LOCATIONS } from "@/lib/validation/survey";

type LeadOption = { id: string; customerName: string };

function Field({
  label,
  name,
  type = "text",
  placeholder,
  suffix,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
        {suffix && <span className="ml-1 font-normal text-slate-400">({suffix})</span>}
      </label>
      <input id={name} name={name} type={type} placeholder={placeholder} className="input" />
    </div>
  );
}

export function NewSurveyForm({ leads, lockedLeadId }: { leads: LeadOption[]; lockedLeadId?: string }) {
  const [state, formAction, pending] = useActionState(createSurvey, INITIAL_ACTION_STATE);
  const lockedLead = lockedLeadId ? leads.find((l) => l.id === lockedLeadId) : undefined;

  return (
    <form action={formAction} className="space-y-8">
      {/* Lead + application */}
      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="leadId" className="label">
              Lead / customer <span className="text-rose-500">*</span>
            </label>
            {lockedLead ? (
              <>
                <input type="hidden" name="leadId" value={lockedLead.id} />
                <div className="input bg-slate-50 text-slate-600">{lockedLead.customerName}</div>
              </>
            ) : (
              <select id="leadId" name="leadId" required className="select" defaultValue="">
                <option value="" disabled>
                  Select a lead…
                </option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.customerName}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="application" className="label">
              Application <span className="text-rose-500">*</span>
            </label>
            <select id="application" name="application" required className="select" defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              {APPLICATIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Field label="Site address" name="siteAddress" placeholder="Installation site" />
      </section>

      {/* Requirement */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Requirement</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Required water temp" name="requiredTempC" type="number" suffix="°C" placeholder="55" />
          <Field label="Ambient temp" name="ambientTempC" type="number" suffix="°C" placeholder="12" />
          <Field label="Daily hot-water demand" name="dailyDemandL" type="number" suffix="L/day" placeholder="5000" />
          <Field label="Peak-hour demand" name="peakHourL" type="number" suffix="L" placeholder="1500" />
          <Field label="Number of users" name="numberOfUsers" type="number" placeholder="120" />
          <Field label="Pool size" name="poolSize" placeholder="25m × 12m (if pool)" />
          <div>
            <label htmlFor="electricalSupply" className="label">
              Electrical supply
            </label>
            <select id="electricalSupply" name="electricalSupply" className="select" defaultValue="">
              <option value="">Select…</option>
              {ELECTRICAL_SUPPLY.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="installLocation" className="label">
              Installation location
            </label>
            <select id="installLocation" name="installLocation" className="select" defaultValue="">
              <option value="">Select…</option>
              {INSTALL_LOCATIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <Field label="Existing system" name="existingSystem" placeholder="e.g. Electric geyser, boiler" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pipingDetails" className="label">
              Piping details
            </label>
            <textarea id="pipingDetails" name="pipingDetails" rows={2} className="textarea" />
          </div>
          <div>
            <label htmlFor="storageTank" className="label">
              Storage tank
            </label>
            <textarea id="storageTank" name="storageTank" rows={2} className="textarea" placeholder="Capacity, location" />
          </div>
        </div>
      </section>

      {/* Recommendation */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Recommendation</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Recommended model" name="recommendedModel" placeholder="e.g. EVI-30" />
          <Field label="Capacity" name="recommendedCapacityKw" type="number" suffix="kW" placeholder="30" />
          <Field label="Quantity" name="recommendedQty" type="number" placeholder="2" />
        </div>
        <div className="mt-4">
          <label htmlFor="engineerRemarks" className="label">
            Engineer remarks
          </label>
          <textarea
            id="engineerRemarks"
            name="engineerRemarks"
            rows={3}
            className="textarea"
            placeholder="Site conditions, selection rationale, next steps…"
          />
        </div>
      </section>

      {state.error && (
        <p className="form-error flex items-center gap-2">
          <TriangleAlert className="size-4" />
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save survey"}
        </button>
      </div>
    </form>
  );
}

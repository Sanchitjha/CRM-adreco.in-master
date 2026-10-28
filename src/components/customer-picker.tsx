/**
 * First step of a two-step create flow: choose a customer, then reload the page with `?leadId=` so the next
 * form can offer that customer's machines. A plain GET form, so it needs no client-side script.
 */
export function CustomerPicker({
  action,
  leads,
  extraParams,
  submitLabel = "Continue",
}: {
  action: string;
  leads: { id: string; customerName: string; phone: string }[];
  extraParams?: Record<string, string>;
  submitLabel?: string;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3">
      {Object.entries(extraParams ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="min-w-64 flex-1">
        <label htmlFor="leadId" className="label">
          Customer <span className="text-rose-500">*</span>
        </label>
        <select id="leadId" name="leadId" required className="select" defaultValue="">
          <option value="" disabled>
            Select a customer…
          </option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.customerName} · {l.phone}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}

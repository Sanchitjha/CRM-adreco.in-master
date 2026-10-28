"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { createQuotation } from "@/app/(dashboard)/quotations/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { computeQuoteTotals } from "@/lib/validation/quotation";
import { addCatalogLine, type CatalogProduct, type QuoteRow } from "@/lib/quotation-lines";
import { formatINR } from "@/lib/utils";

type LeadOption = { id: string; customerName: string };
type Row = QuoteRow;

const catalogLabel = (p: CatalogProduct) =>
  `${p.name} (${p.modelCode}) — ${p.customerPrice === null ? "no price set" : formatINR(p.customerPrice)}`;

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function NewQuotationForm({
  leads,
  products = [],
  lockedLeadId,
  lockedSurveyId,
}: {
  leads: LeadOption[];
  /** Active catalog products to pick line items from; empty hides the picker. */
  products?: CatalogProduct[];
  lockedLeadId?: string;
  lockedSurveyId?: string;
}) {
  const [state, formAction, pending] = useActionState(createQuotation, INITIAL_ACTION_STATE);
  const [rows, setRows] = useState<Row[]>([{ description: "", quantity: "1", unitPrice: "" }]);
  const [discountPct, setDiscountPct] = useState("0");
  const [gstPct, setGstPct] = useState("18");
  const [installation, setInstallation] = useState("");
  const [transport, setTransport] = useState("");

  const lockedLead = lockedLeadId ? leads.find((l) => l.id === lockedLeadId) : undefined;

  const parsedItems = rows.map((r) => ({
    description: r.description,
    quantity: num(r.quantity),
    unitPrice: num(r.unitPrice),
  }));
  const totals = computeQuoteTotals({
    items: parsedItems,
    discountPct: num(discountPct),
    gstPct: num(gstPct),
    installationCharge: num(installation),
    transportCharge: num(transport),
  });

  const itemsJson = JSON.stringify(
    parsedItems.filter((i) => i.description.trim().length > 0).map((i) => ({
      description: i.description.trim(),
      quantity: Math.max(1, Math.round(i.quantity)),
      unitPrice: i.unitPrice,
    })),
  );

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { description: "", quantity: "1", unitPrice: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }
  function addFromCatalog(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (product) setRows((rs) => addCatalogLine(rs, product));
  }

  const machines = products.filter((p) => !p.isSparePart);
  const spareParts = products.filter((p) => p.isSparePart);

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="itemsJson" value={itemsJson} />
      {lockedSurveyId && <input type="hidden" name="siteSurveyId" value={lockedSurveyId} />}

      {/* Lead */}
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
          <label htmlFor="validUntil" className="label">
            Valid until
          </label>
          <input id="validUntil" name="validUntil" type="date" className="input" />
        </div>
      </div>

      {/* Line items */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Line items</h3>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {products.length > 0 && (
              <>
                <label htmlFor="catalogProduct" className="sr-only">
                  Add a product from the catalog
                </label>
                {/* No name and a fixed empty value: picking a product adds a row, then the box returns to its prompt. */}
                <select
                  id="catalogProduct"
                  value=""
                  onChange={(e) => addFromCatalog(e.target.value)}
                  className="select w-full min-w-0 py-1.5 text-sm sm:w-auto sm:max-w-80"
                >
                  <option value="">Add from product catalog…</option>
                  {machines.length > 0 && (
                    <optgroup label="Machines">
                      {machines.map((p) => (
                        <option key={p.id} value={p.id}>
                          {catalogLabel(p)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {spareParts.length > 0 && (
                    <optgroup label="Spare parts">
                      {spareParts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {catalogLabel(p)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </>
            )}
            <button type="button" onClick={addRow} className="btn btn-secondary btn-sm">
              <Plus className="size-3.5" />
              Add item
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <div className="hidden bg-slate-50/70 px-3 py-2 text-xs font-medium text-slate-500 sm:grid sm:grid-cols-[1fr_84px_120px_120px_36px] sm:gap-2">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {rows.map((r, i) => {
              const amount = num(r.quantity) * num(r.unitPrice);
              return (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[1fr_84px_120px_120px_36px] sm:items-center"
                >
                  <input
                    aria-label="Description"
                    className="input py-1.5"
                    placeholder="e.g. EVI Heat Pump 30 kW (supply + install)"
                    value={r.description}
                    onChange={(e) => updateRow(i, { description: e.target.value })}
                  />
                  <input
                    aria-label="Quantity"
                    type="number"
                    min={1}
                    className="input py-1.5"
                    value={r.quantity}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  />
                  <input
                    aria-label="Unit price"
                    type="number"
                    min={0}
                    className="input py-1.5"
                    placeholder="0"
                    value={r.unitPrice}
                    onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                  />
                  <div className="text-right text-sm font-medium tabular-nums text-slate-700 sm:pr-1">
                    {formatINR(amount)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label="Remove item"
                    className="flex size-8 items-center justify-center justify-self-end rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Charges + totals */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="discountPct" className="label">
              Discount (%)
            </label>
            <input
              id="discountPct"
              name="discountPct"
              type="number"
              min={0}
              max={100}
              className="input"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="gstPct" className="label">
              GST (%)
            </label>
            <input
              id="gstPct"
              name="gstPct"
              type="number"
              min={0}
              max={100}
              className="input"
              value={gstPct}
              onChange={(e) => setGstPct(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="installationCharge" className="label">
              Installation (₹)
            </label>
            <input
              id="installationCharge"
              name="installationCharge"
              type="number"
              min={0}
              className="input"
              placeholder="0"
              value={installation}
              onChange={(e) => setInstallation(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="transportCharge" className="label">
              Transport (₹)
            </label>
            <input
              id="transportCharge"
              name="transportCharge"
              type="number"
              min={0}
              className="input"
              placeholder="0"
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-slate-50/60 p-4">
          <dl className="space-y-2 text-sm">
            <Line label="Subtotal" value={formatINR(totals.subtotal)} />
            {totals.discountAmount > 0 && (
              <Line label={`Discount (${num(discountPct)}%)`} value={`- ${formatINR(totals.discountAmount)}`} />
            )}
            {totals.installationCharge > 0 && <Line label="Installation" value={formatINR(totals.installationCharge)} />}
            {totals.transportCharge > 0 && <Line label="Transport" value={formatINR(totals.transportCharge)} />}
            <Line label={`GST (${num(gstPct)}%)`} value={formatINR(totals.gstAmount)} />
            <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2.5">
              <dt className="font-semibold text-slate-900">Grand total</dt>
              <dd className="text-lg font-semibold tabular-nums text-brand-700">{formatINR(totals.grandTotal)}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Notes + terms */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="notes" className="label">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={3} className="textarea" placeholder="Scope of supply, recommended system…" />
        </div>
        <div>
          <label htmlFor="terms" className="label">
            Terms
          </label>
          <textarea id="terms" name="terms" rows={3} className="textarea" placeholder="Payment terms, warranty, validity…" />
        </div>
      </div>

      {state.error && (
        <p className="form-error flex items-center gap-2">
          <TriangleAlert className="size-4" />
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save quotation"}
        </button>
      </div>
    </form>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="tabular-nums text-slate-700">{value}</dd>
    </div>
  );
}

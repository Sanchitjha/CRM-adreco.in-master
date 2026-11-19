"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

export type CustomerChoice = { id: string; name: string; phone: string; address: string | null };

const MAX_SHOWN = 8;

const describe = (c: CustomerChoice) => [c.address, c.phone].filter(Boolean).join(" · ") || "No address or phone saved";

/**
 * Finds a customer by typing part of the name, the city or the phone number: a short list of matches to pick from, and
 * a card with a Change button once one is chosen. Easier than a drop-down of hundreds of names, on a phone especially.
 */
export function CustomerSearch({
  customers,
  value,
  onChange,
  inputId = "customer-search",
  noMatchHint,
}: {
  customers: CustomerChoice[];
  value: CustomerChoice | null;
  onChange: (customer: CustomerChoice | null) => void;
  inputId?: string;
  noMatchHint?: string;
}) {
  const [search, setSearch] = useState("");

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return customers.filter((c) => `${c.name} ${c.address ?? ""} ${c.phone}`.toLowerCase().includes(q)).slice(0, MAX_SHOWN);
  }, [customers, search]);

  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{value.name}</p>
          <p className="truncate text-xs text-slate-600">{describe(value)}</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="btn btn-secondary btn-sm shrink-0">
          <X className="size-3.5" />
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className="label">
        Find the customer
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type a name, city or phone number"
          autoComplete="off"
          className="input pl-9"
        />
      </div>
      {search.trim() !== "" && (
        <ul className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-white" role="listbox" aria-label="Matching customers">
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">{noMatchHint ?? "No customer matches."}</li>
          ) : (
            matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onChange(c);
                    setSearch("");
                  }}
                  className="block min-h-12 w-full px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                  <span className="block truncate text-xs text-slate-500">{describe(c)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      <p className="mt-1 text-xs text-slate-400">{customers.length.toLocaleString("en-IN")} customers in the CRM.</p>
    </div>
  );
}

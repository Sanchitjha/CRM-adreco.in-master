"use client";

import { useRef, useState } from "react";
import { CircleCheck, Trash2, TriangleAlert } from "lucide-react";
import { previewCleanup, runCleanup, type CleanupState } from "@/app/(dashboard)/admin/data/actions";
import { CLEANUP_MONTH_CHOICES, PROTECTION_LABELS, type Protection } from "@/lib/data-cleanup";

export type ImportOption = { id: string; label: string };

export function CleanupForm({ imports }: { imports: ImportOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"older" | "range" | "all">("older");
  const [scope, setScope] = useState("all");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<CleanupState>({});
  const [busy, setBusy] = useState(false);

  const report = state.report;
  const finished = report?.deleted !== undefined;
  const canDelete = !!report && !finished && report.deletable > 0 && confirm.trim() === report.phrase;
  const onlyForImport = scope.startsWith("batch:");

  // Any change to the choices makes an earlier preview out of date.
  function choicesChanged() {
    setState({});
    setConfirm("");
  }

  async function send(kind: "preview" | "run") {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    data.set("expected", String(report?.deletable ?? 0));
    data.set("confirm", confirm);
    setBusy(true);
    try {
      const result = await (kind === "preview" ? previewCleanup : runCleanup)({}, data);
      setState(result);
      if (kind === "run") setConfirm("");
    } catch {
      setState({ error: "That did not finish. Preview again and check the numbers before trying once more." });
    }
    setBusy(false);
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-5">
      <fieldset className="space-y-3" disabled={busy}>
        <legend className="label">Which leads</legend>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="mode" value="older" checked={mode === "older"} onChange={() => { setMode("older"); choicesChanged(); }} />
            Older than
          </label>
          <select name="months" defaultValue="3" onChange={choicesChanged} className="select w-auto py-1.5 text-sm" disabled={mode !== "older"}>
            {CLEANUP_MONTH_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m} month{m === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">by the date the lead was created (for imported leads, the date in the sheet)</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="mode" value="range" checked={mode === "range"} onChange={() => { setMode("range"); choicesChanged(); }} />
            Created between
          </label>
          <input type="date" name="from" onChange={choicesChanged} className="input w-auto py-1.5 text-sm" disabled={mode !== "range"} />
          <span className="text-sm text-slate-500">and</span>
          <input type="date" name="to" onChange={choicesChanged} className="input w-auto py-1.5 text-sm" disabled={mode !== "range"} />
        </div>

        <label className={`flex items-center gap-2 text-sm ${onlyForImport ? "text-slate-700" : "text-slate-300"}`}>
          <input
            type="radio"
            name="mode"
            value="all"
            checked={mode === "all"}
            disabled={!onlyForImport}
            onChange={() => { setMode("all"); choicesChanged(); }}
          />
          Any date <span className="text-xs">(only when clearing one specific import)</span>
        </label>
      </fieldset>

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="label">Among</legend>
        <select
          name="scope"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            if (!e.target.value.startsWith("batch:") && mode === "all") setMode("older");
            choicesChanged();
          }}
          className="select max-w-xl text-sm"
        >
          <option value="all">All leads</option>
          <option value="imports">Only leads that came in through an import</option>
          {imports.map((i) => (
            <option key={i.id} value={`batch:${i.id}`}>
              Only this import: {i.label}
            </option>
          ))}
        </select>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="includeQuoted" onChange={choicesChanged} className="mt-0.5" />
          <span>
            Also delete leads that have quotations or site surveys
            <span className="block text-xs text-slate-400">Left off by default, so offers already made are kept.</span>
          </span>
        </label>
      </fieldset>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Leads that became customers, or that have orders, installation jobs, service tickets, machines or maintenance contracts, are never
        deleted here. Deleting a lead also deletes its follow-ups, contacts, documents list, surveys, quotations and chat. This cannot be
        undone from the CRM; the database backups of the last 14 days are the only way back.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => send("preview")} disabled={busy} className="btn btn-secondary">
          {busy && !report ? "Working…" : "Preview what would be deleted"}
        </button>
      </div>

      {state.error && (
        <p className="form-error flex items-center gap-2" role="alert">
          <TriangleAlert className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {report && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-slate-50/60 p-4" role="status">
          {state.message && (
            <p className={`flex items-center gap-2 text-sm font-medium ${finished ? "text-emerald-700" : "text-slate-800"}`}>
              <CircleCheck className="size-4 shrink-0" />
              {state.message}
            </p>
          )}
          <p className="text-sm text-slate-600">
            {report.scopeText}, {report.rangeText}: <b>{report.inRange.toLocaleString("en-IN")}</b> found.
          </p>

          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label={finished ? "Deleted" : "Will be deleted"} value={finished ? (report.deleted ?? 0) : report.deletable} />
            {(Object.keys(PROTECTION_LABELS) as Protection[]).map((p) => (
              <Stat key={p} label={`Kept: ${shortLabel(p)}`} value={report.kept[p]} />
            ))}
          </dl>

          {report.months.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700">By the month they were created</p>
              <ul className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-600">
                {report.months.map((m) => (
                  <li key={m.month} className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[var(--border)]">
                    {m.month}: {m.count.toLocaleString("en-IN")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!finished && report.deletable > 0 && (
            <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
              <label htmlFor="cleanup-confirm" className="text-sm font-medium text-rose-800">
                To delete {report.deletable.toLocaleString("en-IN")} lead(s), type <code className="rounded bg-white px-1.5 py-0.5">{report.phrase}</code>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="cleanup-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="off"
                  className="input w-48 py-1.5 text-sm"
                  disabled={busy}
                />
                <button type="button" onClick={() => send("run")} disabled={busy || !canDelete} className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                  <Trash2 className="size-3.5" />
                  {busy ? "Deleting…" : "Delete these leads"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

function shortLabel(p: Protection): string {
  return p === "converted" ? "customers" : p === "business" ? "with orders, jobs, tickets" : "with quotations or surveys";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{value.toLocaleString("en-IN")}</dd>
    </div>
  );
}

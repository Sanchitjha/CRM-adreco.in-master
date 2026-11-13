"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CircleCheck, Sparkles, TriangleAlert } from "lucide-react";
import {
  importLeads,
  type ImportReport,
  type ImportSheetReport,
  type ImportState,
  type OwnerWarning,
} from "@/app/(dashboard)/leads/import/actions";
import { IMPORT_FIELDS } from "@/lib/lead-import";
import { PERIOD_MONTH_CHOICES } from "@/lib/import-period";

const SHOWN = 25;

/** The column each heading was given, as { sheet: { column: field } }; "" means ignored. */
type Choices = Record<number, Record<number, string>>;

const choicesFrom = (sheets: ImportSheetReport[]): Choices =>
  Object.fromEntries(sheets.map((s) => [s.index, Object.fromEntries(s.columns.map((c) => [c.index, c.field ?? ""]))]));

type Totals = { created: number; contacts: number; followUps: number; duplicates: ImportReport["duplicates"]; owners: Map<string, OwnerWarning> };

export function ImportLeadsForm({ admin }: { admin: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [months, setMonths] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [choices, setChoices] = useState<Choices | null>(null);
  const [state, setState] = useState<ImportState>({});
  const [progress, setProgress] = useState<string | null>(null);

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const busy = progress !== null;
  const report = state.report;
  const imported = report?.mode === "import";

  function formData(mode: "check" | "import"): FormData {
    const data = new FormData();
    data.set("file", file as File);
    data.set("mode", mode);
    data.set("months", months);
    data.set("from", from);
    data.set("to", to);
    if (choices) data.set("columnMap", JSON.stringify(choices));
    return data;
  }

  async function check() {
    setProgress("Checking the file…");
    try {
      const result = await importLeads({}, formData("check"));
      setState(result);
      if (result.report) setChoices(choicesFrom(result.report.sheets));
    } catch {
      setState({ error: "The file could not be checked. If it is large, try a smaller one." });
    }
    setProgress(null);
  }

  // The file is saved a step at a time, so a big one never waits on a single long request.
  async function runImport() {
    const totals: Totals = { created: 0, contacts: 0, followUps: 0, duplicates: [], owners: new Map() };
    let first: ImportReport | null = null;
    let last: ImportReport | null = null;
    let offset = 0;
    let batchId = "";

    try {
      for (;;) {
        const data = formData("import");
        data.set("offset", String(offset));
        if (batchId) data.set("batchId", batchId);
        const result = await importLeads({}, data);
        if (result.error || !result.report) {
          setState({ error: `${result.error ?? "The import stopped."}${totals.created > 0 ? ` ${totals.created} lead(s) were saved before it stopped.` : ""}`, report: last ?? undefined });
          setProgress(null);
          return;
        }
        const r = result.report;
        first ??= r;
        last = r;
        batchId = r.batchId ?? batchId;
        totals.created += r.ready;
        totals.contacts += r.contacts;
        totals.followUps += r.followUps;
        totals.duplicates.push(...r.duplicates);
        for (const w of r.ownerWarnings) {
          const entry = totals.owners.get(w.owner);
          totals.owners.set(w.owner, entry ? { ...entry, count: entry.count + w.count } : w);
        }
        setProgress(`Importing… ${Math.min(r.nextOffset, r.inPeriod).toLocaleString("en-IN")} of ${r.inPeriod.toLocaleString("en-IN")} prospects`);
        offset = r.nextOffset;
        if (r.done) break;
      }
    } catch {
      setState({ error: `The import stopped part-way. ${totals.created} lead(s) were saved; run the same file again and the saved ones are skipped as duplicates.` });
      setProgress(null);
      return;
    }

    const base = first as ImportReport;
    setState({
      message: `Imported ${totals.created} lead(s).`,
      report: {
        ...base,
        mode: "import",
        ready: totals.created,
        contacts: totals.contacts,
        followUps: totals.followUps,
        duplicates: totals.duplicates,
        ownerWarnings: [...totals.owners.values()].sort((a, b) => b.count - a.count),
        batchId: batchId || null,
        done: true,
      },
    });
    setProgress(null);
  }

  function changeColumn(sheet: number, column: number, field: string) {
    setChoices((current) => {
      const next: Choices = { ...(current ?? {}) };
      const sheetChoices = { ...(next[sheet] ?? {}) };
      // A field can feed only one column: choosing it here frees it from any other.
      if (field !== "") for (const [col, f] of Object.entries(sheetChoices)) if (f === field) sheetChoices[Number(col)] = "";
      sheetChoices[column] = field;
      next[sheet] = sheetChoices;
      return next;
    });
  }

  const columnsChanged = report && choices && report.mode === "check" ? JSON.stringify(choices) !== JSON.stringify(choicesFrom(report.sheets)) : false;

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div>
          <label htmlFor="lead-file" className="label">
            Excel or CSV file
          </label>
          <input
            id="lead-file"
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setState({});
              setChoices(null);
            }}
            disabled={busy}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <p className="mt-1 text-xs text-slate-400">
            An Excel workbook (.xlsx) or a CSV, up to 10 MB. Every sheet of a workbook is read, so one sheet per month works.
          </p>
        </div>

        <fieldset className="rounded-xl border border-[var(--border)] p-4" disabled={busy}>
          <legend className="px-1 text-sm font-medium text-slate-700">How much of the sheet to bring in</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="period-months" className="label">
                Last…
              </label>
              <select id="period-months" value={months} onChange={(e) => setMonths(e.target.value)} className="select" disabled={from !== "" || to !== ""}>
                <option value="">Everything in the file</option>
                {PERIOD_MONTH_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m === 1 ? "Last 1 month" : `Last ${m} months`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="period-from" className="label">
                Or from date
              </label>
              <input id="period-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="period-to" className="label">
                to date
              </label>
              <input id="period-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Judged by the sheet&rsquo;s date column. Rows with no date are left out when you choose a period. Each lead keeps the date from
            the sheet as the day it was created.
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} disabled={busy || !hydrated || !file} className="btn btn-secondary">
            {columnsChanged ? "Check again with these columns" : "Check file"}
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={busy || !hydrated || !file || !report || report.mode !== "check" || report.inPeriod === 0 || columnsChanged}
            className="btn btn-primary"
          >
            {report?.mode === "check" && report.ready > 0 ? `Import ${report.ready.toLocaleString("en-IN")} lead(s)` : "Import"}
          </button>
          {progress && <span className="text-sm text-slate-600">{progress}</span>}
        </div>
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
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CircleCheck className="size-4 shrink-0" />
              {state.message}
            </p>
          )}

          {report.aiNote && (
            <p className="flex items-start gap-2 text-xs text-slate-600">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
              {report.aiNote} Only the column headings are sent to the AI, never the rows.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Stat label="Rows in file" value={report.totalRows} />
            <Stat label="Chosen period" text={report.period} />
            <Stat label="Prospects in the period" value={report.inPeriod} />
            <Stat label={imported ? "Leads imported" : "Leads ready to import"} value={report.ready} />
            <Stat label="Other contacts" value={report.contacts} />
            <Stat label="With follow-up" value={report.followUps} />
            <Stat label="Already in CRM" value={report.duplicates.length} />
            <Stat label="Need fixing" value={report.problems.length} />
            {(report.outsidePeriod > 0 || report.undated > 0) && (
              <Stat label="Left out by the period" value={report.outsidePeriod + report.undated} />
            )}
          </dl>

          {report.undated > 0 && (
            <p className="text-xs text-amber-700">
              {report.undated} prospect{report.undated === 1 ? " has" : "s have"} no date in the sheet, so a period cannot place{" "}
              {report.undated === 1 ? "it" : "them"}. Choose &ldquo;Everything in the file&rdquo; to include them.
            </p>
          )}

          {report.ownerWarnings.length > 0 && (
            <Issues
              title="Owners that could not be matched (those leads were left unassigned)"
              items={report.ownerWarnings.map((w) => `“${w.owner}”: ${w.reason}, ${w.count} lead${w.count === 1 ? "" : "s"}`)}
            />
          )}
          {report.problems.length > 0 && (
            <Issues
              title="Rows that need fixing (skipped)"
              items={report.problems.map((p) => `${p.sheet ? `${p.sheet}, ` : ""}line ${p.line}: ${p.message}`)}
            />
          )}
          {report.duplicates.length > 0 && (
            <Issues
              title="Rows skipped as duplicates"
              items={report.duplicates.map((d) => `${d.sheet ? `${d.sheet}, ` : ""}line ${d.line}: ${d.customerName} (${d.phone}), ${d.reason}`)}
            />
          )}

          {report.mode === "check" && choices && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-700">How the columns were understood</p>
                <p className="text-xs text-slate-400">
                  Columns are matched by their headings, with the AI helping for unusual ones. Change any that look wrong, then check again.
                </p>
              </div>
              {report.sheets.map((sheet) => (
                <SheetColumns key={sheet.index} sheet={sheet} choice={choices[sheet.index] ?? {}} onChange={changeColumn} showName={report.sheets.length > 1} />
              ))}
            </div>
          )}

          {imported && report.ready > 0 && (
            <div className="flex flex-wrap gap-2">
              <Link href="/leads?view=table" className="btn btn-primary btn-sm inline-flex">
                View leads
              </Link>
              {admin && (
                <Link href="/admin/data" className="btn btn-secondary btn-sm inline-flex">
                  See import history
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SheetColumns({
  sheet,
  choice,
  onChange,
  showName,
}: {
  sheet: ImportSheetReport;
  choice: Record<number, string>;
  onChange: (sheet: number, column: number, field: string) => void;
  showName: boolean;
}) {
  const named = sheet.columns.filter((c) => c.heading !== "");
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <p className="text-sm font-medium text-slate-800">{showName ? sheet.name || "Sheet" : "Columns"}</p>
        <p className="text-xs text-slate-500">
          {sheet.skipped ? `Left out: ${sheet.skipped}` : `${sheet.rows.toLocaleString("en-IN")} rows, ${sheet.prospects.toLocaleString("en-IN")} prospects`}
        </p>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {named.map((c) => (
          <li key={c.index} className="flex items-center gap-3 px-3 py-1.5">
            <span className="w-2/5 truncate text-xs text-slate-700" title={c.heading}>
              {c.heading}
            </span>
            <select
              aria-label={`What “${c.heading}” holds`}
              value={choice[c.index] ?? ""}
              onChange={(e) => onChange(sheet.index, c.index, e.target.value)}
              className="select flex-1 py-1 text-xs"
            >
              <option value="">Not used</option>
              {IMPORT_FIELDS.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>
            {c.by === "ai" && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">AI</span>}
            {c.by === "you" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Changed</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, text }: { label: string; value?: number; text?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={text ? "text-sm font-semibold text-slate-900" : "text-lg font-semibold text-slate-900"}>
        {text ?? (value ?? 0).toLocaleString("en-IN")}
      </dd>
    </div>
  );
}

function Issues({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
        {items.slice(0, SHOWN).map((item, i) => (
          <li key={`${i}-${item}`}>{item}</li>
        ))}
        {items.length > SHOWN && <li className="text-slate-400">…and {items.length - SHOWN} more.</li>}
      </ul>
    </div>
  );
}

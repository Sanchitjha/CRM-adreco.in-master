"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CircleCheck, Sparkles, TriangleAlert } from "lucide-react";
import {
  importInstalled,
  type InstalledImportState,
  type InstalledReport,
  type InstalledSheetReport,
} from "@/app/(dashboard)/warranty/installed/actions";
import { INSTALLED_FIELDS } from "@/lib/installed-base";

const SHOWN = 25;

/** The column each heading was given, as { sheet: { column: field } }; "" means ignored. */
type Choices = Record<number, Record<number, string>>;

const choicesFrom = (sheets: InstalledSheetReport[]): Choices =>
  Object.fromEntries(sheets.map((s) => [s.index, Object.fromEntries(s.columns.map((c) => [c.index, c.field ?? ""]))]));

const nf = (n: number) => n.toLocaleString("en-IN");
const problemKey = (p: { sheet?: string; line: number; message: string }) => `${p.sheet ?? ""}|${p.line}|${p.message}`;

export function ImportInstalledForm() {
  const [file, setFile] = useState<File | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [state, setState] = useState<InstalledImportState>({});
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
    if (choices) data.set("columnMap", JSON.stringify(choices));
    return data;
  }

  async function check() {
    setProgress("Checking the file…");
    try {
      const result = await importInstalled({}, formData("check"));
      setState(result);
      if (result.report) setChoices(choicesFrom(result.report.sheets));
    } catch {
      setState({ error: "The file could not be checked. If it is large, try a smaller one." });
    }
    setProgress(null);
  }

  // The file is saved a step at a time, so a big one never waits on a single long request.
  async function runImport() {
    const totals = { machines: 0, customersNew: 0, customersMatched: 0, amcContracts: 0, newModels: 0 };
    const skipped = new Map<string, InstalledReport["skipped"][number]>();
    const problems = new Map<string, InstalledReport["problems"][number]>();
    let first: InstalledReport | null = null;
    let offset = 0;

    try {
      for (;;) {
        const data = formData("import");
        data.set("offset", String(offset));
        const result = await importInstalled({}, data);
        if (result.error || !result.report) {
          setState({
            error: `${result.error ?? "The import stopped."}${totals.machines > 0 ? ` ${nf(totals.machines)} machine(s) were saved before it stopped.` : ""}`,
            report: first ?? undefined,
          });
          setProgress(null);
          return;
        }
        const r = result.report;
        first ??= r;
        totals.machines += r.machines;
        totals.customersNew += r.customersNew;
        totals.customersMatched += r.customersMatched;
        totals.amcContracts += r.amcContracts;
        totals.newModels += r.newModels;
        for (const s of r.skipped) skipped.set(problemKey(s), s);
        for (const p of r.problems) problems.set(problemKey(p), p);
        setProgress(`Importing… ${nf(Math.min(r.nextOffset, r.usableRows))} of ${nf(r.usableRows)} rows`);
        offset = r.nextOffset;
        if (r.done) break;
      }
    } catch {
      setState({ error: `The import stopped part-way. ${nf(totals.machines)} machine(s) were saved; run the same file again and the saved ones are skipped.` });
      setProgress(null);
      return;
    }

    const base = first as InstalledReport;
    setState({
      message: `Imported ${nf(totals.machines)} machine(s).`,
      report: { ...base, mode: "import", ...totals, skipped: [...skipped.values()], problems: [...problems.values()], done: true },
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
          <label htmlFor="installed-file" className="label">
            Excel or CSV file
          </label>
          <input
            id="installed-file"
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setState({});
              setChoices(null);
            }}
            disabled={busy}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <p className="mt-1 text-xs text-slate-400">An Excel workbook (.xlsx) or a CSV, up to 10 MB. Every sheet of a workbook is read.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} disabled={busy || !hydrated || !file} className="btn btn-secondary min-h-11">
            {columnsChanged ? "Check again with these columns" : "Check file"}
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={busy || !hydrated || !file || !report || report.mode !== "check" || report.usableRows === 0 || columnsChanged}
            className="btn btn-primary min-h-11"
          >
            {report?.mode === "check" && report.machines > 0 ? `Import ${nf(report.machines)} machine(s)` : "Import"}
          </button>
          {progress && <span className="text-sm text-slate-600">{progress}</span>}
        </div>
      </div>

      {state.error && (
        <p className="form-error flex items-start gap-2" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {report && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-slate-50/60 p-4" role="status">
          {state.message && (
            <p className="flex items-start gap-2 text-sm font-medium text-emerald-700">
              <CircleCheck className="mt-0.5 size-4 shrink-0" />
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
            <Stat label="Rows that can be used" value={report.usableRows} />
            <Stat label={imported ? "Machines imported" : "Machines ready to import"} value={report.machines} />
            <Stat label="New customers" value={report.customersNew} />
            <Stat label="Customers already in the CRM" value={report.customersMatched} />
            <Stat label="Maintenance contracts" value={report.amcContracts} />
            <Stat label="New models added to the catalogue" value={report.newModels} />
            <Stat label="Already in the CRM (skipped)" value={report.skipped.length} />
            <Stat label="Need fixing (skipped)" value={report.problems.length} />
          </dl>

          {report.newModels > 0 && (
            <p className="text-xs text-slate-600">
              A model that is not in the product catalogue is added to it as an “Existing installation” entry, hidden from new quotations, so each machine still shows its model and capacity.
            </p>
          )}

          {report.problems.length > 0 && (
            <Issues title="Rows that need fixing (skipped)" items={report.problems.map((p) => `${p.sheet ? `${p.sheet}, ` : ""}line ${p.line}: ${p.message}`)} />
          )}
          {report.skipped.length > 0 && (
            <Issues title="Rows skipped because the CRM already has them" items={report.skipped.map((p) => `${p.sheet ? `${p.sheet}, ` : ""}line ${p.line}: ${p.message}`)} />
          )}

          {report.mode === "check" && choices && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-700">How the columns were understood</p>
                <p className="text-xs text-slate-400">Columns are matched by their headings, with the AI helping for unusual ones. Change any that look wrong, then check again.</p>
              </div>
              {report.sheets.map((sheet) => (
                <SheetColumns key={sheet.index} sheet={sheet} choice={choices[sheet.index] ?? {}} onChange={changeColumn} showName={report.sheets.length > 1} />
              ))}
            </div>
          )}

          {imported && report.machines > 0 && (
            <div className="flex flex-wrap gap-2">
              <Link href="/warranty?view=all" className="btn btn-primary btn-sm inline-flex">
                See the machines
              </Link>
              <Link href="/amc" className="btn btn-secondary btn-sm inline-flex">
                See AMC contracts
              </Link>
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
  sheet: InstalledSheetReport;
  choice: Record<number, string>;
  onChange: (sheet: number, column: number, field: string) => void;
  showName: boolean;
}) {
  const named = sheet.columns.filter((c) => c.heading !== "");
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <p className="text-sm font-medium text-slate-800">{showName ? sheet.name || "Sheet" : "Columns"}</p>
        <p className="text-xs text-slate-500">{sheet.skipped ? `Left out: ${sheet.skipped}` : `${nf(sheet.rows)} rows, ${nf(sheet.usable)} usable`}</p>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {named.map((c) => (
          <li key={c.index} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="min-w-0 break-words text-xs text-slate-700 sm:w-2/5" title={c.heading}>
              {c.heading}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <select
                aria-label={`What “${c.heading}” holds`}
                value={choice[c.index] ?? ""}
                onChange={(e) => onChange(sheet.index, c.index, e.target.value)}
                className="select flex-1 py-1.5 text-xs"
              >
                <option value="">Not used</option>
                {INSTALLED_FIELDS.map((f) => (
                  <option key={f.field} value={f.field}>
                    {f.label}
                  </option>
                ))}
              </select>
              {c.by === "ai" && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">AI</span>}
              {c.by === "you" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Changed</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{nf(value)}</dd>
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

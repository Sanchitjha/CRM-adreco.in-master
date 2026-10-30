"use client";

import { startTransition, useActionState, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { importLeads, type ImportState } from "@/app/(dashboard)/leads/import/actions";

const SHOWN = 25;

export function ImportLeadsForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importLeads, {});
  const [fileName, setFileName] = useState("");

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Submit by hand so the chosen file stays selected after a check, ready to import without choosing it again.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  }

  const report = state.report;
  const imported = report?.mode === "import";

  return (
    <div className="space-y-5">
      <form method="post" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="lead-file" className="label">
            CSV file
          </label>
          <input
            id="lead-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <p className="mt-1 text-xs text-slate-400">Save your spreadsheet as “CSV UTF-8”. Up to 2,000 leads and 2 MB.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" name="mode" value="check" disabled={pending || !hydrated || !fileName} className="btn btn-secondary">
            {pending ? "Working…" : "Check file"}
          </button>
          <button
            type="submit"
            name="mode"
            value="import"
            disabled={pending || !hydrated || !fileName || (report?.mode === "check" && report.ready === 0)}
            className="btn btn-primary"
          >
            {report?.mode === "check" && report.ready > 0 ? `Import ${report.ready} lead(s)` : "Import"}
          </button>
        </div>
      </form>

      {state.error && (
        <p className="form-error flex items-center gap-2" role="alert">
          <TriangleAlert className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {report && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-slate-50/60 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CircleCheck className="size-4 shrink-0" />
            {state.message}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Rows in file" value={report.totalRows} />
            <Stat label={imported ? "Imported" : "Ready to import"} value={report.ready} />
            <Stat label="Already in CRM" value={report.duplicates.length} />
            <Stat label="Need fixing" value={report.problems.length} />
          </dl>

          {report.problems.length > 0 && (
            <Issues title="Rows that need fixing (skipped)" items={report.problems.map((p) => `Line ${p.line}: ${p.message}`)} />
          )}
          {report.duplicates.length > 0 && (
            <Issues
              title="Rows skipped as duplicates"
              items={report.duplicates.map((d) => `Line ${d.line}: ${d.customerName} (${d.phone}) — ${d.reason}`)}
            />
          )}

          {imported && report.ready > 0 && (
            <Link href="/leads?view=table" className="btn btn-primary btn-sm inline-flex">
              View leads
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function Issues({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
        {items.slice(0, SHOWN).map((item) => (
          <li key={item}>{item}</li>
        ))}
        {items.length > SHOWN && <li className="text-slate-400">…and {items.length - SHOWN} more.</li>}
      </ul>
    </div>
  );
}

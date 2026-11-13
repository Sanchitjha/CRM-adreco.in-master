import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, Eraser, FileSpreadsheet, History } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { PageHeader, SectionCard } from "@/components/ui";
import { ImportLeadsForm } from "@/components/leads/import-leads-form";
import { CleanupForm } from "@/components/admin/cleanup-form";

export default async function AdminDataPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const [batches, totalLeads, oldest, newest] = await Promise.all([
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        fileName: true,
        createdAt: true,
        period: true,
        leadsAdded: true,
        contacts: true,
        followUps: true,
        createdBy: { select: { name: true } },
        _count: { select: { leads: true } },
      },
    }),
    prisma.lead.count(),
    prisma.lead.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.lead.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const importOptions = batches.slice(0, 15).map((b) => ({
    id: b.id,
    label: `${b.fileName} (${formatDateTime(b.createdAt)}, ${b._count.leads} left)`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Database}
        title="Data import and cleanup"
        description="Bring in the Excel sheets you already keep, a month or several at a time, and clear out old data you no longer need."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Leads in the CRM" value={totalLeads.toLocaleString("en-IN")} />
        <Summary label="Oldest lead" value={oldest ? formatDateTime(oldest.createdAt).split(",")[0] : "—"} />
        <Summary label="Newest lead" value={newest ? formatDateTime(newest.createdAt).split(",")[0] : "—"} />
      </div>

      <SectionCard
        title="Import leads from Excel"
        description="Upload a sheet of any size. Each prospect is read with its contacts and call notes and saved for the right person."
        icon={FileSpreadsheet}
        action={
          <Link href="/leads/import/template" className="btn btn-secondary btn-sm">
            Download template
          </Link>
        }
      >
        <div className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>
              Add a column with each salesperson&rsquo;s <b>name or email</b> (for example &ldquo;Owner&rdquo; or &ldquo;Sales person&rdquo;) and the
              leads are saved under the matching person. Without one, they are left unassigned for you to hand out.
            </li>
            <li>
              Columns are matched by their headings; for unusual headings the <b>AI</b> suggests the match, and you can correct any column before
              saving. Only the headings go to the AI, never the rows.
            </li>
            <li>
              Choose the last 1, 2, 3, 4, 5 or 6 months, or two dates, to bring in only that part of a longer sheet. A workbook with one sheet per
              month is read sheet by sheet.
            </li>
            <li>Customers already in the CRM (same phone or email) are skipped, so the same file can be run again safely.</li>
          </ul>
          <ImportLeadsForm admin />
        </div>
      </SectionCard>

      <SectionCard title="Past imports" description="The latest 25 imports, newest first" icon={History} bodyClassName="p-0">
        {batches.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">Nothing has been imported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">File</th>
                  <th className="px-3 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">By</th>
                  <th className="px-3 py-2.5 font-medium">Part imported</th>
                  <th className="px-3 py-2.5 text-right font-medium">Added</th>
                  <th className="px-5 py-2.5 text-right font-medium">Still in CRM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-5 py-2.5 font-medium text-slate-800">{b.fileName}</td>
                    <td className="px-3 py-2.5 text-slate-600">{formatDateTime(b.createdAt)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{b.createdBy.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{b.period ?? "everything in the file"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.leadsAdded.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{b._count.leads.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Clear old data"
        description="Delete leads by age or by dates. You see exactly what will go before anything is deleted."
        icon={Eraser}
      >
        <CleanupForm imports={importOptions} />
      </SectionCard>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

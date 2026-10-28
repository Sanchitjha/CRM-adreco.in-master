import Link from "next/link";
import { redirect } from "next/navigation";
import type { CommissioningStatus, Prisma } from "@prisma/client";
import { Gauge } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { leadScope } from "@/lib/scope";
import { formatDate } from "@/lib/dates";
import { parseCommissioningChecklist } from "@/lib/lifecycle";
import { COMMISSIONING_STATUS } from "@/lib/statuses";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";
import { ActionButton } from "@/components/action-forms";
import { startCommissioning } from "./actions";

type SearchParams = { status?: string };

export default async function CommissioningPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "commissioning")) redirect("/");

  const { status = "" } = await searchParams;
  const statusFilter = status in COMMISSIONING_STATUS ? (status as CommissioningStatus) : undefined;
  const scope = leadScope(user.role, user.id);
  const manage = canManage(user.role, "commissioning");

  const where: Prisma.CommissioningWhereInput = {
    installation: { lead: scope },
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [reports, statusCounts, ready] = await Promise.all([
    prisma.commissioning.findMany({
      where,
      include: { installation: { include: { lead: true } }, engineer: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commissioning.groupBy({ by: ["status"], where: { installation: { lead: scope } }, _count: { _all: true } }),
    prisma.installation.findMany({
      where: { status: "COMPLETED", commissioning: null, lead: scope },
      include: { lead: true },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const countOf = (s: CommissioningStatus) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const allCount = statusCounts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Gauge}
        title="Commissioning"
        description="Validate performance against specification — completing a report starts the warranty."
      />

      {ready.length > 0 && (
        <SectionCard
          title="Ready for commissioning"
          description="Installations that are complete and waiting to be commissioned"
          icon={Gauge}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-[var(--border)]">
            {ready.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <Link href={`/installations/${job.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-600">
                    {job.jobNumber}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {job.lead.customerName} · completed {formatDate(job.completedAt)}
                  </p>
                </div>
                {manage && (
                  <ActionButton
                    action={startCommissioning}
                    hidden={{ installationId: job.id }}
                    label="Start commissioning"
                    pendingLabel="Starting…"
                    variant="primary"
                  />
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <FilterTabs
        items={[
          { label: "All", href: "/commissioning", active: !statusFilter, count: allCount },
          ...(Object.keys(COMMISSIONING_STATUS) as CommissioningStatus[]).map((s) => ({
            label: COMMISSIONING_STATUS[s].label,
            href: `/commissioning?status=${s}`,
            active: statusFilter === s,
            count: countOf(s),
          })),
        ]}
      />

      <DataTable
        rows={reports}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={Gauge}
            title="No commissioning reports yet"
            description="Start commissioning from a completed installation job."
          />
        }
        columns={[
          {
            header: "Report",
            cell: (r) => (
              <Link href={`/commissioning/${r.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                {r.reportNumber}
              </Link>
            ),
          },
          {
            header: "Customer",
            cell: (r) => <CustomerLink role={user.role} leadId={r.installation.lead.id} name={r.installation.lead.customerName} />,
          },
          { header: "Job", cell: (r) => r.installation.jobNumber },
          { header: "Engineer", cell: (r) => r.engineer?.name ?? <span className="text-slate-400">Unassigned</span> },
          {
            header: "Checks passed",
            cell: (r) => {
              const items = parseCommissioningChecklist(r.checklist);
              return <span className="tabular-nums">{`${items.filter((i) => i.result === "PASS").length}/${items.length}`}</span>;
            },
          },
          { header: "Commissioned", cell: (r) => formatDate(r.commissionedOn) },
          { header: "Status", cell: (r) => <StatusPill meta={COMMISSIONING_STATUS[r.status]} /> },
        ]}
      />
    </div>
  );
}

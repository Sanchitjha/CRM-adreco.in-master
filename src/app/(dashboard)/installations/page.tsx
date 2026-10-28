import Link from "next/link";
import { redirect } from "next/navigation";
import type { InstallationStatus, Prisma } from "@prisma/client";
import { Plus, Search, Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { FIELD_ROLES, canManage, canView } from "@/lib/rbac";
import { leadScope } from "@/lib/scope";
import { formatDate } from "@/lib/dates";
import { parseInstallChecklist } from "@/lib/lifecycle";
import { INSTALLATION_STATUS } from "@/lib/statuses";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";

type SearchParams = { q?: string; status?: string; mine?: string };

export default async function InstallationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "installations")) redirect("/");

  const { q = "", status = "", mine = "" } = await searchParams;
  const statusFilter = status in INSTALLATION_STATUS ? (status as InstallationStatus) : undefined;
  const onlyMine = mine === "1";
  const scope = leadScope(user.role, user.id);
  const manage = canManage(user.role, "installations");

  const where: Prisma.InstallationWhereInput = {
    lead: scope,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(onlyMine ? { technicianId: user.id } : {}),
    ...(q
      ? {
          OR: [
            { jobNumber: { contains: q, mode: "insensitive" } },
            { lead: { customerName: { contains: q, mode: "insensitive" } } },
            { siteAddress: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [jobs, statusCounts, awaiting] = await Promise.all([
    prisma.installation.findMany({
      where,
      include: { lead: true, technician: true },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
    }),
    prisma.installation.groupBy({
      by: ["status"],
      where: { lead: scope, ...(onlyMine ? { technicianId: user.id } : {}) },
      _count: { _all: true },
    }),
    manage
      ? prisma.salesOrder.findMany({
          where: { status: { not: "CANCELLED" }, installations: { none: { status: { not: "CANCELLED" } } } },
          include: { lead: true },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : Promise.resolve([]),
  ]);

  const countOf = (s: InstallationStatus) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const allCount = statusCounts.reduce((sum, c) => sum + c._count._all, 0);
  const href = (s: string, mineFlag = onlyMine) =>
    `/installations?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}), ...(mineFlag ? { mine: "1" } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wrench}
        title="Installations"
        description="Schedule installation jobs and track them from site visit to customer sign-off."
        actions={
          manage ? (
            <Link href="/installations/new" className="btn btn-primary">
              <Plus className="size-4" />
              New job
            </Link>
          ) : undefined
        }
      />

      {awaiting.length > 0 && (
        <SectionCard
          title="Orders without an installation job"
          description="Create a job so the site visit gets scheduled"
          icon={Wrench}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-[var(--border)]">
            {awaiting.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <Link href={`/sales-orders/${o.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-600">
                    {o.orderNumber}
                  </Link>
                  <p className="text-xs text-slate-400">{o.lead.customerName}</p>
                </div>
                <Link href={`/installations/new?orderId=${o.id}`} className="btn btn-secondary btn-sm">
                  Create job
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          items={[
            { label: "All", href: href(""), active: !statusFilter, count: allCount },
            ...(Object.keys(INSTALLATION_STATUS) as InstallationStatus[]).map((s) => ({
              label: INSTALLATION_STATUS[s].label,
              href: href(s),
              active: statusFilter === s,
              count: countOf(s),
            })),
            ...(FIELD_ROLES.includes(user.role)
              ? [{ label: "My jobs", href: href(status, !onlyMine), active: onlyMine }]
              : []),
          ]}
        />
        <form action="/installations" className="flex items-center gap-2">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {onlyMine && <input type="hidden" name="mine" value="1" />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Search job, customer or site" className="input w-64 pl-9" />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
      </div>

      <DataTable
        rows={jobs}
        rowKey={(j) => j.id}
        empty={
          <EmptyState
            icon={Wrench}
            title={q || statusFilter || onlyMine ? "No jobs match these filters" : "No installation jobs yet"}
            description="Jobs are created from a sales order, or directly for a converted customer."
          />
        }
        columns={[
          {
            header: "Job",
            cell: (j) => (
              <Link href={`/installations/${j.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                {j.jobNumber}
              </Link>
            ),
          },
          { header: "Customer", cell: (j) => <CustomerLink role={user.role} leadId={j.lead.id} name={j.lead.customerName} /> },
          { header: "Site", cell: (j) => <span className="line-clamp-1 max-w-56">{j.siteAddress ?? "—"}</span> },
          { header: "Technician", cell: (j) => j.technician?.name ?? <span className="text-slate-400">Unassigned</span> },
          { header: "Scheduled", cell: (j) => formatDate(j.scheduledFor) },
          {
            header: "Checklist",
            cell: (j) => {
              const items = parseInstallChecklist(j.checklist);
              const done = items.filter((i) => i.done).length;
              return <span className="tabular-nums">{items.length ? `${done}/${items.length}` : "—"}</span>;
            },
          },
          { header: "Status", cell: (j) => <StatusPill meta={INSTALLATION_STATUS[j.status]} /> },
        ]}
      />
    </div>
  );
}

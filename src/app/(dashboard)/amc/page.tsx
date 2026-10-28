import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { BellRing, CalendarClock, CalendarX2, CircleCheck, Plus } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { leadScope } from "@/lib/scope";
import { formatDate, parseDateInput, today } from "@/lib/dates";
import { RENEWAL_REMINDER_DAYS, addDaysUtc, amcState, daysBetween, renewalBucket } from "@/lib/lifecycle";
import { AMC_STATE } from "@/lib/statuses";
import { formatINR } from "@/lib/utils";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";

type SearchParams = { view?: string };

const VIEWS = ["active", "renewals", "expired", "cancelled", "all"] as const;
type View = (typeof VIEWS)[number];

export default async function AmcPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "amc")) redirect("/");

  const { view: rawView } = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(rawView ?? "") ? (rawView as View) : "active";

  const todayDate = today();
  const horizon = addDaysUtc(todayDate, Math.max(...RENEWAL_REMINDER_DAYS));
  const monthStart = parseDateInput(`${todayDate.toISOString().slice(0, 7)}-01`)!;
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const scope = leadScope(user.role, user.id);

  const where: Record<View, Prisma.AmcContractWhereInput> = {
    active: { status: "ACTIVE", endDate: { gte: todayDate } },
    renewals: { status: "ACTIVE", endDate: { gte: todayDate, lte: horizon }, renewals: { none: {} } },
    expired: { status: "ACTIVE", endDate: { lt: todayDate } },
    cancelled: { status: "CANCELLED" },
    all: {},
  };

  const [contracts, counts, expiringThisMonth] = await Promise.all([
    prisma.amcContract.findMany({
      where: { lead: scope, ...where[view] },
      include: { lead: true, visits: { select: { status: true } }, _count: { select: { units: true } } },
      orderBy: view === "renewals" || view === "active" ? { endDate: "asc" } : { createdAt: "desc" },
    }),
    Promise.all(VIEWS.map((v) => prisma.amcContract.count({ where: { lead: scope, ...where[v] } }))),
    prisma.amcContract.count({
      where: { lead: scope, status: "ACTIVE", endDate: { gte: todayDate, lte: monthEnd }, renewals: { none: {} } },
    }),
  ]);
  const countOf = (v: View) => counts[VIEWS.indexOf(v)];

  const label: Record<View, string> = {
    active: "Active",
    renewals: "Renewals due",
    expired: "Expired",
    cancelled: "Cancelled",
    all: "All",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        title="AMC contracts"
        description="Preventive maintenance and renewals on autopilot."
        actions={
          canManage(user.role, "amc") ? (
            <Link href="/amc/new" className="btn btn-primary">
              <Plus className="size-4" />
              New contract
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active contracts" value={countOf("active")} icon={CircleCheck} accent="emerald" href="/amc?view=active" />
        <StatCard
          label="Renewals due"
          value={countOf("renewals")}
          icon={BellRing}
          accent="amber"
          href="/amc?view=renewals"
          hint={`Ending within ${Math.max(...RENEWAL_REMINDER_DAYS)} days`}
        />
        <StatCard label="Expiring this month" value={expiringThisMonth} icon={CalendarClock} accent="violet" href="/amc?view=renewals" />
        <StatCard label="Expired" value={countOf("expired")} icon={CalendarX2} accent="rose" href="/amc?view=expired" />
      </div>

      <FilterTabs
        items={VIEWS.map((v) => ({ label: label[v], href: `/amc?view=${v}`, active: view === v, count: countOf(v) }))}
      />

      <DataTable
        rows={contracts}
        rowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={CalendarClock}
            title="No contracts here"
            description="Create a contract for a customer's machines to schedule preventive maintenance visits."
          />
        }
        columns={[
          {
            header: "Contract",
            cell: (c) => (
              <Link href={`/amc/${c.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                {c.contractNumber}
              </Link>
            ),
          },
          { header: "Customer", cell: (c) => <CustomerLink role={user.role} leadId={c.lead.id} name={c.lead.customerName} /> },
          { header: "Machines", align: "right", cell: (c) => <span className="tabular-nums">{c._count.units}</span> },
          { header: "Term", cell: (c) => `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` },
          {
            header: "Visits done",
            cell: (c) => (
              <span className="tabular-nums">
                {c.visits.filter((v) => v.status === "COMPLETED").length}/{c.visits.length}
              </span>
            ),
          },
          { header: "Amount", align: "right", cell: (c) => <span className="tabular-nums">{formatINR(Number(c.amount))}</span> },
          {
            header: "Status",
            cell: (c) => {
              const state = amcState(c, todayDate);
              const bucket = c.status === "ACTIVE" ? renewalBucket(c.endDate, todayDate) : null;
              return (
                <div className="flex flex-col items-start gap-0.5">
                  <StatusPill meta={AMC_STATE[state]} />
                  {bucket && <span className="text-xs text-slate-400">{daysBetween(todayDate, c.endDate)} days left</span>}
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}

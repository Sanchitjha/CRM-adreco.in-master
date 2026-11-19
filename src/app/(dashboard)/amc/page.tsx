import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { BellRing, CalendarClock, CalendarX2, CircleCheck, FileUp, PackagePlus, Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canRecordInstalledBase, canView } from "@/lib/rbac";
import { leadScope } from "@/lib/scope";
import { formatDate, parseDateInput, today } from "@/lib/dates";
import { RENEWAL_REMINDER_DAYS, addDaysUtc, amcState, daysBetween, renewalBucket } from "@/lib/lifecycle";
import { AMC_STATE } from "@/lib/statuses";
import { formatINR } from "@/lib/utils";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";
import { HowItWorks } from "@/components/how-it-works";

type SearchParams = { view?: string; q?: string };

const VIEWS = ["active", "renewals", "expired", "cancelled", "all"] as const;
type View = (typeof VIEWS)[number];

export default async function AmcPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "amc")) redirect("/");

  const { view: rawView, q: rawQ } = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(rawView ?? "") ? (rawView as View) : "active";
  const q = (rawQ ?? "").trim().slice(0, 80);

  const todayDate = today();
  const horizon = addDaysUtc(todayDate, Math.max(...RENEWAL_REMINDER_DAYS));
  const monthStart = parseDateInput(`${todayDate.toISOString().slice(0, 7)}-01`)!;
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  // A search looks at the customer (name, address) and the contract number.
  const scope: Prisma.LeadWhereInput = q
    ? { AND: [leadScope(user.role, user.id), { OR: [{ customerName: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }] }] }
    : leadScope(user.role, user.id);
  const byNumber: Prisma.AmcContractWhereInput = q ? { OR: [{ lead: scope }, { contractNumber: { contains: q, mode: "insensitive" } }] } : { lead: scope };

  const where: Record<View, Prisma.AmcContractWhereInput> = {
    active: { status: "ACTIVE", endDate: { gte: todayDate } },
    renewals: { status: "ACTIVE", endDate: { gte: todayDate, lte: horizon }, renewals: { none: {} } },
    expired: { status: "ACTIVE", endDate: { lt: todayDate } },
    cancelled: { status: "CANCELLED" },
    all: {},
  };

  const [contracts, counts, expiringThisMonth] = await Promise.all([
    prisma.amcContract.findMany({
      where: { AND: [byNumber, where[view]] },
      include: { lead: true, visits: { select: { status: true } }, _count: { select: { units: true } } },
      orderBy: view === "renewals" || view === "active" ? { endDate: "asc" } : { createdAt: "desc" },
    }),
    Promise.all(VIEWS.map((v) => prisma.amcContract.count({ where: { AND: [byNumber, where[v]] } }))),
    prisma.amcContract.count({
      where: { AND: [byNumber, { status: "ACTIVE", endDate: { gte: todayDate, lte: monthEnd }, renewals: { none: {} } }] },
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
          <div className="flex flex-wrap gap-2">
            {canManage(user.role, "amc") && (
              <Link href="/amc/new" className="btn btn-primary">
                <Plus className="size-4" />
                New contract
              </Link>
            )}
            {canRecordInstalledBase(user.role) && (
              <Link href="/warranty/installed/new" className="btn btn-secondary">
                <PackagePlus className="size-4" />
                Add existing installation
              </Link>
            )}
            {canRecordInstalledBase(user.role) && (
              <Link href="/warranty/installed/import" className="btn btn-secondary">
                <FileUp className="size-4" />
                Import from Excel
              </Link>
            )}
          </div>
        }
      />

      <HowItWorks title="How AMC contracts work">
        <p>
          <strong className="font-medium text-slate-800">Making a contract:</strong> press New contract, choose the customer, tick
          the machines it covers (only machines already dispatched to that customer are listed), then enter the start and end dates,
          the number of visits a year, the amount and the parts covered. The CRM lays out the visit dates for you.
        </p>
        <p>
          <strong className="font-medium text-slate-800">Contracts you already have:</strong> press{" "}
          <b className="font-medium text-slate-800">Add existing installation</b> and switch on the AMC section to record the machines
          and their contract together (start date, period, annual charges, visits a year), or{" "}
          <b className="font-medium text-slate-800">Import from Excel</b> for many customers at once. A contract can be changed later
          with <b className="font-medium text-slate-800">Edit contract</b>: its dates, charges, visits, parts and machines.
        </p>
        <p>
          <strong className="font-medium text-slate-800">During the year:</strong> open the contract to mark each visit done, skip
          it or move it to another date. Machines cannot be on two active contracts for the same dates.
        </p>
        <p>
          <strong className="font-medium text-slate-800">At the end:</strong> contracts ending within 60 days appear under
          &ldquo;Renewals due&rdquo; (and in the daily reminders). Press Renew on the contract to start the next one from the old
          one. A machine whose warranty is about to end (see Warranty, Expiring soon) is the best time to offer an AMC.
        </p>
      </HowItWorks>

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

      <form action="/amc" method="get" className="flex gap-2" role="search">
        <input type="hidden" name="view" value={view} />
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input type="search" name="q" defaultValue={q} placeholder="Search a customer, city or contract number" aria-label="Search contracts" className="input pl-9" />
        </div>
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
        {q && (
          <Link href={`/amc?view=${view}`} className="btn btn-secondary">
            Clear
          </Link>
        )}
      </form>

      <FilterTabs
        items={VIEWS.map((v) => ({
          label: label[v],
          href: `/amc?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
          active: view === v,
          count: countOf(v),
        }))}
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

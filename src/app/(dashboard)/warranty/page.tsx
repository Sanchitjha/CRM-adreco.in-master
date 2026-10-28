import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { CalendarX2, CircleCheck, FileWarning, Hourglass, Plus, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { formatDate, today } from "@/lib/dates";
import { EXPIRING_SOON_DAYS, addDaysUtc, daysBetween, warrantyState } from "@/lib/lifecycle";
import { CLAIM_STATUS, WARRANTY_STATE } from "@/lib/statuses";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";

type SearchParams = { view?: string };

const VIEWS = ["active", "expiring", "expired", "pending", "claims"] as const;
type View = (typeof VIEWS)[number];

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "warranty")) redirect("/");

  const { view: rawView } = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(rawView ?? "") ? (rawView as View) : "active";

  const todayDate = today();
  const soon = addDaysUtc(todayDate, EXPIRING_SOON_DAYS);
  const scope: Prisma.SerialNumberWhereInput = user.role === "SALES" ? { lead: { assignedToId: user.id } } : {};

  const unitWhere: Record<Exclude<View, "claims">, Prisma.SerialNumberWhereInput> = {
    active: { warrantyEndsOn: { gt: soon } },
    expiring: { warrantyEndsOn: { gte: todayDate, lte: soon } },
    expired: { warrantyEndsOn: { lt: todayDate } },
    pending: { warrantyEndsOn: null, status: { in: ["DISPATCHED", "INSTALLED"] } },
  };

  const [counts, openClaims, units, claims] = await Promise.all([
    Promise.all((["active", "expiring", "expired", "pending"] as const).map((v) => prisma.serialNumber.count({ where: { ...scope, ...unitWhere[v] } }))),
    prisma.warrantyClaim.count({ where: { serialNumber: scope, status: { in: ["SUBMITTED", "APPROVED"] } } }),
    view === "claims"
      ? Promise.resolve([])
      : prisma.serialNumber.findMany({
          where: { ...scope, ...unitWhere[view] },
          include: { product: true, lead: true },
          orderBy: { warrantyEndsOn: "asc" },
          take: 300,
        }),
    view === "claims"
      ? prisma.warrantyClaim.findMany({
          where: { serialNumber: scope },
          include: { serialNumber: { include: { lead: true } } },
          orderBy: { createdAt: "desc" },
          take: 300,
        })
      : Promise.resolve([]),
  ]);
  const [activeCount, expiringCount, expiredCount, pendingCount] = counts;
  const totalClaims = view === "claims" ? claims.length : undefined;

  const tab = (v: View, label: string, count?: number) => ({ label, href: `/warranty?view=${v}`, active: view === v, count });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Warranty"
        description="Never miss an expiry — or an opportunity."
        actions={
          canManage(user.role, "warranty") ? (
            <Link href="/warranty/claims/new" className="btn btn-primary">
              <Plus className="size-4" />
              New claim
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="In warranty" value={activeCount} icon={CircleCheck} accent="emerald" href="/warranty?view=active" />
        <StatCard
          label={`Expiring in ${EXPIRING_SOON_DAYS} days`}
          value={expiringCount}
          icon={Hourglass}
          accent="amber"
          href="/warranty?view=expiring"
          hint="A chance to offer an AMC"
        />
        <StatCard label="Out of warranty" value={expiredCount} icon={CalendarX2} accent="rose" href="/warranty?view=expired" />
        <StatCard label="Open claims" value={openClaims} icon={FileWarning} accent="violet" href="/warranty?view=claims" />
      </div>

      <FilterTabs
        items={[
          tab("active", "In warranty", activeCount),
          tab("expiring", "Expiring soon", expiringCount),
          tab("expired", "Expired", expiredCount),
          tab("pending", "Awaiting commissioning", pendingCount),
          tab("claims", "Claims", totalClaims),
        ]}
      />

      {view === "claims" ? (
        <DataTable
          rows={claims}
          rowKey={(c) => c.id}
          empty={<EmptyState icon={FileWarning} title="No warranty claims" description="Claims raised against machines under warranty appear here." />}
          columns={[
            {
              header: "Claim",
              cell: (c) => (
                <Link href={`/warranty/claims/${c.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                  {c.claimNumber}
                </Link>
              ),
            },
            { header: "Machine", cell: (c) => c.serialNumber.serialNo },
            {
              header: "Customer",
              cell: (c) =>
                c.serialNumber.lead ? (
                  <CustomerLink role={user.role} leadId={c.serialNumber.lead.id} name={c.serialNumber.lead.customerName} />
                ) : (
                  "—"
                ),
            },
            { header: "Issue", cell: (c) => <span className="line-clamp-1 max-w-64">{c.issue}</span> },
            { header: "Status", cell: (c) => <StatusPill meta={CLAIM_STATUS[c.status]} /> },
            { header: "Raised", align: "right", cell: (c) => <span className="text-slate-400">{formatDate(c.createdAt)}</span> },
          ]}
        />
      ) : (
        <DataTable
          rows={units}
          rowKey={(u) => u.id}
          empty={
            <EmptyState
              icon={ShieldCheck}
              title="Nothing in this group"
              description={
                view === "pending"
                  ? "Machines that are installed but not yet commissioned appear here — warranty starts at commissioning."
                  : "Warranty is tracked per machine, starting when it is commissioned."
              }
            />
          }
          columns={[
            {
              header: "Serial number",
              cell: (u) => (
                <Link href={`/serial-numbers/${u.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                  {u.serialNo}
                </Link>
              ),
            },
            { header: "Product", cell: (u) => u.product.name },
            { header: "Customer", cell: (u) => (u.lead ? <CustomerLink role={user.role} leadId={u.lead.id} name={u.lead.customerName} /> : "—") },
            { header: "Commissioned", cell: (u) => formatDate(u.commissionedAt) },
            { header: "Warranty ends", cell: (u) => formatDate(u.warrantyEndsOn) },
            {
              header: "Days left",
              align: "right",
              cell: (u) => (u.warrantyEndsOn ? <span className="tabular-nums">{daysBetween(todayDate, u.warrantyEndsOn)}</span> : "—"),
            },
            { header: "Status", cell: (u) => <StatusPill meta={WARRANTY_STATE[warrantyState(u.warrantyEndsOn, todayDate)]} /> },
          ]}
        />
      )}
    </div>
  );
}

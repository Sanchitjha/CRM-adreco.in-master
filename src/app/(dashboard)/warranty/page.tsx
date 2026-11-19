import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { CalendarX2, CircleCheck, FileUp, FileWarning, Hourglass, PackagePlus, Plus, Search, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canRecordInstalledBase, canView } from "@/lib/rbac";
import { formatDate, today } from "@/lib/dates";
import { EXPIRING_SOON_DAYS, addDaysUtc, amcState, daysBetween, warrantyState } from "@/lib/lifecycle";
import { AMC_STATE, CLAIM_STATUS, WARRANTY_STATE } from "@/lib/statuses";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";
import { HowItWorks } from "@/components/how-it-works";

type SearchParams = { view?: string; q?: string };

const VIEWS = ["active", "expiring", "expired", "pending", "all", "claims"] as const;
type View = (typeof VIEWS)[number];

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "warranty")) redirect("/");

  const { view: rawView, q: rawQ } = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(rawView ?? "") ? (rawView as View) : "active";
  const q = (rawQ ?? "").trim().slice(0, 80);

  const todayDate = today();
  const soon = addDaysUtc(todayDate, EXPIRING_SOON_DAYS);
  const ownScope: Prisma.SerialNumberWhereInput = user.role === "SALES" ? { lead: { assignedToId: user.id } } : {};
  // A search looks at the customer (name, address), the model, and the serial number.
  const search: Prisma.SerialNumberWhereInput = q
    ? {
        OR: [
          { serialNo: { contains: q, mode: "insensitive" } },
          { product: { OR: [{ name: { contains: q, mode: "insensitive" } }, { modelCode: { contains: q, mode: "insensitive" } }] } },
          { lead: { OR: [{ customerName: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }] } },
        ],
      }
    : {};
  const scope: Prisma.SerialNumberWhereInput = { AND: [ownScope, search] };

  const unitWhere: Record<Exclude<View, "claims">, Prisma.SerialNumberWhereInput> = {
    active: { warrantyEndsOn: { gt: soon } },
    expiring: { warrantyEndsOn: { gte: todayDate, lte: soon } },
    expired: { warrantyEndsOn: { lt: todayDate } },
    pending: { warrantyEndsOn: null, status: { in: ["DISPATCHED", "INSTALLED"] } },
    all: { leadId: { not: null }, status: { in: ["DISPATCHED", "INSTALLED", "COMMISSIONED"] } },
  };

  const [counts, openClaims, units, claims] = await Promise.all([
    Promise.all((["active", "expiring", "expired", "pending", "all"] as const).map((v) => prisma.serialNumber.count({ where: { AND: [scope, unitWhere[v]] } }))),
    prisma.warrantyClaim.count({ where: { serialNumber: scope, status: { in: ["SUBMITTED", "APPROVED"] } } }),
    view === "claims"
      ? Promise.resolve([])
      : prisma.serialNumber.findMany({
          where: { AND: [scope, unitWhere[view]] },
          include: {
            product: true,
            lead: true,
            amcUnits: { include: { amc: { select: { status: true, startDate: true, endDate: true } } } },
          },
          orderBy: [{ warrantyEndsOn: "asc" }, { serialNo: "asc" }],
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
  const [activeCount, expiringCount, expiredCount, pendingCount, allCount] = counts;
  const totalClaims = view === "claims" ? claims.length : undefined;

  const qs = (v: View) => `/warranty?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const tab = (v: View, label: string, count?: number) => ({ label, href: qs(v), active: view === v, count });
  const recorder = canRecordInstalledBase(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Warranty"
        description="Never miss an expiry, or an opportunity."
        actions={
          <div className="flex flex-wrap gap-2">
            {recorder && (
              <Link href="/warranty/installed/new" className="btn btn-primary">
                <PackagePlus className="size-4" />
                Add existing installation
              </Link>
            )}
            {recorder && (
              <Link href="/warranty/installed/import" className="btn btn-secondary">
                <FileUp className="size-4" />
                Import from Excel
              </Link>
            )}
            {canManage(user.role, "warranty") && (
              <Link href="/warranty/claims/new" className="btn btn-secondary">
                <Plus className="size-4" />
                New claim
              </Link>
            )}
          </div>
        }
      />

      <HowItWorks title="How warranty works">
        <p>
          <strong className="font-medium text-slate-800">It starts by itself.</strong> Every product in the catalogue has a warranty
          period (Products, open a product, Warranty months). When the installation team completes commissioning for a machine, its
          warranty starts that day and ends after the product&rsquo;s period. Nobody types the dates in.
        </p>
        <p>
          <strong className="font-medium text-slate-800">Machines installed before the CRM:</strong> press{" "}
          <b className="font-medium text-slate-800">Add existing installation</b> to record one customer&rsquo;s machines (the model and
          capacity, the installation date, a warranty of 1 or 2 years or an exact end date, and the AMC if there is one), or{" "}
          <b className="font-medium text-slate-800">Import from Excel</b> to bring in many customers at once. Machines of a group with
          many hotels are recorded one customer per hotel, and the search box finds them together. A machine&rsquo;s details and
          dates can be corrected later with <b className="font-medium text-slate-800">Edit machine</b> on its page.
        </p>
        <p>
          <strong className="font-medium text-slate-800">When the customer complains:</strong> the service team raises a ticket, then
          a claim here (New claim) for a machine that is still in warranty. An administrator approves or rejects it, and the
          service team marks it resolved. Dispatched machines that are not commissioned yet wait under &ldquo;Awaiting
          commissioning&rdquo;.
        </p>
      </HowItWorks>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="In warranty" value={activeCount} icon={CircleCheck} accent="emerald" href={qs("active")} />
        <StatCard
          label={`Expiring in ${EXPIRING_SOON_DAYS} days`}
          value={expiringCount}
          icon={Hourglass}
          accent="amber"
          href={qs("expiring")}
          hint="A chance to offer an AMC"
        />
        <StatCard label="Out of warranty" value={expiredCount} icon={CalendarX2} accent="rose" href={qs("expired")} />
        <StatCard label="Open claims" value={openClaims} icon={FileWarning} accent="violet" href={qs("claims")} />
      </div>

      <form action="/warranty" method="get" className="flex gap-2" role="search">
        <input type="hidden" name="view" value={view} />
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search a customer, city, model or serial number"
            aria-label="Search machines"
            className="input pl-9"
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
        {q && (
          <Link href={`/warranty?view=${view}`} className="btn btn-secondary">
            Clear
          </Link>
        )}
      </form>

      <FilterTabs
        items={[
          tab("active", "In warranty", activeCount),
          tab("expiring", "Expiring soon", expiringCount),
          tab("expired", "Expired", expiredCount),
          tab("pending", "Awaiting commissioning", pendingCount),
          tab("all", "All machines", allCount),
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
              title={q ? "No machine matches the search" : "Nothing in this group"}
              description={
                q
                  ? "Try a shorter name, or look under “All machines”."
                  : view === "pending"
                    ? "Machines that are installed but not yet commissioned appear here — warranty starts at commissioning."
                    : "Warranty is tracked per machine, starting when it is commissioned. Machines installed before the CRM can be added with “Add existing installation”."
              }
            />
          }
          columns={[
            { header: "Customer", cell: (u) => (u.lead ? <CustomerLink role={user.role} leadId={u.lead.id} name={u.lead.customerName} /> : "—") },
            {
              header: "Machine",
              cell: (u) => (
                <div className="min-w-0">
                  <Link href={`/serial-numbers/${u.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                    {u.product.name}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {u.serialNo}
                    {u.product.heatingCapacityKw ? ` · ${Number(u.product.heatingCapacityKw)} kW` : ""}
                  </p>
                </div>
              ),
            },
            { header: "Installed", cell: (u) => formatDate(u.commissionedAt ?? u.installedAt) },
            { header: "Warranty ends", cell: (u) => formatDate(u.warrantyEndsOn) },
            {
              header: "Days left",
              align: "right",
              cell: (u) => (u.warrantyEndsOn ? <span className="tabular-nums">{daysBetween(todayDate, u.warrantyEndsOn)}</span> : "—"),
            },
            { header: "Warranty", cell: (u) => <StatusPill meta={WARRANTY_STATE[warrantyState(u.warrantyEndsOn, todayDate)]} /> },
            {
              header: "AMC",
              cell: (u) => {
                const latest = [...u.amcUnits].map((a) => a.amc).sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0];
                if (!latest) return <span className="text-slate-400">None</span>;
                return (
                  <div className="space-y-0.5">
                    <StatusPill meta={AMC_STATE[amcState(latest, todayDate)]} />
                    <p className="text-xs text-slate-400">till {formatDate(latest.endDate)}</p>
                  </div>
                );
              },
            },
          ]}
        />
      )}
    </div>
  );
}

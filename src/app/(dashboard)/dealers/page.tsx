import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Contact, Handshake, IndianRupee, Plus, Search, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { getOptions } from "@/lib/settings";
import { formatINR } from "@/lib/utils";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { DataTable, FilterTabs } from "@/components/page-kit";

type SearchParams = { q?: string; territory?: string; status?: string };

export default async function DealersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "dealers")) redirect("/");

  const { q = "", territory = "", status = "active" } = await searchParams;
  const showInactive = status === "all";

  const where: Prisma.DealerWhereInput = {
    ...(showInactive ? {} : { active: true }),
    ...(territory ? { territory } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { contactPerson: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [dealers, territories, orders, totals] = await Promise.all([
    prisma.dealer.findMany({ where, orderBy: { name: "asc" }, include: { _count: { select: { leads: true } } } }),
    getOptions("TERRITORY"),
    prisma.salesOrder.findMany({
      where: { status: { not: "CANCELLED" }, lead: { dealerId: { not: null } } },
      select: { grandTotal: true, lead: { select: { dealerId: true } } },
    }),
    prisma.dealer.aggregate({ where: { active: true }, _count: { _all: true }, _sum: { outstandingBalance: true } }),
  ]);

  const achieved = new Map<string, number>();
  for (const o of orders) {
    const id = o.lead.dealerId!;
    achieved.set(id, (achieved.get(id) ?? 0) + Number(o.grandTotal));
  }
  const dealerSales = [...achieved.values()].reduce((a, b) => a + b, 0);
  const sourcedLeads = dealers.reduce((sum, d) => sum + d._count.leads, 0);

  const href = (s: string) =>
    `/dealers?${new URLSearchParams({ status: s, ...(q ? { q } : {}), ...(territory ? { territory } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Handshake}
        title="Dealers"
        description="Channel partners, targets and dealer-sourced leads."
        actions={
          canManage(user.role, "dealers") ? (
            <Link href="/dealers/new" className="btn btn-primary">
              <Plus className="size-4" />
              New dealer
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active dealers" value={totals._count._all} icon={Handshake} accent="brand" />
        <StatCard label="Dealer-sourced leads" value={sourcedLeads} icon={Contact} accent="violet" hint="For the dealers listed" />
        <StatCard label="Sales through dealers" value={formatINR(dealerSales)} icon={TrendingUp} accent="emerald" hint="Confirmed orders" />
        <StatCard
          label="Outstanding"
          value={formatINR(Number(totals._sum.outstandingBalance ?? 0))}
          icon={IndianRupee}
          accent="amber"
          hint="Across active dealers"
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          items={[
            { label: "Active", href: href("active"), active: !showInactive },
            { label: "Include inactive", href: href("all"), active: showInactive },
          ]}
        />
        <form action="/dealers" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="status" value={status} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Search name, code or city" className="input w-64 pl-9" />
          </div>
          <select name="territory" defaultValue={territory} className="select w-auto">
            <option value="">All territories</option>
            {territories.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <DataTable
        rows={dealers}
        rowKey={(d) => d.id}
        empty={
          <EmptyState
            icon={Handshake}
            title={q || territory ? "No dealers match these filters" : "No dealers yet"}
            description="Add your dealers and distributors to track their targets and the leads they bring in."
          />
        }
        columns={[
          {
            header: "Dealer",
            cell: (d) => (
              <div>
                <Link href={`/dealers/${d.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                  {d.name}
                </Link>
                <p className="text-xs text-slate-400">{[d.code, d.city].filter(Boolean).join(" · ")}</p>
              </div>
            ),
          },
          { header: "Territory", cell: (d) => d.territory ?? "—" },
          { header: "Contact", cell: (d) => [d.contactPerson, d.phone].filter(Boolean).join(" · ") || "—" },
          { header: "Leads", align: "right", cell: (d) => <span className="tabular-nums">{d._count.leads}</span> },
          {
            header: "Sales",
            align: "right",
            cell: (d) => <span className="tabular-nums">{formatINR(achieved.get(d.id) ?? 0)}</span>,
          },
          {
            header: "Outstanding",
            align: "right",
            cell: (d) => <span className="tabular-nums">{formatINR(Number(d.outstandingBalance))}</span>,
          },
          {
            header: "Status",
            cell: (d) => <Badge tone={d.active ? "success" : "neutral"}>{d.active ? "Active" : "Inactive"}</Badge>,
          },
        ]}
      />
    </div>
  );
}

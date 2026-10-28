import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, SalesOrderStatus } from "@prisma/client";
import { ArrowRight, Search, ShoppingCart } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { leadScope } from "@/lib/scope";
import { formatDate } from "@/lib/dates";
import { ORDER_STATUS } from "@/lib/statuses";
import { formatINR } from "@/lib/utils";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";
import { ActionButton } from "@/components/action-forms";
import { convertQuotationToOrder } from "./actions";

type SearchParams = { q?: string; status?: string };

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "salesOrders")) redirect("/");

  const { q = "", status = "" } = await searchParams;
  const statusFilter = status in ORDER_STATUS ? (status as SalesOrderStatus) : undefined;
  const scope = leadScope(user.role, user.id);

  const where: Prisma.SalesOrderWhereInput = {
    lead: scope,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { lead: { customerName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [orders, statusCounts, readyQuotes] = await Promise.all([
    prisma.salesOrder.findMany({ where, include: { lead: true }, orderBy: { createdAt: "desc" } }),
    prisma.salesOrder.groupBy({ by: ["status"], where: { lead: scope }, _count: { _all: true } }),
    prisma.quotation.findMany({
      where: { status: "ACCEPTED", salesOrder: null, lead: scope },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const manage = canManage(user.role, "salesOrders");
  const countOf = (s: SalesOrderStatus) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const allCount = statusCounts.reduce((sum, c) => sum + c._count._all, 0);
  const href = (s: string) => `/sales-orders?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        title="Sales orders"
        description="Confirmed orders from accepted quotations, through dispatch and delivery."
      />

      {readyQuotes.length > 0 && (
        <SectionCard
          title="Accepted quotations ready to convert"
          description="One click turns an accepted quote into a confirmed order"
          icon={ArrowRight}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-[var(--border)]">
            {readyQuotes.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/quotations/${quote.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-600">
                    {quote.quoteNumber}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {quote.lead.customerName} · {formatINR(Number(quote.grandTotal))}
                  </p>
                </div>
                {manage && (
                  <ActionButton
                    action={convertQuotationToOrder}
                    hidden={{ quotationId: quote.id }}
                    label="Convert to order"
                    pendingLabel="Converting…"
                    variant="primary"
                  />
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          items={[
            { label: "All", href: href(""), active: !statusFilter, count: allCount },
            ...(Object.keys(ORDER_STATUS) as SalesOrderStatus[]).map((s) => ({
              label: ORDER_STATUS[s].label,
              href: href(s),
              active: statusFilter === s,
              count: countOf(s),
            })),
          ]}
        />
        <form action="/sales-orders" className="flex items-center gap-2">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Search order or customer" className="input w-64 pl-9" />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
      </div>

      <DataTable
        rows={orders}
        rowKey={(o) => o.id}
        empty={
          <EmptyState
            icon={ShoppingCart}
            title={q || statusFilter ? "No orders match these filters" : "No sales orders yet"}
            description="Mark a quotation as accepted, then convert it to an order."
          />
        }
        columns={[
          {
            header: "Order",
            cell: (o) => (
              <Link href={`/sales-orders/${o.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                {o.orderNumber}
              </Link>
            ),
          },
          { header: "Customer", cell: (o) => <CustomerLink role={user.role} leadId={o.lead.id} name={o.lead.customerName} /> },
          { header: "Status", cell: (o) => <StatusPill meta={ORDER_STATUS[o.status]} /> },
          {
            header: "Total",
            align: "right",
            cell: (o) => <span className="font-medium tabular-nums text-slate-800">{formatINR(Number(o.grandTotal))}</span>,
          },
          {
            header: "Balance due",
            align: "right",
            cell: (o) => <span className="tabular-nums">{formatINR(Number(o.grandTotal) - Number(o.amountReceived))}</span>,
          },
          { header: "Delivery", cell: (o) => formatDate(o.deliveryDate) },
          { header: "Created", align: "right", cell: (o) => <span className="text-slate-400">{formatDate(o.createdAt)}</span> },
        ]}
      />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, SerialStatus } from "@prisma/client";
import { Plus, ScanBarcode, Search } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { formatDate, today } from "@/lib/dates";
import { warrantyState } from "@/lib/lifecycle";
import { SERIAL_STATUS, WARRANTY_STATE } from "@/lib/statuses";
import { EmptyState, PageHeader } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";

type SearchParams = { q?: string; status?: string; productId?: string };

const LIMIT = 200;

export default async function SerialNumbersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "serials")) redirect("/");

  const { q = "", status = "", productId = "" } = await searchParams;
  const statusFilter = status in SERIAL_STATUS ? (status as SerialStatus) : undefined;
  const todayDate = today();

  const where: Prisma.SerialNumberWhereInput = {
    ...(user.role === "SALES" ? { lead: { assignedToId: user.id } } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(productId ? { productId } : {}),
    ...(q
      ? {
          OR: [
            { serialNo: { contains: q, mode: "insensitive" } },
            { lead: { customerName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [units, total, statusCounts, product] = await Promise.all([
    prisma.serialNumber.findMany({
      where,
      include: { product: true, lead: true },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    prisma.serialNumber.count({ where }),
    prisma.serialNumber.groupBy({
      by: ["status"],
      where: { ...(user.role === "SALES" ? { lead: { assignedToId: user.id } } : {}), ...(productId ? { productId } : {}) },
      _count: { _all: true },
    }),
    productId ? prisma.product.findUnique({ where: { id: productId }, select: { name: true } }) : null,
  ]);

  const countOf = (s: SerialStatus) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const allCount = statusCounts.reduce((sum, c) => sum + c._count._all, 0);
  const href = (s: string) =>
    `/serial-numbers?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}), ...(productId ? { productId } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ScanBarcode}
        title="Serial numbers"
        description={
          product
            ? `Units of ${product.name} — every machine's lifecycle in one place.`
            : "Every machine's lifecycle, from one search."
        }
        actions={
          canManage(user.role, "serials") ? (
            <Link href={`/serial-numbers/new${productId ? `?productId=${productId}` : ""}`} className="btn btn-primary">
              <Plus className="size-4" />
              Register units
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          items={[
            { label: "All", href: href(""), active: !statusFilter, count: allCount },
            ...(Object.keys(SERIAL_STATUS) as SerialStatus[]).map((s) => ({
              label: SERIAL_STATUS[s].label,
              href: href(s),
              active: statusFilter === s,
              count: countOf(s),
            })),
          ]}
        />
        <form action="/serial-numbers" className="flex items-center gap-2">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {productId && <input type="hidden" name="productId" value={productId} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Search a serial number or customer" className="input w-72 pl-9" />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
      </div>

      <DataTable
        rows={units}
        rowKey={(u) => u.id}
        empty={
          <EmptyState
            icon={ScanBarcode}
            title={q || statusFilter ? "No units match these filters" : "No serial numbers yet"}
            description="Register the units of each model so dispatch, installation, warranty and service can be traced to the machine."
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
          {
            header: "Customer",
            cell: (u) => (u.lead ? <CustomerLink role={user.role} leadId={u.lead.id} name={u.lead.customerName} /> : "—"),
          },
          { header: "Status", cell: (u) => <StatusPill meta={SERIAL_STATUS[u.status]} /> },
          {
            header: "Warranty",
            cell: (u) => {
              const state = warrantyState(u.warrantyEndsOn, todayDate);
              return (
                <div className="flex items-center gap-2">
                  <StatusPill meta={WARRANTY_STATE[state]} />
                  {u.warrantyEndsOn && <span className="text-xs text-slate-400">till {formatDate(u.warrantyEndsOn)}</span>}
                </div>
              );
            },
          },
          { header: "Registered", align: "right", cell: (u) => <span className="text-slate-400">{formatDate(u.createdAt)}</span> },
        ]}
      />
      {total > LIMIT && (
        <p className="text-center text-xs text-slate-400">
          Showing the latest {LIMIT} of {total}. Search or filter to narrow the list.
        </p>
      )}
    </div>
  );
}

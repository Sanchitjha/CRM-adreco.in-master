import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Package, Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canSeePricing, canView } from "@/lib/rbac";
import { getOptions } from "@/lib/settings";
import { formatINR } from "@/lib/utils";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { DataTable, FilterTabs } from "@/components/page-kit";

type SearchParams = { q?: string; type?: string; category?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "products")) redirect("/");

  const { q = "", type = "all", category = "" } = await searchParams;
  const showPricing = canSeePricing(user.role);

  const where: Prisma.ProductWhereInput = {
    ...(type === "machines" ? { isSparePart: false } : type === "spares" ? { isSparePart: true } : {}),
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { modelCode: { contains: q, mode: "insensitive" } },
            { series: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [products, kindCounts, categories] = await Promise.all([
    prisma.product.findMany({ where, orderBy: [{ series: "asc" }, { heatingCapacityKw: "asc" }, { name: "asc" }] }),
    prisma.product.groupBy({ by: ["isSparePart"], _count: { _all: true } }),
    getOptions("PRODUCT_CATEGORY"),
  ]);

  const unitCounts = await prisma.serialNumber.groupBy({
    by: ["productId"],
    where: { status: "IN_STOCK", productId: { in: products.map((p) => p.id) } },
    _count: { _all: true },
  });
  const inStockUnits = new Map(unitCounts.map((u) => [u.productId, u._count._all]));

  const machines = kindCounts.find((k) => !k.isSparePart)?._count._all ?? 0;
  const spares = kindCounts.find((k) => k.isSparePart)?._count._all ?? 0;
  const href = (t: string) => `/products?type=${t}${category ? `&category=${encodeURIComponent(category)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title="Product catalog"
        description="A technical master for every heat-pump model and spare part."
        actions={
          canManage(user.role, "products") ? (
            <Link href="/products/new" className="btn btn-primary">
              <Plus className="size-4" />
              New product
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          items={[
            { label: "All", href: href("all"), active: type === "all", count: machines + spares },
            { label: "Machines", href: href("machines"), active: type === "machines", count: machines },
            { label: "Spare parts", href: href("spares"), active: type === "spares", count: spares },
          ]}
        />
        <form className="flex flex-wrap items-center gap-2" action="/products">
          <input type="hidden" name="type" value={type} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Search name, model or series" className="input w-64 pl-9" />
          </div>
          <select name="category" defaultValue={category} className="select w-auto">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <DataTable
        rows={products}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            icon={Package}
            title={q || category || type !== "all" ? "No products match these filters" : "No products yet"}
            description="Add each model with its specifications and price so quotes and serial numbers can use it."
          />
        }
        columns={[
          {
            header: "Product",
            cell: (p) => (
              <div>
                <Link href={`/products/${p.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                  {p.name}
                </Link>
                <p className="text-xs text-slate-400">
                  {p.modelCode}
                  {p.series ? ` · ${p.series}` : ""}
                </p>
              </div>
            ),
          },
          { header: "Category", cell: (p) => p.category ?? (p.isSparePart ? "Spare part" : "—") },
          { header: "Capacity", cell: (p) => (p.heatingCapacityKw ? `${Number(p.heatingCapacityKw)} kW` : "—") },
          { header: "COP", cell: (p) => (p.cop ? Number(p.cop) : "—") },
          { header: "Warranty", cell: (p) => `${p.warrantyMonths} mo` },
          ...(showPricing
            ? [
                {
                  header: "Customer price",
                  align: "right" as const,
                  cell: (p: (typeof products)[number]) => formatINR(p.customerPrice ? Number(p.customerPrice) : null),
                },
              ]
            : []),
          {
            header: "In stock",
            align: "right",
            cell: (p) => <span className="tabular-nums">{p.isSparePart ? p.stockQty : (inStockUnits.get(p.id) ?? 0)}</span>,
          },
          {
            header: "Status",
            cell: (p) => <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>,
          },
        ]}
      />
    </div>
  );
}

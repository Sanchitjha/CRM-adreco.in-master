import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Boxes, IndianRupee, Pencil, Plus, ScanBarcode, Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canSeePricing, canView } from "@/lib/rbac";
import { SERIAL_STATUS } from "@/lib/statuses";
import { formatINR } from "@/lib/utils";
import { Badge, SectionCard } from "@/components/ui";
import { ActivityTimeline, BackLink, InfoGrid } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { ActionButton } from "@/components/action-forms";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { adjustStock, toggleProductActive } from "../actions";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "products")) redirect("/");

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

  const [unitCounts, variants] = await Promise.all([
    prisma.serialNumber.groupBy({ by: ["status"], where: { productId: id }, _count: { _all: true } }),
    product.series
      ? prisma.product.findMany({
          where: { series: product.series, id: { not: id } },
          orderBy: { heatingCapacityKw: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const manage = canManage(user.role, "products");
  const showPricing = canSeePricing(user.role);
  const totalUnits = unitCounts.reduce((sum, u) => sum + u._count._all, 0);

  return (
    <div className="space-y-6">
      <BackLink href="/products" label="Back to products" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{product.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {product.modelCode}
            {product.series ? ` · ${product.series}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {product.isSparePart && <Badge tone="purple">Spare part</Badge>}
          {product.category && <Badge tone="brand">{product.category}</Badge>}
          <Badge tone={product.active ? "success" : "neutral"} dot>
            {product.active ? "Active" : "Inactive"}
          </Badge>
          {manage && (
            <>
              <Link href={`/products/${product.id}/edit`} className="btn btn-secondary btn-sm">
                <Pencil className="size-3.5" />
                Edit
              </Link>
              <ActionButton
                action={toggleProductActive}
                hidden={{ productId: product.id }}
                label={product.active ? "Deactivate" : "Reactivate"}
                confirm={product.active ? "Deactivate this product? It stays on existing records." : undefined}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Technical specification" icon={Wrench}>
            <InfoGrid
              columns={3}
              items={[
                { label: "Heating capacity", value: product.heatingCapacityKw ? `${Number(product.heatingCapacityKw)} kW` : null },
                { label: "Input power", value: product.inputPowerKw ? `${Number(product.inputPowerKw)} kW` : null },
                { label: "COP", value: product.cop ? Number(product.cop) : null },
                { label: "Refrigerant", value: product.refrigerant },
                { label: "Compressor", value: product.compressor },
                { label: "Heat exchanger", value: product.heatExchanger },
                { label: "Operating range", value: product.operatingRange },
                { label: "Warranty", value: `${product.warrantyMonths} months` },
                {
                  label: "Datasheet",
                  value: product.datasheetUrl ? (
                    <a href={product.datasheetUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                      Open link
                    </a>
                  ) : null,
                },
              ]}
            />
            {product.description && (
              <p className="mt-4 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{product.description}</p>
            )}
          </SectionCard>

          {variants.length > 0 && (
            <SectionCard title={`Other models in ${product.series}`} description="Variants by capacity" icon={Boxes} bodyClassName="p-0">
              <ul className="divide-y divide-[var(--border)]">
                {variants.map((v) => (
                  <li key={v.id}>
                    <Link href={`/products/${v.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
                      <span>
                        <span className="text-sm font-medium text-slate-800">{v.name}</span>
                        <span className="block text-xs text-slate-400">{v.modelCode}</span>
                      </span>
                      <span className="text-sm text-slate-600">
                        {v.heatingCapacityKw ? `${Number(v.heatingCapacityKw)} kW` : ""}
                        {showPricing && v.customerPrice ? ` · ${formatINR(Number(v.customerPrice))}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <AttachmentsPanel
            entityType="PRODUCT"
            entityId={product.id}
            description="Product photos, a demo video, the datasheet or brochure."
          />

          <ActivityTimeline entityType="Product" entityId={product.id} />
        </div>

        <div className="space-y-6">
          {showPricing && (
            <SectionCard title="Pricing" icon={IndianRupee}>
              <InfoGrid
                columns={1}
                items={[
                  { label: "Customer price", value: product.customerPrice ? formatINR(Number(product.customerPrice)) : null },
                  { label: "Dealer price", value: product.dealerPrice ? formatINR(Number(product.dealerPrice)) : null },
                ]}
              />
            </SectionCard>
          )}

          {product.isSparePart ? (
            <SectionCard title="Stock" description="Parts used on service tickets are deducted automatically" icon={Boxes}>
              <p className="text-3xl font-semibold tabular-nums text-slate-900">{product.stockQty}</p>
              <p className="mb-4 text-xs text-slate-400">on hand</p>
              {manage && (
                <AutoForm
                  action={adjustStock}
                  submitLabel="Adjust stock"
                  columns={1}
                  compact
                  resetOnSuccess
                  fields={[
                    { kind: "hidden", name: "productId", value: product.id },
                    {
                      name: "delta",
                      label: "Add or remove",
                      kind: "number",
                      required: true,
                      placeholder: "+10 to add, −3 to remove",
                    },
                    { name: "note", label: "Reason", placeholder: "e.g. New stock received" },
                  ]}
                />
              )}
            </SectionCard>
          ) : (
            <SectionCard
              title="Serial-numbered units"
              icon={ScanBarcode}
              action={
                canManage(user.role, "serials") ? (
                  <Link href={`/serial-numbers/new?productId=${product.id}`} className="btn btn-secondary btn-sm">
                    <Plus className="size-3.5" />
                    Register units
                  </Link>
                ) : undefined
              }
            >
              {totalUnits === 0 ? (
                <p className="text-sm text-slate-400">No units registered yet.</p>
              ) : (
                <ul className="space-y-2">
                  {unitCounts.map((u) => (
                    <li key={u.status} className="flex items-center justify-between text-sm">
                      <Link
                        href={`/serial-numbers?productId=${product.id}&status=${u.status}`}
                        className="text-slate-600 hover:text-brand-600"
                      >
                        {SERIAL_STATUS[u.status].label}
                      </Link>
                      <span className="tabular-nums font-medium text-slate-800">{u._count._all}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm font-semibold text-slate-900">
                    <span>Total</span>
                    <span className="tabular-nums">{totalUnits}</span>
                  </li>
                </ul>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

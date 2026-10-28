import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, FileText, IndianRupee, ScanBarcode, ShoppingCart, Truck, Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { formatDate, toDateInput } from "@/lib/dates";
import { getOptions } from "@/lib/settings";
import { INSTALLATION_STATUS, ORDER_STATUS, SERIAL_STATUS, statusOptions } from "@/lib/statuses";
import { formatINR } from "@/lib/utils";
import { computeQuoteTotals } from "@/lib/validation/quotation";
import { Avatar, SectionCard } from "@/components/ui";
import { ActivityTimeline, BackLink, CustomerLink, InfoGrid, StatusPill } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { ActionButton, SelectActionForm } from "@/components/action-forms";
import {
  attachSerials,
  detachSerial,
  updateDispatchDetails,
  updateOrderDetails,
  updateOrderStatus,
} from "../actions";

function SummaryLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "border-t border-[var(--border)] pt-2.5" : ""}`}>
      <dt className={strong ? "font-semibold text-slate-900" : "text-slate-500"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-lg font-semibold text-brand-700" : "text-slate-700"}`}>{value}</dd>
    </div>
  );
}

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "salesOrders")) redirect("/");

  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      lead: true,
      createdBy: true,
      quotation: true,
      items: true,
      serialNumbers: { include: { product: true }, orderBy: { serialNo: "asc" } },
      installations: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();
  if (!canSeeLead(user.role, user.id, order.lead)) notFound();

  const paymentTerms = await getOptions("PAYMENT_TERM");
  const manage = canManage(user.role, "salesOrders");
  const closed = order.status === "CANCELLED";

  const totals = computeQuoteTotals({
    items: order.items.map((i) => ({ quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
    discountPct: Number(order.discountPct),
    gstPct: Number(order.gstPct),
    installationCharge: Number(order.installationCharge),
    transportCharge: Number(order.transportCharge),
  });
  const grandTotal = Number(order.grandTotal);
  const received = Number(order.amountReceived);
  const unitsOrdered = order.items.reduce((sum, i) => sum + i.quantity, 0);

  const termOptions = [...new Set([...(order.paymentTerms ? [order.paymentTerms] : []), ...paymentTerms])];

  return (
    <div className="space-y-6">
      <BackLink href="/sales-orders" label="Back to sales orders" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={order.lead.customerName} className="size-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{order.orderNumber}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <CustomerLink role={user.role} leadId={order.lead.id} name={order.lead.customerName} /> · Confirmed{" "}
              {formatDate(order.orderDate)} by {order.createdBy.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill meta={ORDER_STATUS[order.status]} />
          {order.quotation && (
            <Link href={`/quotations/${order.quotation.id}`} className="btn btn-secondary btn-sm">
              <FileText className="size-3.5" />
              {order.quotation.quoteNumber}
            </Link>
          )}
          {canManage(user.role, "installations") && !closed && (
            <Link href={`/installations/new?orderId=${order.id}`} className="btn btn-secondary btn-sm">
              <Wrench className="size-3.5" />
              Create installation job
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Order items" description="Copied from the accepted quotation" icon={ShoppingCart} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
                    <th className="px-5 py-2.5 font-medium text-slate-500">Description</th>
                    <th className="px-5 py-2.5 text-right font-medium text-slate-500">Qty</th>
                    <th className="px-5 py-2.5 text-right font-medium text-slate-500">Unit price</th>
                    <th className="px-5 py-2.5 text-right font-medium text-slate-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {order.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-5 py-3 text-slate-700">{i.description}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{i.quantity}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{formatINR(Number(i.unitPrice))}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-800">{formatINR(Number(i.lineTotal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Order details" description="Delivery, payment terms and addresses" icon={ShoppingCart}>
            {manage && !closed ? (
              <AutoForm
                action={updateOrderDetails}
                submitLabel="Save order details"
                fields={[
                  { kind: "hidden", name: "orderId", value: order.id },
                  { name: "deliveryDate", label: "Delivery date", kind: "date", defaultValue: toDateInput(order.deliveryDate) },
                  { name: "customerPoNumber", label: "Customer PO number", defaultValue: order.customerPoNumber },
                  {
                    name: "paymentTerms",
                    label: "Payment terms",
                    defaultValue: order.paymentTerms,
                    list: termOptions,
                    placeholder: "Choose or type",
                    span: 2,
                  },
                  { name: "billingAddress", label: "Billing address", kind: "textarea", defaultValue: order.billingAddress, rows: 2 },
                  { name: "shippingAddress", label: "Shipping / site address", kind: "textarea", defaultValue: order.shippingAddress, rows: 2 },
                  {
                    name: "amountReceived",
                    label: "Amount received (₹)",
                    kind: "number",
                    min: 0,
                    step: "0.01",
                    defaultValue: received,
                    hint: `Order total ${formatINR(grandTotal)}`,
                  },
                  { name: "notes", label: "Notes", kind: "textarea", defaultValue: order.notes, rows: 2 },
                ]}
              />
            ) : (
              <InfoGrid
                items={[
                  { label: "Delivery date", value: formatDate(order.deliveryDate) },
                  { label: "Customer PO", value: order.customerPoNumber },
                  { label: "Payment terms", value: order.paymentTerms },
                  { label: "Billing address", value: order.billingAddress },
                  { label: "Shipping address", value: order.shippingAddress },
                  { label: "Notes", value: order.notes },
                ]}
              />
            )}
          </SectionCard>

          <SectionCard title="Dispatch" description="Transporter, LR and e-way bill" icon={Truck}>
            {manage && !closed ? (
              <AutoForm
                action={updateDispatchDetails}
                submitLabel="Save dispatch details"
                columns={2}
                fields={[
                  { kind: "hidden", name: "orderId", value: order.id },
                  { name: "transporter", label: "Transporter", defaultValue: order.transporter },
                  { name: "lrNumber", label: "LR / docket number", defaultValue: order.lrNumber },
                  { name: "ewayBillNo", label: "E-way bill number", defaultValue: order.ewayBillNo },
                ]}
              />
            ) : (
              <InfoGrid
                columns={3}
                items={[
                  { label: "Transporter", value: order.transporter },
                  { label: "LR / docket", value: order.lrNumber },
                  { label: "E-way bill", value: order.ewayBillNo },
                ]}
              />
            )}
            {(order.dispatchedAt || order.deliveredAt) && (
              <p className="mt-4 text-xs text-slate-400">
                {order.dispatchedAt ? `Dispatched ${formatDate(order.dispatchedAt)}` : ""}
                {order.dispatchedAt && order.deliveredAt ? " · " : ""}
                {order.deliveredAt ? `Delivered ${formatDate(order.deliveredAt)}` : ""}
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Dispatched units"
            description={`${order.serialNumbers.length} of ${unitsOrdered} ordered units have serial numbers`}
            icon={ScanBarcode}
            bodyClassName="p-0"
          >
            {order.serialNumbers.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No units dispatched against this order yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {order.serialNumbers.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link
                        href={canView(user.role, "serials") ? `/serial-numbers/${u.id}` : "#"}
                        className="text-sm font-medium text-slate-800 hover:text-brand-600"
                      >
                        {u.serialNo}
                      </Link>
                      <p className="text-xs text-slate-400">{u.product.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill meta={SERIAL_STATUS[u.status]} />
                      {manage && u.status === "DISPATCHED" && (
                        <ActionButton
                          action={detachSerial}
                          hidden={{ orderId: order.id, serialId: u.id }}
                          label="Remove"
                          variant="ghost"
                          confirm={`Take ${u.serialNo} off this order and return it to stock?`}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {manage && !closed && order.status !== "DELIVERED" && (
              <div className="border-t border-[var(--border)] px-5 py-4">
                <AutoForm
                  action={attachSerials}
                  submitLabel="Dispatch these units"
                  pendingLabel="Dispatching…"
                  columns={1}
                  compact
                  resetOnSuccess
                  fields={[
                    { kind: "hidden", name: "orderId", value: order.id },
                    {
                      kind: "textarea",
                      name: "serials",
                      label: "Serial numbers to dispatch",
                      rows: 3,
                      required: true,
                      placeholder: "One per line, or separated by commas",
                      hint: "Units must already be registered and in stock.",
                    },
                  ]}
                />
              </div>
            )}
          </SectionCard>

          <ActivityTimeline entityType="SalesOrder" entityId={order.id} />
        </div>

        <div className="space-y-6">
          <SectionCard title="Payment" icon={IndianRupee}>
            <dl className="space-y-2 text-sm">
              <SummaryLine label="Subtotal" value={formatINR(totals.subtotal)} />
              {totals.discountAmount > 0 && (
                <SummaryLine label={`Discount (${Number(order.discountPct)}%)`} value={`- ${formatINR(totals.discountAmount)}`} />
              )}
              {totals.installationCharge > 0 && <SummaryLine label="Installation" value={formatINR(totals.installationCharge)} />}
              {totals.transportCharge > 0 && <SummaryLine label="Transport" value={formatINR(totals.transportCharge)} />}
              <SummaryLine label={`GST (${Number(order.gstPct)}%)`} value={formatINR(totals.gstAmount)} />
              <SummaryLine label="Order total" value={formatINR(grandTotal)} strong />
              <SummaryLine label="Received" value={formatINR(received)} />
              <SummaryLine label="Balance due" value={formatINR(grandTotal - received)} />
            </dl>
          </SectionCard>

          {manage && (
            <SectionCard title="Status" description="Confirmed → production → dispatched → delivered" icon={ShoppingCart}>
              <SelectActionForm
                action={updateOrderStatus}
                hidden={{ orderId: order.id }}
                name="status"
                current={order.status}
                options={statusOptions(ORDER_STATUS)}
              />
            </SectionCard>
          )}

          {order.installations.length > 0 && canView(user.role, "installations") && (
            <SectionCard title="Installation jobs" icon={Wrench} bodyClassName="p-0">
              <ul className="divide-y divide-[var(--border)]">
                {order.installations.map((job) => (
                  <li key={job.id}>
                    <Link href={`/installations/${job.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
                      <span className="text-sm font-medium text-slate-800">{job.jobNumber}</span>
                      <StatusPill meta={INSTALLATION_STATUS[job.status]} />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {canView(user.role, "salesOrders") && (user.role === "ADMIN" || user.role === "SALES") && (
            <Link href={`/leads/${order.lead.id}`} className="btn btn-secondary w-full">
              <ExternalLink className="size-4" />
              Open customer record
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

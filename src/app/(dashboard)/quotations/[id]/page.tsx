import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, ExternalLink, ClipboardCheck, Printer, ShoppingCart } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessQuotations, canManage, canView as canViewModule } from "@/lib/rbac";
import { canSeeQuotation } from "@/lib/scope";
import { formatINR } from "@/lib/utils";
import { computeQuoteTotals } from "@/lib/validation/quotation";
import { SectionCard, Avatar } from "@/components/ui";
import { QuoteStatusBadge } from "@/components/quotations/quote-status-badge";
import { QuoteStatusControl } from "@/components/quotations/quote-status-control";
import { ZohoChatAction } from "@/components/zoho/zoho-chat-modal";
import { ActionButton } from "@/components/action-forms";
import { convertQuotationToOrder } from "../../sales-orders/actions";

function SummaryLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "border-t border-[var(--border)] pt-2.5" : ""}`}>
      <dt className={strong ? "font-semibold text-slate-900" : "text-slate-500"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-lg font-semibold text-brand-700" : "text-slate-700"}`}>{value}</dd>
    </div>
  );
}

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const { role, id: userId } = session!.user;
  if (!canAccessQuotations(role)) redirect("/");

  const quote = await prisma.quotation.findUnique({
    where: { id },
    include: { lead: true, createdBy: true, siteSurvey: true, items: true, salesOrder: true },
  });
  if (!quote) notFound();

  if (!canSeeQuotation(role, userId, quote)) notFound();

  const canEdit = role === "ADMIN" || role === "DESIGN" || quote.createdById === userId;

  const discountPct = Number(quote.discountPct);
  const gstPct = Number(quote.gstPct);
  const totals = computeQuoteTotals({
    items: quote.items.map((i) => ({ quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
    discountPct,
    gstPct,
    installationCharge: Number(quote.installationCharge),
    transportCharge: Number(quote.transportCharge),
  });

  return (
    <div className="space-y-6">
      <Link href="/quotations" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Back to quotations
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={quote.lead.customerName} className="size-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{quote.quoteNumber}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {quote.lead.customerName} · Prepared {quote.createdAt.toLocaleDateString("en-IN")} by{" "}
              {quote.createdBy.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ZohoChatAction
            customerName={quote.lead.customerName}
            phone={quote.lead.phone}
            email={quote.lead.email}
            leadId={quote.lead.id}
            quoteNumber={quote.quoteNumber}
            grandTotal={Number(quote.grandTotal)}
            productCategory={quote.lead.productCategory}
            variant="button"
            label="Send on Zoho Chat"
          />
          <QuoteStatusBadge status={quote.status} />
          <Link href={`/quotations/${quote.id}/print`} target="_blank" className="btn btn-secondary btn-sm">
            <Printer className="size-3.5" />
            Print / PDF
          </Link>
          <Link href={`/leads/${quote.leadId}`} className="btn btn-secondary btn-sm">
            <ExternalLink className="size-3.5" />
            Open lead
          </Link>
          {quote.siteSurvey && (
            <Link href={`/surveys/${quote.siteSurvey.id}`} className="btn btn-secondary btn-sm">
              <ClipboardCheck className="size-3.5" />
              Survey
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Line items" icon={FileText} bodyClassName="p-0">
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
                  {quote.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-5 py-3 text-slate-700">{i.description}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{i.quantity}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{formatINR(Number(i.unitPrice))}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-800">
                        {formatINR(Number(i.lineTotal))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {(quote.notes || quote.terms) && (
            <div className="grid gap-6 sm:grid-cols-2">
              {quote.notes && (
                <SectionCard title="Notes" icon={FileText}>
                  <p className="whitespace-pre-line text-sm text-slate-700">{quote.notes}</p>
                </SectionCard>
              )}
              {quote.terms && (
                <SectionCard title="Terms" icon={FileText}>
                  <p className="whitespace-pre-line text-sm text-slate-700">{quote.terms}</p>
                </SectionCard>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <SectionCard title="Summary" icon={FileText}>
            <dl className="space-y-2 text-sm">
              <SummaryLine label="Subtotal" value={formatINR(totals.subtotal)} />
              {totals.discountAmount > 0 && (
                <SummaryLine label={`Discount (${discountPct}%)`} value={`- ${formatINR(totals.discountAmount)}`} />
              )}
              {totals.installationCharge > 0 && (
                <SummaryLine label="Installation" value={formatINR(totals.installationCharge)} />
              )}
              {totals.transportCharge > 0 && <SummaryLine label="Transport" value={formatINR(totals.transportCharge)} />}
              <SummaryLine label={`GST (${gstPct}%)`} value={formatINR(totals.gstAmount)} />
              <SummaryLine label="Grand total" value={formatINR(totals.grandTotal)} strong />
            </dl>
            {quote.validUntil && (
              <p className="mt-4 text-xs text-slate-400">
                Valid until {quote.validUntil.toLocaleDateString("en-IN")}
              </p>
            )}
          </SectionCard>

          {canEdit && (
            <SectionCard title="Status" description="Update as the quote progresses" icon={FileText}>
              <QuoteStatusControl quoteId={quote.id} currentStatus={quote.status} />
            </SectionCard>
          )}

          {(quote.salesOrder || (canManage(role, "salesOrders") && quote.status === "ACCEPTED")) && (
            <SectionCard title="Sales order" description="Confirm the order once the customer accepts" icon={ShoppingCart}>
              {quote.salesOrder ? (
                canViewModule(role, "salesOrders") ? (
                  <Link href={`/sales-orders/${quote.salesOrder.id}`} className="btn btn-secondary w-full">
                    Open {quote.salesOrder.orderNumber}
                  </Link>
                ) : (
                  <p className="text-sm text-slate-700">Converted to order {quote.salesOrder.orderNumber}.</p>
                )
              ) : (
                <ActionButton
                  action={convertQuotationToOrder}
                  hidden={{ quotationId: quote.id }}
                  label="Convert to sales order"
                  pendingLabel="Converting…"
                  variant="primary"
                  small={false}
                />
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

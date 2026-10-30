import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessQuotations } from "@/lib/rbac";
import { canSeeQuotation } from "@/lib/scope";
import { getCompanyProfile } from "@/lib/settings";
import { amountInWords } from "@/lib/amount-in-words";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/utils";
import { computeQuoteTotals } from "@/lib/validation/quotation";
import { PrintButton } from "@/components/print-button";

export default async function PrintQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { role, id: userId } = session.user;
  if (!canAccessQuotations(role)) redirect("/");

  const [quote, company] = await Promise.all([
    prisma.quotation.findUnique({
      where: { id },
      include: { lead: true, createdBy: { select: { name: true } }, items: true },
    }),
    getCompanyProfile(),
  ]);
  if (!quote || !canSeeQuotation(role, userId, quote)) notFound();

  const totals = computeQuoteTotals({
    items: quote.items.map((i) => ({ quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
    discountPct: Number(quote.discountPct),
    gstPct: Number(quote.gstPct),
    installationCharge: Number(quote.installationCharge),
    transportCharge: Number(quote.transportCharge),
  });

  const companyName = company?.tradeName || company?.legalName || "Adreco Engineering Pvt Ltd";
  const companyAddress = [company?.address, [company?.city, company?.state, company?.pincode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
  const companyContact = [company?.phone, company?.email, company?.website].filter(Boolean).join("  ·  ");

  return (
    <div className="mx-auto max-w-[210mm]">
      <style>{"@page { size: A4; margin: 14mm; }"}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/quotations/${quote.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" />
          Back to quotation
        </Link>
        <PrintButton />
      </div>

      <article className="space-y-6 rounded-lg bg-white p-8 text-sm text-slate-800 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-col items-start justify-between gap-4 border-b-2 border-slate-800 pb-4 sm:flex-row sm:gap-6 print:flex-row print:gap-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{company?.legalName || companyName}</h1>
            {companyAddress && <p className="mt-1 max-w-sm text-xs text-slate-600">{companyAddress}</p>}
            {companyContact && <p className="text-xs text-slate-600">{companyContact}</p>}
            {company?.gstin && <p className="text-xs text-slate-600">GSTIN: {company.gstin}</p>}
          </div>
          <div className="sm:text-right print:text-right">
            <p className="text-lg font-semibold uppercase tracking-wider">Quotation</p>
            <p className="mt-1 font-mono text-sm">{quote.quoteNumber}</p>
            <p className="text-xs text-slate-600">Date: {formatDate(quote.createdAt)}</p>
            {quote.validUntil && <p className="text-xs text-slate-600">Valid until: {formatDate(quote.validUntil)}</p>}
            {quote.status === "DRAFT" && (
              <p className="mt-1 inline-block rounded border border-slate-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Draft
              </p>
            )}
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prepared for</h2>
            <p className="mt-1 text-base font-semibold">{quote.lead.customerName}</p>
            {quote.lead.address && <p className="text-xs text-slate-600">{quote.lead.address}</p>}
            <p className="text-xs text-slate-600">{quote.lead.phone}</p>
            {quote.lead.email && <p className="text-xs text-slate-600">{quote.lead.email}</p>}
          </div>
          <div className="sm:text-right print:text-right">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prepared by</h2>
            <p className="mt-1 font-medium">{quote.createdBy.name}</p>
            {quote.lead.productCategory && <p className="text-xs text-slate-600">{quote.lead.productCategory}</p>}
          </div>
        </section>

        <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[30rem] border-collapse text-sm print:min-w-0">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600 print:bg-transparent">
              <th className="w-10 px-2 py-2">#</th>
              <th className="px-2 py-2">Description</th>
              <th className="w-16 px-2 py-2 text-right">Qty</th>
              <th className="w-28 px-2 py-2 text-right">Unit price</th>
              <th className="w-32 px-2 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, index) => (
              <tr key={item.id} className="border-b border-slate-200 align-top">
                <td className="px-2 py-2 text-slate-500">{index + 1}</td>
                <td className="px-2 py-2 whitespace-pre-line">{item.description}</td>
                <td className="px-2 py-2 text-right tabular-nums">{item.quantity}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatINR(Number(item.unitPrice))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatINR(Number(item.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <section className="flex flex-col gap-4 sm:flex-row sm:justify-between print:flex-row print:justify-between">
          <p className="max-w-xs text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Amount in words: </span>
            {amountInWords(totals.grandTotal)}
          </p>
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <Line label="Subtotal" value={formatINR(totals.subtotal)} />
            {totals.discountAmount > 0 && (
              <Line label={`Discount (${Number(quote.discountPct)}%)`} value={`- ${formatINR(totals.discountAmount)}`} />
            )}
            {totals.installationCharge > 0 && <Line label="Installation" value={formatINR(totals.installationCharge)} />}
            {totals.transportCharge > 0 && <Line label="Transport" value={formatINR(totals.transportCharge)} />}
            <Line label={`GST (${Number(quote.gstPct)}%)`} value={formatINR(totals.gstAmount)} />
            <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-base font-bold">
              <dt>Grand total</dt>
              <dd className="tabular-nums">{formatINR(totals.grandTotal)}</dd>
            </div>
          </dl>
        </section>

        {(quote.notes || quote.terms) && (
          <section className="space-y-3 border-t border-slate-200 pt-4">
            {quote.notes && (
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Notes</h2>
                <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{quote.notes}</p>
              </div>
            )}
            {quote.terms && (
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Terms &amp; conditions</h2>
                <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{quote.terms}</p>
              </div>
            )}
          </section>
        )}

        {company?.bankDetails && (
          <section className="border-t border-slate-200 pt-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Bank details</h2>
            <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{company.bankDetails}</p>
          </section>
        )}

        <footer className="flex items-end justify-between border-t border-slate-200 pt-10 text-xs text-slate-600">
          <p>This is a computer-generated quotation.</p>
          <div className="text-right">
            <p className="mb-8">For {companyName}</p>
            <p className="border-t border-slate-400 pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-700">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

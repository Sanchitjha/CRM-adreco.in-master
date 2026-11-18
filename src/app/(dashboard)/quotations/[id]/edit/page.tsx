import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, TriangleAlert } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessQuotations } from "@/lib/rbac";
import { canEditQuotation, canSeeQuotation } from "@/lib/scope";
import { loadCatalogProducts } from "@/lib/quotation-catalog";
import { QUOTE_STATUS_LABELS } from "@/lib/validation/quotation";
import { PageHeader, Card } from "@/components/ui";
import { QuotationForm, type ExistingQuotation } from "@/components/quotations/quotation-form";

/** Changing a saved quotation: its lines, discount, GST, charges, validity, notes and terms. */
export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const { role, id: userId } = session!.user;
  if (!canAccessQuotations(role)) redirect("/");

  const quote = await prisma.quotation.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, customerName: true, assignedToId: true } },
      items: true,
      salesOrder: { select: { orderNumber: true } },
    },
  });
  if (!quote || !canSeeQuotation(role, userId, quote)) notFound();

  // Someone who may open it but not change it, or a quotation already turned into an order, goes back to the quotation.
  if (!canEditQuotation(role, userId, quote) || quote.salesOrder) redirect(`/quotations/${quote.id}`);

  const money = (value: unknown) => (Number(value) > 0 ? String(Number(value)) : "");
  const existing: ExistingQuotation = {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "",
    discountPct: String(Number(quote.discountPct)),
    gstPct: String(Number(quote.gstPct)),
    installationCharge: money(quote.installationCharge),
    transportCharge: money(quote.transportCharge),
    notes: quote.notes ?? "",
    terms: quote.terms ?? "",
    rows: quote.items.map((i) => ({
      description: i.description,
      quantity: String(i.quantity),
      unitPrice: String(Number(i.unitPrice)),
    })),
  };

  const products = await loadCatalogProducts(role);

  return (
    <div className="space-y-6">
      <Link href={`/quotations/${quote.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Back to quotation
      </Link>

      <PageHeader
        icon={FileText}
        title={`Edit ${quote.quoteNumber}`}
        description={`For ${quote.lead.customerName}. Change the lines, charges, notes or terms; the customer and the quotation number stay the same.`}
      />

      {quote.status !== "DRAFT" && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            This quotation is marked {QUOTE_STATUS_LABELS[quote.status].toLowerCase()}. Saving changes the amounts on it, so send the
            customer the updated copy if the earlier one has already gone out.
          </span>
        </p>
      )}

      <Card className="p-6">
        <QuotationForm
          leads={[{ id: quote.lead.id, customerName: quote.lead.customerName }]}
          products={products}
          lockedLeadId={quote.lead.id}
          existing={existing}
        />
      </Card>
    </div>
  );
}

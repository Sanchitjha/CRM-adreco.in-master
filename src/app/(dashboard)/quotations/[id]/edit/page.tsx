import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Lock } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessQuotations, canSeePricing } from "@/lib/rbac";
import { canEditQuotation, canSeeQuotation } from "@/lib/scope";
import type { CatalogProduct } from "@/lib/quotation-lines";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { NewQuotationForm, type EditableQuote } from "@/components/quotations/new-quotation-form";

/** Change a saved quotation: its line items, charges, validity, notes and terms. */
export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { role, id: userId } = session.user;
  if (!canAccessQuotations(role)) redirect("/");

  const quote = await prisma.quotation.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, customerName: true, assignedToId: true } },
      items: { orderBy: { id: "asc" } },
      salesOrder: { select: { id: true, orderNumber: true } },
    },
  });
  if (!quote || !canSeeQuotation(role, userId, quote)) notFound();
  if (!canEditQuotation(role, userId, quote)) redirect(`/quotations/${quote.id}`);

  const catalogRows = canSeePricing(role)
    ? await prisma.product.findMany({
        where: { active: true },
        orderBy: [{ isSparePart: "asc" }, { series: "asc" }, { heatingCapacityKw: "asc" }, { name: "asc" }],
        select: { id: true, name: true, modelCode: true, isSparePart: true, customerPrice: true },
      })
    : [];
  const products: CatalogProduct[] = catalogRows.map((p) => ({
    ...p,
    customerPrice: p.customerPrice === null ? null : Number(p.customerPrice),
  }));

  const editable: EditableQuote = {
    id: quote.id,
    leadId: quote.leadId,
    validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "",
    discountPct: String(Number(quote.discountPct)),
    gstPct: String(Number(quote.gstPct)),
    installationCharge: Number(quote.installationCharge) > 0 ? String(Number(quote.installationCharge)) : "",
    transportCharge: Number(quote.transportCharge) > 0 ? String(Number(quote.transportCharge)) : "",
    notes: quote.notes ?? "",
    terms: quote.terms ?? "",
    items: quote.items.map((i) => ({
      description: i.description,
      quantity: String(i.quantity),
      unitPrice: String(Number(i.unitPrice)),
    })),
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/quotations/${quote.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-4" />
        Back to quotation
      </Link>

      <PageHeader
        icon={FileText}
        title={`Edit ${quote.quoteNumber}`}
        description={`For ${quote.lead.customerName}. Change the items, charges, validity, notes or terms, then save.`}
      />

      <Card className="p-6">
        {quote.salesOrder ? (
          <EmptyState
            icon={Lock}
            title="This quotation is now a sales order"
            description={`${quote.quoteNumber} became order ${quote.salesOrder.orderNumber}, which holds the agreed prices, so the quotation can no longer be edited.`}
            action={
              <Link href={`/quotations/${quote.id}`} className="btn btn-secondary">
                Back to quotation
              </Link>
            }
          />
        ) : (
          <NewQuotationForm
            leads={[{ id: quote.lead.id, customerName: quote.lead.customerName }]}
            products={products}
            quote={editable}
          />
        )}
      </Card>
    </div>
  );
}

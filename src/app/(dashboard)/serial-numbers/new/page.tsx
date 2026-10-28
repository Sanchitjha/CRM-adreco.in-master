import { redirect } from "next/navigation";
import { ScanBarcode } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage } from "@/lib/rbac";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { registerSerials } from "../actions";

export default async function RegisterSerialsPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const user = await requireUser();
  if (!canManage(user.role, "serials")) redirect("/serial-numbers");
  const { productId } = await searchParams;

  const [products, leads] = await Promise.all([
    prisma.product.findMany({
      where: { isSparePart: false, active: true },
      orderBy: [{ series: "asc" }, { heatingCapacityKw: "asc" }, { name: "asc" }],
      select: { id: true, name: true, modelCode: true },
    }),
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, customerName: true, phone: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <BackLink href="/serial-numbers" label="Back to serial numbers" />
      <PageHeader
        icon={ScanBarcode}
        title="Register units"
        description="Add the serial numbers of machines that have been built, or of machines already installed at a customer."
      />

      <Card className="max-w-3xl p-6">
        {products.length === 0 ? (
          <EmptyState
            icon={ScanBarcode}
            title="Add a product first"
            description="Serial numbers belong to a product in the catalog."
          />
        ) : (
          <AutoForm
            action={registerSerials}
            submitLabel="Register units"
            pendingLabel="Registering…"
            fields={[
              {
                kind: "select",
                name: "productId",
                label: "Product",
                required: true,
                defaultValue: productId,
                options: products.map((p) => ({ value: p.id, label: `${p.name} (${p.modelCode})` })),
                span: 2,
              },
              {
                kind: "textarea",
                name: "serials",
                label: "Serial numbers",
                required: true,
                rows: 5,
                placeholder: "One per line, or separated by commas",
                hint: "Up to 200 at a time. Scan or paste them in.",
                span: 2,
              },
              { name: "manufacturedOn", label: "Manufactured on", kind: "date" },
              { name: "notes", label: "Notes" },
              {
                kind: "select",
                name: "leadId",
                label: "Already installed at a customer? (optional)",
                placeholder: "Not sold yet — keep in stock",
                options: leads.map((l) => ({ value: l.id, label: `${l.customerName} · ${l.phone}` })),
                hint: "Use this for machines sold before the CRM, so their warranty and service are tracked.",
              },
              {
                name: "commissionedOn",
                label: "Commissioned on",
                kind: "date",
                hint: "Starts the warranty from this date. Needs a customer.",
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

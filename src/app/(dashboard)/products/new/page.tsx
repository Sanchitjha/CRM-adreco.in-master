import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { canManage } from "@/lib/rbac";
import { getOptions } from "@/lib/settings";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { productFields } from "@/components/products/product-fields";
import { createProduct } from "../actions";

export default async function NewProductPage() {
  const user = await requireUser();
  if (!canManage(user.role, "products")) redirect("/products");

  const [categories, warrantyPeriods] = await Promise.all([getOptions("PRODUCT_CATEGORY"), getOptions("WARRANTY_PERIOD")]);

  return (
    <div className="space-y-6">
      <BackLink href="/products" label="Back to products" />
      <PageHeader icon={Package} title="New product" description="Add a heat-pump model or a spare part to the catalog." />
      <Card className="max-w-3xl p-6">
        <AutoForm
          action={createProduct}
          submitLabel="Create product"
          pendingLabel="Creating…"
          fields={productFields({ categories, warrantyPeriods })}
        />
      </Card>
    </div>
  );
}

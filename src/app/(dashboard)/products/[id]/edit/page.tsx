import { notFound, redirect } from "next/navigation";
import { Package } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage } from "@/lib/rbac";
import { getOptions } from "@/lib/settings";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { productFields } from "@/components/products/product-fields";
import { updateProduct } from "../../actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canManage(user.role, "products")) redirect(`/products/${id}`);

  const [product, categories, warrantyPeriods] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    getOptions("PRODUCT_CATEGORY"),
    getOptions("WARRANTY_PERIOD"),
  ]);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <BackLink href={`/products/${id}`} label="Back to product" />
      <PageHeader icon={Package} title={`Edit ${product.name}`} description={product.modelCode} />
      <Card className="max-w-3xl p-6">
        <AutoForm
          action={updateProduct}
          submitLabel="Save changes"
          fields={[
            { kind: "hidden", name: "productId", value: product.id },
            ...productFields({ categories, warrantyPeriods, product }),
          ]}
        />
      </Card>
    </div>
  );
}

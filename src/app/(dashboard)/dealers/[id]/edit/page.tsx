import { notFound, redirect } from "next/navigation";
import { Handshake } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage } from "@/lib/rbac";
import { getOptions } from "@/lib/settings";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { dealerFields } from "@/components/dealers/dealer-fields";
import { updateDealer } from "../../actions";

export default async function EditDealerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canManage(user.role, "dealers")) redirect(`/dealers/${id}`);

  const [dealer, territories] = await Promise.all([prisma.dealer.findUnique({ where: { id } }), getOptions("TERRITORY")]);
  if (!dealer) notFound();

  return (
    <div className="space-y-6">
      <BackLink href={`/dealers/${id}`} label="Back to dealer" />
      <PageHeader icon={Handshake} title={`Edit ${dealer.name}`} />
      <Card className="max-w-3xl p-6">
        <AutoForm
          action={updateDealer}
          submitLabel="Save changes"
          fields={[{ kind: "hidden", name: "dealerId", value: dealer.id }, ...dealerFields({ territories, dealer })]}
        />
      </Card>
    </div>
  );
}

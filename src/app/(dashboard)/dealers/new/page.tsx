import { redirect } from "next/navigation";
import { Handshake } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { canManage } from "@/lib/rbac";
import { getOptions } from "@/lib/settings";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { dealerFields } from "@/components/dealers/dealer-fields";
import { createDealer } from "../actions";

export default async function NewDealerPage() {
  const user = await requireUser();
  if (!canManage(user.role, "dealers")) redirect("/dealers");

  const territories = await getOptions("TERRITORY");

  return (
    <div className="space-y-6">
      <BackLink href="/dealers" label="Back to dealers" />
      <PageHeader icon={Handshake} title="New dealer" description="Add a dealer or distributor to the partner network." />
      <Card className="max-w-3xl p-6">
        <AutoForm
          action={createDealer}
          submitLabel="Create dealer"
          pendingLabel="Creating…"
          fields={dealerFields({ territories })}
        />
      </Card>
    </div>
  );
}

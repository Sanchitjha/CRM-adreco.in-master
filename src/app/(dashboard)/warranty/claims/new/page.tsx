import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage } from "@/lib/rbac";
import { formatDate, today } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { createClaim } from "../../actions";

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ serialId?: string; ticketId?: string }>;
}) {
  const user = await requireUser();
  if (!canManage(user.role, "warranty")) redirect("/warranty");
  const { serialId, ticketId } = await searchParams;

  const units = await prisma.serialNumber.findMany({
    where: { warrantyEndsOn: { gte: today() } },
    include: { product: true, lead: true },
    orderBy: { serialNo: "asc" },
    take: 500,
  });

  return (
    <div className="space-y-6">
      <BackLink href={ticketId ? `/tickets/${ticketId}` : "/warranty?view=claims"} label={ticketId ? "Back to ticket" : "Back to claims"} />
      <PageHeader icon={ShieldCheck} title="New warranty claim" description="Claim parts or a repair for a machine that is under warranty." />

      <Card className="max-w-3xl p-6">
        {units.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No machines under warranty"
            description="A machine's warranty starts when it is commissioned."
          />
        ) : (
          <AutoForm
            action={createClaim}
            submitLabel="Submit claim"
            pendingLabel="Submitting…"
            fields={[
              ...(ticketId ? ([{ kind: "hidden", name: "ticketId", value: ticketId }] as const) : []),
              {
                kind: "select",
                name: "serialNumberId",
                label: "Machine",
                required: true,
                defaultValue: serialId,
                options: units.map((u) => ({
                  value: u.id,
                  label: `${u.serialNo} · ${u.product.name}${u.lead ? ` · ${u.lead.customerName}` : ""} (till ${formatDate(u.warrantyEndsOn)})`,
                })),
                span: 2,
              },
              { name: "issue", label: "Fault", required: true, placeholder: "e.g. Compressor failed to start", span: 2 },
              {
                name: "claimedParts",
                label: "Parts claimed",
                kind: "textarea",
                rows: 3,
                placeholder: "Parts or replacement being claimed, with quantities",
                span: 2,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

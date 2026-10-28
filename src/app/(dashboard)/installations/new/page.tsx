import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage } from "@/lib/rbac";
import { fieldTechnicians } from "@/lib/people";
import { toDateInput } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm, type FieldDef } from "@/components/auto-form";
import { createInstallation } from "../actions";

export default async function NewInstallationPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; leadId?: string }>;
}) {
  const user = await requireUser();
  if (!canManage(user.role, "installations")) redirect("/installations");
  const { orderId, leadId } = await searchParams;

  const [order, technicians] = await Promise.all([
    orderId ? prisma.salesOrder.findUnique({ where: { id: orderId }, include: { lead: true } }) : null,
    fieldTechnicians(),
  ]);

  const converted = order
    ? []
    : await prisma.lead.findMany({
        where: { status: "CONVERTED" },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, customerName: true, phone: true },
      });
  const selectedLead = order?.lead ?? (leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null);

  const technicianField: FieldDef = {
    kind: "select",
    name: "technicianId",
    label: "Technician",
    placeholder: "Assign later",
    options: technicians.map((t) => ({ value: t.id, label: t.name })),
  };

  const fields: FieldDef[] = [
    ...(order
      ? ([
          { kind: "hidden", name: "leadId", value: order.lead.id },
          { kind: "hidden", name: "salesOrderId", value: order.id },
        ] as FieldDef[])
      : [
          {
            kind: "select",
            name: "leadId",
            label: "Customer",
            required: true,
            defaultValue: selectedLead?.id,
            options: converted.map((l) => ({ value: l.id, label: `${l.customerName} · ${l.phone}` })),
            hint: "Customers whose lead has been converted.",
            span: 2,
          } as FieldDef,
        ]),
    {
      name: "siteAddress",
      label: "Site address",
      kind: "textarea",
      rows: 2,
      defaultValue: order?.shippingAddress ?? selectedLead?.address,
      span: 2,
    },
    { name: "contactPerson", label: "Site contact", defaultValue: selectedLead?.customerName },
    { name: "contactPhone", label: "Contact phone", kind: "tel", defaultValue: selectedLead?.phone },
    { name: "scheduledFor", label: "Scheduled for", kind: "date", defaultValue: toDateInput(order?.deliveryDate) },
    technicianField,
  ];

  return (
    <div className="space-y-6">
      <BackLink href={order ? `/sales-orders/${order.id}` : "/installations"} label={order ? "Back to order" : "Back to installations"} />
      <PageHeader
        icon={Wrench}
        title="New installation job"
        description={order ? `For order ${order.orderNumber} · ${order.lead.customerName}` : "Schedule an installation for a customer."}
      />
      <Card className="max-w-3xl p-6">
        {!order && converted.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No converted customers yet"
            description="A customer appears here once their lead is converted or a sales order is created."
          />
        ) : (
          <AutoForm action={createInstallation} submitLabel="Create job" pendingLabel="Creating…" fields={fields} />
        )}
      </Card>
    </div>
  );
}

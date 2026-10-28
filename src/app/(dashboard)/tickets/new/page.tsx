import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canCreate } from "@/lib/rbac";
import { canSeeLead, leadScope } from "@/lib/scope";
import { getOptions, getSlaPolicies } from "@/lib/settings";
import { formatDate, today } from "@/lib/dates";
import { warrantyState } from "@/lib/lifecycle";
import { TICKET_PRIORITY, WARRANTY_STATE } from "@/lib/statuses";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { CustomerPicker } from "@/components/customer-picker";
import { createTicket } from "../actions";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; serialId?: string }>;
}) {
  const user = await requireUser();
  if (!canCreate(user.role, "tickets")) redirect("/tickets");
  const { leadId, serialId } = await searchParams;

  const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null;
  const allowed = lead && canSeeLead(user.role, user.id, lead);

  const customers = allowed
    ? []
    : await prisma.lead.findMany({
        where: { OR: [{ status: "CONVERTED" }, { serialNumbers: { some: {} } }], ...leadScope(user.role, user.id) },
        orderBy: { customerName: "asc" },
        take: 500,
        select: { id: true, customerName: true, phone: true },
      });

  const [units, complaintTypes, sla] = allowed
    ? await Promise.all([
        prisma.serialNumber.findMany({
          where: { leadId: lead.id, status: { in: ["DISPATCHED", "INSTALLED", "COMMISSIONED"] } },
          include: { product: true },
          orderBy: { serialNo: "asc" },
        }),
        getOptions("COMPLAINT_TYPE"),
        getSlaPolicies(),
      ])
    : [[], [], null];

  const todayDate = today();

  return (
    <div className="space-y-6">
      <BackLink href="/tickets" label="Back to tickets" />
      <PageHeader
        icon={LifeBuoy}
        title="New service ticket"
        description={allowed ? `For ${lead.customerName} · ${lead.phone}` : "Log a complaint against a customer's machine."}
      />

      <Card className="max-w-3xl p-6">
        {!allowed || !sla ? (
          <CustomerPicker action="/tickets/new" leads={customers} />
        ) : (
          <AutoForm
            action={createTicket}
            submitLabel="Raise ticket"
            pendingLabel="Raising…"
            fields={[
              { kind: "hidden", name: "leadId", value: lead.id },
              {
                kind: "select",
                name: "serialNumberId",
                label: "Machine",
                placeholder: units.length ? "Not linked to a machine" : "No machines on record",
                defaultValue: serialId,
                options: units.map((u) => ({
                  value: u.id,
                  label: `${u.serialNo} · ${u.product.name} · ${WARRANTY_STATE[warrantyState(u.warrantyEndsOn, todayDate)].label}${u.warrantyEndsOn ? ` (till ${formatDate(u.warrantyEndsOn)})` : ""}`,
                })),
                span: 2,
              },
              { name: "subject", label: "Subject", required: true, placeholder: "e.g. Unit not heating water", span: 2 },
              {
                kind: "select",
                name: "complaintType",
                label: "Complaint type",
                placeholder: "Select…",
                options: complaintTypes.map((c) => ({ value: c, label: c })),
              },
              {
                kind: "select",
                name: "priority",
                label: "Priority",
                required: true,
                defaultValue: "MEDIUM",
                options: (Object.keys(TICKET_PRIORITY) as (keyof typeof TICKET_PRIORITY)[]).map((p) => ({
                  value: p,
                  label: `${TICKET_PRIORITY[p].label} — resolve within ${sla[p]} h`,
                })),
              },
              { name: "visitScheduledFor", label: "Site visit date", kind: "date" },
              { name: "description", label: "Details", kind: "textarea", rows: 4, span: 2, placeholder: "What is the customer reporting?" },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

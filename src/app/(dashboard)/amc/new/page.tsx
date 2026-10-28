import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage } from "@/lib/rbac";
import { canSeeLead, leadScope } from "@/lib/scope";
import { formatDate, toDateInput, today } from "@/lib/dates";
import { addDaysUtc, addMonthsUtc, warrantyState } from "@/lib/lifecycle";
import { WARRANTY_STATE } from "@/lib/statuses";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { CustomerPicker } from "@/components/customer-picker";
import { createAmc } from "../actions";

export default async function NewAmcPage({ searchParams }: { searchParams: Promise<{ leadId?: string }> }) {
  const user = await requireUser();
  if (!canManage(user.role, "amc")) redirect("/amc");
  const { leadId } = await searchParams;

  const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null;
  const allowed = lead && canSeeLead(user.role, user.id, lead);

  const customers = allowed
    ? []
    : await prisma.lead.findMany({
        where: { serialNumbers: { some: { status: { in: ["DISPATCHED", "INSTALLED", "COMMISSIONED"] } } }, ...leadScope(user.role, user.id) },
        orderBy: { customerName: "asc" },
        take: 500,
        select: { id: true, customerName: true, phone: true },
      });

  const units = allowed
    ? await prisma.serialNumber.findMany({
        where: { leadId: lead.id, status: { in: ["DISPATCHED", "INSTALLED", "COMMISSIONED"] } },
        include: { product: true },
        orderBy: { serialNo: "asc" },
      })
    : [];

  const todayDate = today();
  const defaultEnd = addDaysUtc(addMonthsUtc(todayDate, 12), -1);

  return (
    <div className="space-y-6">
      <BackLink href="/amc" label="Back to AMC contracts" />
      <PageHeader
        icon={CalendarClock}
        title="New AMC contract"
        description={allowed ? `For ${lead.customerName}` : "Choose the customer whose machines the contract will cover."}
      />

      <Card className="max-w-3xl p-6">
        {!allowed ? (
          customers.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No customers with machines yet"
              description="A contract covers machines that have been dispatched to a customer."
            />
          ) : (
            <CustomerPicker action="/amc/new" leads={customers} />
          )
        ) : (
          <AutoForm
            action={createAmc}
            submitLabel="Create contract"
            pendingLabel="Creating…"
            fields={[
              { kind: "hidden", name: "leadId", value: lead.id },
              {
                kind: "checkboxes",
                name: "serialIds",
                label: "Machines covered",
                options: units.map((u) => ({
                  value: u.id,
                  label: `${u.serialNo} · ${u.product.name}`,
                  hint: `${WARRANTY_STATE[warrantyState(u.warrantyEndsOn, todayDate)].label}${u.warrantyEndsOn ? ` — till ${formatDate(u.warrantyEndsOn)}` : ""}`,
                })),
                emptyText: "This customer has no machines on record.",
              },
              { name: "startDate", label: "Start date", kind: "date", required: true, defaultValue: toDateInput(todayDate) },
              { name: "endDate", label: "End date", kind: "date", required: true, defaultValue: toDateInput(defaultEnd) },
              {
                name: "visitsPerYear",
                label: "Preventive visits per year",
                kind: "number",
                min: 1,
                max: 52,
                required: true,
                defaultValue: 2,
                hint: "Visits are spread evenly across the term.",
              },
              { name: "amount", label: "Contract amount (₹)", kind: "number", min: 0, step: "0.01", required: true },
              { name: "coveredParts", label: "Covered parts", kind: "textarea", rows: 2, placeholder: "Parts and consumables included in the contract", span: 2 },
              { name: "notes", label: "Notes", kind: "textarea", rows: 2, span: 2 },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

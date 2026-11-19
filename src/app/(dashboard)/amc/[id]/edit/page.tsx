import { notFound, redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { formatDate, toDateInput, today } from "@/lib/dates";
import { warrantyState } from "@/lib/lifecycle";
import { WARRANTY_STATE } from "@/lib/statuses";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { updateAmc } from "../../actions";

/** Changing a contract: its dates, visits a year, charges, covered parts, notes and machines. */
export default async function EditAmcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canManage(user.role, "amc")) redirect(`/amc/${id}`);

  const contract = await prisma.amcContract.findUnique({
    where: { id },
    include: { lead: true, units: true },
  });
  if (!contract) notFound();
  if (!canSeeLead(user.role, user.id, contract.lead)) notFound();
  if (contract.status === "CANCELLED") redirect(`/amc/${id}`);

  const machines = await prisma.serialNumber.findMany({
    where: { leadId: contract.leadId, status: { in: ["DISPATCHED", "INSTALLED", "COMMISSIONED"] } },
    include: { product: true },
    orderBy: { serialNo: "asc" },
  });
  const covered = new Set(contract.units.map((u) => u.serialNumberId));
  const todayDate = today();

  return (
    <div className="space-y-5">
      <BackLink href={`/amc/${contract.id}`} label="Back to the contract" />
      <PageHeader
        icon={CalendarClock}
        title={`Edit ${contract.contractNumber}`}
        description={`For ${contract.lead.customerName}. Visits that are already done are kept. If you change the dates or the visits a year, the visits still to come are planned again between today and the end of the contract.`}
      />

      <Card className="max-w-3xl p-4 sm:p-6">
        <AutoForm
          action={updateAmc}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          fields={[
            { kind: "hidden", name: "amcId", value: contract.id },
            {
              kind: "checkboxes",
              name: "serialIds",
              label: "Machines covered",
              options: machines.map((u) => ({
                value: u.id,
                checked: covered.has(u.id),
                label: `${u.serialNo} · ${u.product.name}${u.product.heatingCapacityKw ? ` · ${Number(u.product.heatingCapacityKw)} kW` : ""}`,
                hint: `${WARRANTY_STATE[warrantyState(u.warrantyEndsOn, todayDate)].label}${u.warrantyEndsOn ? ` — till ${formatDate(u.warrantyEndsOn)}` : ""}`,
              })),
              emptyText: "This customer has no machines on record.",
            },
            { name: "startDate", label: "Start date", kind: "date", required: true, defaultValue: toDateInput(contract.startDate) },
            { name: "endDate", label: "End date", kind: "date", required: true, defaultValue: toDateInput(contract.endDate) },
            { name: "visitsPerYear", label: "Preventive visits per year", kind: "number", min: 1, max: 52, required: true, defaultValue: contract.visitsPerYear },
            { name: "amount", label: "Contract amount (₹)", kind: "number", min: 0, step: "0.01", required: true, defaultValue: Number(contract.amount) },
            { name: "coveredParts", label: "Covered parts", kind: "textarea", rows: 2, placeholder: "Parts and consumables included in the contract", span: 2, defaultValue: contract.coveredParts },
            { name: "notes", label: "Notes", kind: "textarea", rows: 2, span: 2, defaultValue: contract.notes },
          ]}
        />
      </Card>
    </div>
  );
}

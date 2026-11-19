import { notFound, redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canEditMachines } from "@/lib/rbac";
import { toDateInput } from "@/lib/dates";
import { isRecordedMachine } from "@/lib/installed-base";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { ActionButton } from "@/components/action-forms";
import { EditMachineForm } from "@/components/installed/edit-machine-form";
import { removeMachine } from "../../actions";

export default async function EditMachinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canEditMachines(user.role)) redirect(`/serial-numbers/${id}`);

  const machine = await prisma.serialNumber.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, customerName: true, phone: true, address: true } },
      amcUnits: { include: { amc: { select: { contractNumber: true } } } },
      _count: { select: { tickets: true, claims: true } },
    },
  });
  if (!machine) notFound();
  if (machine.status === "IN_STOCK" || machine.status === "SCRAPPED") redirect(`/serial-numbers/${id}`);

  const [products, customers] = await Promise.all([
    prisma.product.findMany({
      where: { isSparePart: false },
      orderBy: [{ active: "desc" }, { series: "asc" }, { heatingCapacityKw: "asc" }, { name: "asc" }],
      select: { id: true, name: true, modelCode: true },
    }),
    prisma.lead.findMany({
      orderBy: { customerName: "asc" },
      take: 3000,
      select: { id: true, customerName: true, phone: true, address: true },
    }),
  ]);

  const recorded = isRecordedMachine(machine);
  const covered = machine.amcUnits[0]?.amc.contractNumber ?? null;
  const canChangeModelAndCustomer = recorded && covered === null;
  const canRemove = user.role === "ADMIN" && recorded && machine._count.tickets === 0 && machine._count.claims === 0;

  const lockedNote = !recorded
    ? "This machine came through a sales order and an installation job, so its model and customer cannot be changed here."
    : covered
      ? `This machine is covered by contract ${covered}. Take it off the contract (Edit contract) before changing its customer.`
      : null;

  return (
    <div className="space-y-5">
      <BackLink href={`/serial-numbers/${machine.id}`} label="Back to the machine" />
      <PageHeader icon={Wrench} title={`Edit ${machine.serialNo}`} description="Correct the serial number, the dates, the model or the customer. Every change is recorded in the machine's history." />

      <Card className="p-4 sm:p-6">
        <EditMachineForm
          machine={{
            id: machine.id,
            serialNo: machine.serialNo,
            productId: machine.productId,
            customer: machine.lead ? { id: machine.lead.id, name: machine.lead.customerName, phone: machine.lead.phone, address: machine.lead.address } : null,
            installedAt: toDateInput(machine.installedAt),
            commissionedAt: toDateInput(machine.commissionedAt),
            warrantyStartsOn: toDateInput(machine.warrantyStartsOn),
            warrantyEndsOn: toDateInput(machine.warrantyEndsOn),
            manufacturedOn: toDateInput(machine.manufacturedOn),
            notes: machine.notes ?? "",
          }}
          products={products}
          customers={customers.map((c) => ({ id: c.id, name: c.customerName, phone: c.phone, address: c.address }))}
          canChangeModelAndCustomer={canChangeModelAndCustomer}
          canEditWarranty={user.role === "ADMIN" || recorded}
          lockedNote={lockedNote}
        />
      </Card>

      {canRemove && (
        <Card className="space-y-3 border-rose-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-rose-700">Entered by mistake?</h2>
          <p className="text-sm text-slate-600">
            Remove this machine from the CRM, together with the coverage it has on a maintenance contract. This cannot be undone. It is possible only because no order, job, ticket or claim depends on it.
          </p>
          <ActionButton
            action={removeMachine}
            hidden={{ serialId: machine.id }}
            label="Remove this machine"
            pendingLabel="Removing…"
            variant="danger"
            confirm={`Remove ${machine.serialNo} from the CRM? This cannot be undone.`}
            small={false}
          />
        </Card>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, FileUp, PackagePlus } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canRecordInstalledBase } from "@/lib/rbac";
import { leadScope } from "@/lib/scope";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { InstalledMachineForm } from "@/components/installed/installed-machine-form";

export default async function NewInstalledPage({ searchParams }: { searchParams: Promise<{ saved?: string; lead?: string }> }) {
  const user = await requireUser();
  if (!canRecordInstalledBase(user.role)) redirect("/warranty");
  const { saved, lead } = await searchParams;

  const [customers, products] = await Promise.all([
    prisma.lead.findMany({
      where: leadScope(user.role, user.id),
      orderBy: { customerName: "asc" },
      take: 3000,
      select: { id: true, customerName: true, phone: true, address: true },
    }),
    prisma.product.findMany({
      where: { isSparePart: false, active: true },
      orderBy: [{ series: "asc" }, { heatingCapacityKw: "asc" }, { name: "asc" }],
      select: { id: true, name: true, modelCode: true, heatingCapacityKw: true, warrantyMonths: true },
    }),
  ]);

  const savedCount = Number(saved);
  const savedFor = customers.find((c) => c.id === lead);

  return (
    <div className="space-y-5">
      <BackLink href="/warranty" label="Back to warranty" />
      <PageHeader
        icon={PackagePlus}
        title="Add an existing installation"
        description="Record machines that were installed before the CRM, or by someone else: the customer, the machine, the installation date, the warranty and any maintenance contract."
        actions={
          <Link href="/warranty/installed/import" className="btn btn-secondary">
            <FileUp className="size-4" />
            Import many from Excel
          </Link>
        }
      />

      {Number.isInteger(savedCount) && savedCount > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
          <p className="flex items-start gap-2 text-sm font-medium text-emerald-800">
            <CircleCheck className="mt-0.5 size-4 shrink-0" />
            Saved {savedCount} machine{savedCount === 1 ? "" : "s"}
            {savedFor ? ` for ${savedFor.customerName}` : ""}. The warranty dates are worked out and shown on the Warranty page.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={savedFor ? `/warranty?view=all&q=${encodeURIComponent(savedFor.customerName)}` : "/warranty?view=all"} className="btn btn-secondary btn-sm">
              See the machines
            </Link>
          </div>
        </div>
      )}

      <InstalledMachineForm
        key={`${saved ?? ""}-${lead ?? ""}`}
        customers={customers.map((c) => ({ id: c.id, name: c.customerName, phone: c.phone, address: c.address }))}
        models={products.map((p) => ({
          id: p.id,
          name: p.name,
          modelCode: p.modelCode,
          capacityKw: p.heatingCapacityKw === null ? null : Number(p.heatingCapacityKw),
          warrantyMonths: p.warrantyMonths,
        }))}
        initialLeadId={savedFor?.id}
      />
    </div>
  );
}

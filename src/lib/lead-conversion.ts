import { prisma } from "@/lib/db";
import { nextDepartmentName } from "@/lib/department-pipeline";
import { createRequiredDocuments } from "@/lib/document-requirements";

/**
 * Marks a lead as converted once a sales order exists for it. The first conversion also hands the lead from
 * Sales to the next department, exactly as changing the status to "Converted" on the lead page does.
 * Returns true when the lead was changed.
 */
export async function ensureLeadConverted(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.status === "CONVERTED") return false;

  const isFirstConversion = !lead.currentDepartmentId && !lead.convertedAt;
  if (!isFirstConversion) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "CONVERTED" } });
    return true;
  }

  const salesDept = await prisma.department.findUnique({ where: { name: "Sales" } });
  const nextName = nextDepartmentName("Sales");
  const nextDept = nextName ? await prisma.department.findUnique({ where: { name: nextName } }) : null;

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { status: "CONVERTED", convertedAt: new Date(), currentDepartmentId: nextDept?.id ?? null },
    });

    if (salesDept) {
      await tx.leadDepartmentHistory.create({
        data: {
          leadId,
          departmentId: salesDept.id,
          assignedToId: lead.assignedToId,
          status: "COMPLETED",
          enteredAt: lead.createdAt,
          completedAt: new Date(),
        },
      });
    }

    if (nextDept) {
      await tx.leadDepartmentHistory.create({ data: { leadId, departmentId: nextDept.id, status: "PENDING" } });
      await createRequiredDocuments(tx, leadId, nextDept.name);
    }
  });

  return true;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Phone } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ROLE_TO_DEPARTMENT_NAME } from "@/lib/rbac";
import { StageActions } from "@/components/queue/stage-actions";
import { PageHeader, Card, EmptyState, Avatar, Badge } from "@/components/ui";

export default async function QueuePage() {
  const session = await auth();
  const role = session!.user.role;
  const departmentName = ROLE_TO_DEPARTMENT_NAME[role];
  if (!departmentName) redirect("/");

  const department = await prisma.department.findUnique({ where: { name: departmentName } });
  if (!department) redirect("/");

  const leads = await prisma.lead.findMany({
    where: { currentDepartmentId: department.id },
    include: {
      assignedTo: true,
      departmentStages: {
        where: { departmentId: department.id, status: { not: "COMPLETED" } },
        orderBy: { enteredAt: "desc" },
        take: 1,
      },
    },
    orderBy: { convertedAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Inbox}
        title={`${departmentName} queue`}
        description="Leads currently waiting on your team."
        actions={<Badge tone="brand">{leads.length} in queue</Badge>}
      />

      {leads.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title="Your queue is clear" description="Nothing is waiting on your team right now." />
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const stage = lead.departmentStages[0];
            if (!stage) return null;
            return (
              <Card key={lead.id} interactive className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar name={lead.customerName} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                          {lead.customerName}
                        </Link>
                        <Badge tone={stage.status === "IN_PROGRESS" ? "info" : "warning"}>
                          {stage.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" /> {lead.phone}
                        </span>
                        <span>·</span>
                        <span>{lead.productCategory ?? "No category"}</span>
                        <span>·</span>
                        <span>Rep: {lead.assignedTo?.name ?? "Unassigned"}</span>
                      </p>
                      {lead.requirementNotes && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{lead.requirementNotes}</p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 sm:pl-4">
                    <StageActions leadId={lead.id} stageStatus={stage.status} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

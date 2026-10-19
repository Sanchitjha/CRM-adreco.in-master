import { ClipboardList, Plus } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { CreateTaskForm } from "@/components/tasks/create-task-form";
import { TaskList, type TaskRow } from "@/components/tasks/task-list";
import { PageHeader, SectionCard } from "@/components/ui";

export default async function TasksPage() {
  const session = await auth();
  const isAdmin = session!.user.role === "ADMIN";

  const tasks = await prisma.task.findMany({
    where: isAdmin ? {} : { assignedToId: session!.user.id },
    include: { assignedTo: true, lead: true },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  const assignableUsers = isAdmin
    ? await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    assignedToName: t.assignedTo.name,
    leadId: t.leadId,
    leadCustomerName: t.lead?.customerName ?? null,
  }));

  const openCount = rows.filter((t) => t.status !== "DONE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="Tasks"
        description={isAdmin ? "Assign and track work across the team." : "Work assigned to you."}
      />

      {isAdmin && (
        <SectionCard title="Assign a task" description="Delegate work to any active team member" icon={Plus}>
          <CreateTaskForm users={assignableUsers} />
        </SectionCard>
      )}

      <SectionCard
        title={isAdmin ? "All tasks" : "My tasks"}
        description={`${openCount} open`}
        icon={ClipboardList}
        bodyClassName="p-0"
      >
        <TaskList tasks={rows} showAssignee={isAdmin} />
      </SectionCard>
    </div>
  );
}

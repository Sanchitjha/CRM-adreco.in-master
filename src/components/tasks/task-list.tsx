"use client";

import { useState, useTransition } from "react";
import { ListChecks } from "lucide-react";
import type { TaskStatus, TaskPriority } from "@prisma/client";
import { updateTaskStatus } from "@/app/(dashboard)/tasks/actions";
import { Badge, EmptyState, type BadgeTone } from "@/components/ui";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignedToName: string | null;
  leadId: string | null;
  leadCustomerName: string | null;
};

const STATUS_VALUES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "danger",
};

export function TaskList({ tasks, showAssignee }: { tasks: TaskRow[]; showAssignee: boolean }) {
  if (tasks.length === 0) {
    return <EmptyState icon={ListChecks} title="No tasks here" description="Nothing to show right now." />;
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} showAssignee={showAssignee} />
      ))}
    </ul>
  );
}

function TaskItem({ task, showAssignee }: { task: TaskRow; showAssignee: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = task.status === "DONE";

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value;
    setError(null);
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update task.");
      }
    });
  }

  const meta = [
    showAssignee && task.assignedToName ? task.assignedToName : null,
    task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString("en-IN")}` : "No due date",
    task.leadId && task.leadCustomerName ? `Re: ${task.leadCustomerName}` : null,
  ].filter(Boolean);

  return (
    <li className="flex items-start justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>
            {task.title}
          </span>
          <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}</Badge>
        </div>
        {task.description && <p className="mt-0.5 text-sm text-slate-500">{task.description}</p>}
        <p className="mt-0.5 text-xs text-slate-400">{meta.join(" · ")}</p>
        {error && <p className="mt-0.5 text-xs text-rose-600">{error}</p>}
      </div>
      <select
        value={task.status}
        onChange={handleStatusChange}
        disabled={pending}
        aria-label="Task status"
        className="select w-auto shrink-0 py-1.5 text-xs"
      >
        {STATUS_VALUES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
    </li>
  );
}

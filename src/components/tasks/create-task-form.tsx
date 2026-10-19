"use client";

import { useActionState } from "react";
import { createTask } from "@/app/(dashboard)/tasks/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { TASK_PRIORITY_VALUES } from "@/lib/validation/task";

type AssignableUser = { id: string; name: string };

export function CreateTaskForm({ users }: { users: AssignableUser[] }) {
  const [state, formAction, pending] = useActionState(createTask, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="title">
          Title
        </label>
        <input id="title" name="title" required className="input" placeholder="e.g. Prepare quotation for ABC Hotel" />
      </div>

      <div>
        <label className="label" htmlFor="assignedToId">
          Assign to
        </label>
        <select id="assignedToId" name="assignedToId" required className="select" defaultValue="">
          <option value="">Choose…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="priority">
          Priority
        </label>
        <select id="priority" name="priority" defaultValue="MEDIUM" className="select">
          {TASK_PRIORITY_VALUES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="dueDate">
          Due date
        </label>
        <input type="date" id="dueDate" name="dueDate" className="input sm:max-w-xs" />
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="description">
          Description
        </label>
        <textarea id="description" name="description" rows={2} className="textarea" />
      </div>

      {state.error && <p className="form-error sm:col-span-2">{state.error}</p>}

      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Assigning…" : "Assign task"}
        </button>
      </div>
    </form>
  );
}

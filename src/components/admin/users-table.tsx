"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { changeUserRole, resetUserPassword, toggleUserActive } from "@/app/(dashboard)/admin/users/actions";
import { ROLE_LABELS } from "@/lib/rbac";
import { ROLE_VALUES } from "@/lib/validation/user";
import { Avatar } from "@/components/ui";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

export function UsersTable({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
            <th className="px-5 py-3 font-medium text-slate-500">Name</th>
            <th className="px-5 py-3 font-medium text-slate-500">Role</th>
            <th className="px-5 py-3 font-medium text-slate-500">Status</th>
            <th className="px-5 py-3 font-medium text-slate-500">Reset password</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {users.map((u) => (
            <UserRowItem key={u.id} user={u} isSelf={u.id === currentUserId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRowItem({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value;
    setError(null);
    startTransition(async () => {
      try {
        await changeUserRole(user.id, role);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not change role.");
      }
    });
  }

  function handleToggleActive() {
    setError(null);
    startTransition(async () => {
      try {
        await toggleUserActive(user.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update status.");
      }
    });
  }

  function handleResetPassword() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await resetUserPassword(user.id, password);
        setPassword("");
        setResetDone(true);
        setTimeout(() => setResetDone(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reset password.");
      }
    });
  }

  return (
    <tr className="align-middle transition hover:bg-slate-50/70">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <div className="font-medium text-slate-800">
              {user.name}
              {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
            </div>
            <div className="truncate text-xs text-slate-400">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <select
          defaultValue={user.role}
          disabled={isSelf || pending}
          onChange={handleRoleChange}
          aria-label="Role"
          className="select w-auto min-w-44 py-1.5 text-sm"
        >
          {ROLE_VALUES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-5 py-3">
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={isSelf || pending}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition disabled:opacity-60 ${
            user.active
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
              : "bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200"
          }`}
        >
          <span className="size-1.5 rounded-full bg-current opacity-70" />
          {user.active ? "Active" : "Inactive"}
        </button>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="input w-36 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={pending}
            className="btn btn-secondary btn-sm"
          >
            {resetDone ? "Done ✓" : "Reset"}
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </td>
    </tr>
  );
}

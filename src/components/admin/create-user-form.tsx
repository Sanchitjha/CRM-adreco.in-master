"use client";

import { useActionState } from "react";
import { createUser } from "@/app/(dashboard)/admin/users/actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { ROLE_LABELS } from "@/lib/rbac";
import { ROLE_VALUES } from "@/lib/validation/user";

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUser, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="name">
          Name
        </label>
        <input id="name" name="name" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Initial password
        </label>
        <input
          id="password"
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="role">
          Role
        </label>
        <select id="role" name="role" className="select">
          {ROLE_VALUES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {state.error && <p className="form-error sm:col-span-2">{state.error}</p>}

      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { grantRole } from "@/app/admin/actions";

const ROLES = [
  { value: "author", label: "Author" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Administrator" },
];

/** Grants one role to one account. Roles already held are not offered again. */
export function GrantRoleForm({
  userId,
  existing,
}: {
  userId: string;
  existing: string[];
}) {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await grantRole(formData);
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  const available = ROLES.filter((role) => !existing.includes(role.value));
  if (!available.length) return null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <label htmlFor={`role-${userId}`} className="sr-only">Role to grant</label>
      <select
        id={`role-${userId}`}
        name="role"
        defaultValue={available[0].value}
        className="rounded-control border border-hairline bg-paper px-2.5 py-1.5 text-meta text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {available.map((role) => (
          <option key={role.value} value={role.value}>{role.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-hairline px-3.5 py-1.5 text-meta text-ink hover:border-muted disabled:text-muted"
      >
        {pending ? "Granting…" : "Grant"}
      </button>
      {state?.error ? (
        <span role="alert" className="text-meta text-signal">{state.error}</span>
      ) : null}
    </form>
  );
}

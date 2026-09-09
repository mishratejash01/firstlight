"use client";

import { useActionState } from "react";

import { toggleRole } from "@/app/admin/actions";

/**
 * One role, one button.
 *
 * The button states what is true now, and pressing it makes the opposite true.
 * aria-pressed carries the same fact to a screen reader, so the control is not
 * relying on the border weight to communicate state.
 */
export function RoleToggle({
  userId,
  role,
  label,
  granted,
}: {
  userId: string;
  role: "admin" | "editor" | "author";
  label: string;
  granted: boolean;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await toggleRole(formData);
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  return (
    <form action={action} className="inline-flex flex-col items-start">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="grant" value={granted ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={granted}
        className={
          granted
            ? "rounded-control border border-accent bg-accent px-3 py-1.5 text-meta text-paper disabled:opacity-60"
            : "rounded-control border border-hairline px-3 py-1.5 text-meta text-muted hover:border-muted hover:text-ink disabled:opacity-60"
        }
      >
        {pending ? "…" : label}
      </button>
      {state?.error ? (
        <span role="alert" className="mt-1 max-w-56 text-meta text-signal">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

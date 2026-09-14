"use client";

import { useActionState, useState } from "react";

import { toggleRole } from "@/app/admin/actions";

/**
 * One role, one button — with a confirmation step where it matters.
 *
 * Granting Editor or Admin is privilege escalation: it lets someone publish to
 * the live site, or change who else can. A single unconfirmed press is too
 * easy to do by accident while looking around, and the consequence is that a
 * reader silently gains the ability to publish — which is exactly what happened
 * in testing.
 *
 * Author grants and every revoke stay single-press. Revoking is recoverable and
 * an author still cannot publish, so friction there would be noise.
 */
const NEEDS_CONFIRMATION: Record<string, string> = {
  editor: "They will be able to publish and schedule stories on the live site.",
  admin: "They will be able to publish, and to change who else has access.",
};

export function RoleToggle({
  userId,
  role,
  label,
  granted,
  personLabel,
}: {
  userId: string;
  role: "admin" | "editor" | "author" | "reviewer";
  label: string;
  granted: boolean;
  personLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);

  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await toggleRole(formData);
      setConfirming(false);
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  const warning = !granted ? NEEDS_CONFIRMATION[role] : undefined;

  // Ask first, but only when granting a role that can publish or delegate.
  if (warning && !confirming) {
    return (
      <div className="inline-flex flex-col items-start">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-pressed={false}
          className="rounded-control border border-hairline px-3 py-1.5 text-meta text-muted hover:border-muted hover:text-ink"
        >
          {label}
        </button>
      </div>
    );
  }

  if (warning && confirming) {
    return (
      <form action={action} className="flex flex-col items-start gap-2 border-l-2 border-signal pl-3">
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="grant" value="true" />
        <p className="max-w-64 text-meta leading-relaxed text-ink">
          Give <span className="font-semibold">{personLabel}</span> {label.toLowerCase()} access? {warning}
        </p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border border-accent bg-accent px-3 py-1.5 text-meta text-paper disabled:opacity-60"
          >
            {pending ? "…" : "Yes, grant it"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-control border border-hairline px-3 py-1.5 text-meta text-ink hover:border-muted"
          >
            Cancel
          </button>
        </div>
        {state?.error ? (
          <span role="alert" className="max-w-64 text-meta text-signal">{state.error}</span>
        ) : null}
      </form>
    );
  }

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
        <span role="alert" className="mt-1 max-w-56 text-meta text-signal">{state.error}</span>
      ) : null}
    </form>
  );
}

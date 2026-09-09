"use client";

import { useActionState } from "react";

type Result = { error: string } | { ok: true; note?: string };

/**
 * A single-purpose form button bound to a server action.
 *
 * Every desk operation is a real form POST rather than a fetch from an onClick
 * handler, so it works before hydration and degrades honestly if JavaScript
 * fails. The variants exist so a destructive action never looks like the
 * primary one.
 */
export function ActionButton({
  action,
  hidden,
  label,
  pendingLabel,
  variant = "quiet",
}: {
  action: (formData: FormData) => Promise<Result>;
  hidden: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "quiet";
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: Result | null, formData: FormData) => action(formData),
    null,
  );

  const className =
    variant === "primary"
      ? "rounded-control border border-accent bg-accent px-3.5 py-1.5 text-meta text-paper hover:opacity-90 disabled:opacity-60"
      : "rounded-control border border-hairline px-3.5 py-1.5 text-meta text-ink hover:border-muted disabled:text-muted";

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
      {state && "error" in state ? (
        <span role="alert" className="text-meta text-signal">{state.error}</span>
      ) : null}
      {state && "ok" in state && state.note ? (
        <span className="text-meta text-muted">{state.note}</span>
      ) : null}
    </form>
  );
}

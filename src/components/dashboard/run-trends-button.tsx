"use client";

import { useActionState } from "react";

import { runTrendsNow } from "@/app/admin/trend-actions";

/** Polls, triages and writes immediately rather than waiting for the schedule. */
export function RunTrendsButton() {
  const [state, action, pending] = useActionState(
    async () => {
      const result = await runTrendsNow();
      return "error" in result ? { error: result.error } : { note: result.note };
    },
    null as { error?: string; note?: string } | null,
  );

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted disabled:text-muted"
      >
        {pending ? "Checking…" : "Check trends now"}
      </button>
      {state?.error ? (
        <span role="alert" className="max-w-96 text-right text-meta text-signal">{state.error}</span>
      ) : null}
      {state?.note ? (
        <span className="max-w-96 text-right text-meta text-muted">{state.note}</span>
      ) : null}
    </form>
  );
}

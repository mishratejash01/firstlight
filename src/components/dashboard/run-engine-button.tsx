"use client";

import { useActionState } from "react";

import { runEngineNow } from "@/app/admin/event-actions";

/** Polls, clusters, scores, triages and writes immediately rather than waiting for the schedule. */
export function RunEngineButton() {
  const [state, action, pending] = useActionState(
    async () => {
      const result = await runEngineNow();
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
        {pending ? "Running…" : "Run the engine now"}
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

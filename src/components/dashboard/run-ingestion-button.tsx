"use client";

import { useActionState } from "react";

import { runIngestionNow } from "@/app/admin/source-actions";

/** Polls every feed immediately, so a newly added source can be proved to work. */
export function RunIngestionButton() {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; note?: string } | null) => {
      const result = await runIngestionNow();
      return "error" in result ? { error: result.error } : { note: result.note };
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted disabled:text-muted"
      >
        {pending ? "Checking feeds…" : "Check feeds now"}
      </button>
      {state?.error ? (
        <span role="alert" className="max-w-80 text-right text-meta text-signal">{state.error}</span>
      ) : null}
      {state?.note ? (
        <span className="max-w-80 text-right text-meta text-muted">{state.note}</span>
      ) : null}
    </form>
  );
}

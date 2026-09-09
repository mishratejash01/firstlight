"use client";

import { useActionState } from "react";

import { scheduleArticle } from "@/app/desk/actions";

/**
 * Schedules a story for later.
 *
 * The input is datetime-local, so the editor picks a time in their own
 * timezone and the browser hands us a value we convert once, on the server.
 * Asking a newsroom to think in UTC at 11pm is how stories publish a day early.
 */
export function ScheduleForm({ articleId }: { articleId: string }) {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await scheduleArticle(formData);
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={articleId} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`when-${articleId}`} className="sr-only">
          Publication time
        </label>
        <input
          id={`when-${articleId}`}
          type="datetime-local"
          name="scheduled_for"
          required
          className="rounded-control border border-hairline bg-paper px-2.5 py-1.5 text-meta text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-control border border-hairline px-3.5 py-1.5 text-meta text-ink hover:border-muted disabled:text-muted"
        >
          {pending ? "Scheduling…" : "Schedule"}
        </button>
      </div>
      {state?.error ? (
        <span role="alert" className="text-meta text-signal">{state.error}</span>
      ) : null}
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { addExclusion } from "@/app/admin/trend-actions";

/** Adds a term the paper will never chase. */
export function ExclusionForm() {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await addExclusion(formData);
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  return (
    <form action={action} className="mt-5 flex max-w-xl flex-col gap-2 sm:flex-row">
      <label htmlFor="exclusion-pattern" className="sr-only">Term to exclude</label>
      <input
        id="exclusion-pattern"
        name="pattern"
        required
        placeholder="e.g. box office"
        className="min-w-0 flex-1 rounded-control border border-hairline bg-paper px-3 py-2 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <label htmlFor="exclusion-reason" className="sr-only">Reason</label>
      <input
        id="exclusion-reason"
        name="reason"
        placeholder="Why (optional)"
        className="min-w-0 flex-1 rounded-control border border-hairline bg-paper px-3 py-2 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-hairline px-4 py-2 text-body text-ink hover:border-muted disabled:opacity-60"
      >
        {pending ? "Adding…" : "Exclude"}
      </button>
      {state?.error ? (
        <p role="alert" className="text-meta text-signal">{state.error}</p>
      ) : null}
    </form>
  );
}

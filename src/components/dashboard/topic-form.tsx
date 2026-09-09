"use client";

import { useActionState } from "react";

import { addTopic } from "@/app/admin/topic-actions";

const FIELD =
  "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Adds a standing brief for the scheduler to write from. */
export function TopicForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; done?: boolean } | null, formData: FormData) => {
      const result = await addTopic(formData);
      return "error" in result ? { error: result.error } : { done: true };
    },
    null,
  );

  return (
    <form action={action} className="mt-4 max-w-2xl space-y-4">
      <div>
        <label htmlFor="topic" className="block text-meta text-muted">
          Topic — what should be covered
        </label>
        <textarea
          id="topic"
          name="topic"
          required
          rows={2}
          placeholder="Weekly round-up of decisions taken by the city transport authority"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="angle" className="block text-meta text-muted">
          Angle or emphasis (optional)
        </label>
        <input id="angle" name="angle" placeholder="Focus on cost to passengers" className={FIELD} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="topic-category" className="block text-meta text-muted">Section</label>
          <select id="topic-category" name="category_id" required defaultValue="" className={FIELD}>
            <option value="" disabled>Choose a section</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cadence" className="block text-meta text-muted">
            Write again after (hours)
          </label>
          <input
            id="cadence"
            name="cadence_hours"
            type="number"
            min={1}
            max={8760}
            defaultValue={24}
            className={FIELD}
          />
        </div>
      </div>

      {state && "error" in state && state.error ? (
        <p role="alert" className="text-meta text-signal">{state.error}</p>
      ) : null}
      {state && "done" in state && state.done ? (
        <p className="text-meta text-muted">Topic added.</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add topic"}
      </button>
    </form>
  );
}

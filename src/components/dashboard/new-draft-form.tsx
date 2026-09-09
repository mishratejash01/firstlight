"use client";

import { useActionState } from "react";

import { createDraft } from "@/app/contribute/actions";

/**
 * Start a draft.
 *
 * Asks for the two things that cannot be filled in later without consequence:
 * a headline, which becomes the permanent slug, and a section, which decides
 * where the piece lives. Everything else is written in the editor.
 */
export function NewDraftForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createDraft(formData);
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  return (
    <form action={action} className="border-b border-hairline pb-8">
      <h2 className="font-serif text-section text-ink">Start a draft</h2>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="headline" className="sr-only">Working headline</label>
          <input
            id="headline"
            name="headline"
            required
            placeholder="Working headline"
            className="w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>

        <div className="sm:w-56">
          <label htmlFor="category_id" className="sr-only">Section</label>
          <select
            id="category_id"
            name="category_id"
            required
            defaultValue=""
            className="w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <option value="" disabled>Section</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create"}
        </button>
      </div>

      {state?.error ? (
        <p role="alert" className="mt-3 text-meta text-signal">{state.error}</p>
      ) : null}
    </form>
  );
}

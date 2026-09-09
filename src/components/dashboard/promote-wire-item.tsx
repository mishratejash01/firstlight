"use client";

import { useActionState } from "react";

import { promoteWireItem } from "@/app/desk/wire-actions";

/**
 * Promotes a wire item into a draft.
 *
 * The section selector defaults to whatever the feed's own subject codes mapped
 * to, which is right most of the time and always overridable. Where the feed
 * supplied nothing recognisable, the editor has to choose — the action refuses
 * rather than guessing and filing a story into the wrong section.
 */
export function PromoteWireItem({
  itemId,
  categories,
  suggestedCategoryId,
}: {
  itemId: string;
  categories: { id: string; name: string }[];
  suggestedCategoryId: string | null;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; note?: string } | null, formData: FormData) => {
      const result = await promoteWireItem(formData);
      return "error" in result ? { error: result.error } : { note: result.note };
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="item_id" value={itemId} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`section-${itemId}`} className="sr-only">Section</label>
        <select
          id={`section-${itemId}`}
          name="category_id"
          defaultValue={suggestedCategoryId ?? ""}
          className="rounded-control border border-hairline bg-paper px-2.5 py-1.5 text-meta text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <option value="">Choose a section</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-control border border-accent bg-accent px-3.5 py-1.5 text-meta text-paper hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Promoting…" : "Promote to draft"}
        </button>
      </div>
      {state?.error ? (
        <span role="alert" className="max-w-96 text-meta text-signal">{state.error}</span>
      ) : null}
      {state?.note ? (
        <span className="max-w-96 text-meta text-muted">{state.note}</span>
      ) : null}
    </form>
  );
}

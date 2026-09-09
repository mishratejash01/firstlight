"use client";

import { useActionState } from "react";

import { createWireSource } from "@/app/admin/source-actions";

const FIELD =
  "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Adds a wire source together with its licence terms.
 *
 * Full-text reproduction defaults to off. The safe state for an unread contract
 * is "we may summarise and link", and an editor who needs more has to make that
 * an explicit decision rather than inherit it from a default.
 */
export function WireSourceForm() {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; done?: boolean } | null, formData: FormData) => {
      const result = await createWireSource(formData);
      return "error" in result ? { error: result.error } : { done: true };
    },
    null,
  );

  return (
    <form action={action} className="mt-4 max-w-2xl space-y-4">
      <div>
        <label htmlFor="source-name" className="block text-meta text-muted">
          Source name — appears as the credit on published items
        </label>
        <input id="source-name" name="name" required placeholder="Example News Agency" className={FIELD} />
      </div>

      <div>
        <label htmlFor="source-feed" className="block text-meta text-muted">
          Feed URL — RSS or Atom
        </label>
        <input
          id="source-feed"
          name="feed_url"
          required
          type="url"
          placeholder="https://example.com/feed.xml"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="source-homepage" className="block text-meta text-muted">
          Homepage (optional)
        </label>
        <input id="source-homepage" name="homepage_url" type="url" className={FIELD} />
      </div>

      <div>
        <label htmlFor="source-holder" className="block text-meta text-muted">
          Licence held from (optional)
        </label>
        <input id="source-holder" name="licence_holder" className={FIELD} />
      </div>

      <div>
        <label htmlFor="source-terms" className="block text-meta text-muted">
          Licence terms — what this contract actually permits
        </label>
        <textarea id="source-terms" name="licence_terms" rows={3} className={FIELD} />
      </div>

      <div className="border-l-2 border-hairline pl-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="allow_full_text"
            value="true"
            className="mt-1 h-4 w-4 accent-[#1B3B6F]"
          />
          <span className="text-meta leading-relaxed text-ink">
            This licence permits reproducing full text.
            <span className="mt-1 block text-muted">
              Leave unticked unless the contract says so. While it is off, the
              database rejects any attempt to store body copy from this source —
              summaries and attribution links only.
            </span>
          </span>
        </label>
      </div>

      {state && "error" in state && state.error ? (
        <p role="alert" className="text-meta text-signal">{state.error}</p>
      ) : null}
      {state && "done" in state && state.done ? (
        <p className="text-meta text-muted">Source added. It will be polled on the next run.</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add source"}
      </button>
    </form>
  );
}

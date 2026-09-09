"use client";

import { useActionState, useState } from "react";

import { saveDraft, submitForReview } from "@/app/contribute/actions";

type Article = {
  id: string;
  headline: string;
  standfirst: string | null;
  body: string | null;
  summary: string | null;
  status: string;
  category_id: string;
};

const FIELD =
  "w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Draft editor.
 *
 * Plain fields and a Markdown body. A rich-text editor would mean storing HTML
 * from a browser, which is untrusted input that has to be sanitised on the way
 * out; Markdown rendered through our own restricted renderer cannot carry
 * markup at all. That is a deliberate trade of convenience for a whole class of
 * vulnerability.
 */
export function ArticleEditor({
  article,
  categories,
}: {
  article: Article;
  categories: { id: string; name: string }[];
}) {
  const [saved, setSaved] = useState(false);

  const [saveState, saveAction, saving] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await saveDraft(formData);
      setSaved(!("error" in result));
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  const [submitState, submitAction, submitting] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await submitForReview(formData);
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  return (
    <div className="max-w-3xl">
      <form action={saveAction} onChange={() => setSaved(false)} className="space-y-5">
        <input type="hidden" name="id" value={article.id} />

        <div>
          <label htmlFor="headline" className="block text-meta text-muted">Headline</label>
          <input id="headline" name="headline" required defaultValue={article.headline} className={`mt-1 ${FIELD}`} />
        </div>

        <div>
          <label htmlFor="category_id" className="block text-meta text-muted">Section</label>
          <select id="category_id" name="category_id" defaultValue={article.category_id} className={`mt-1 ${FIELD}`}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="standfirst" className="block text-meta text-muted">
            Standfirst — one line, under the headline
          </label>
          <input id="standfirst" name="standfirst" defaultValue={article.standfirst ?? ""} className={`mt-1 ${FIELD}`} />
        </div>

        <div>
          <label htmlFor="summary" className="block text-meta text-muted">
            Summary — what the desk reads in the queue
          </label>
          <textarea id="summary" name="summary" rows={3} defaultValue={article.summary ?? ""} className={`mt-1 ${FIELD}`} />
        </div>

        <div>
          <label htmlFor="body" className="block text-meta text-muted">
            Body — Markdown. Use ## for the sub-questions readers search for:
            what happened, who is involved, what happens next.
          </label>
          <textarea id="body" name="body" rows={22} defaultValue={article.body ?? ""} className={`mt-1 font-mono text-[0.85rem] ${FIELD}`} />
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-control border border-hairline px-5 py-2.5 text-body text-ink hover:border-muted disabled:text-muted"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          {saved ? <span className="text-meta text-muted">Saved.</span> : null}
          {saveState?.error ? (
            <span role="alert" className="text-meta text-signal">{saveState.error}</span>
          ) : null}
        </div>
      </form>

      {article.status !== "in_review" ? (
        <form action={submitAction} className="mt-8 border-t border-hairline pt-6">
          <input type="hidden" name="id" value={article.id} />
          <p className="text-meta text-muted">
            Submitting hands the piece to the desk. You will not be able to edit
            it afterwards, and an editor decides whether and when it publishes.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="mt-3 rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
          {submitState?.error ? (
            <p role="alert" className="mt-2 text-meta text-signal">{submitState.error}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

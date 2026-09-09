"use client";

import { useActionState, useState } from "react";

import { EditorToolbar } from "./editor-toolbar";
import { HeroImageField } from "./hero-image-field";
import { saveDraft, submitForReview } from "@/app/contribute/actions";
import { renderMarkdown } from "@/lib/format/markdown";

type Article = {
  id: string;
  headline: string;
  standfirst: string | null;
  body: string | null;
  summary: string | null;
  status: string;
  category_id: string;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  hero_image_credit: string | null;
};

const FIELD =
  "w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const BODY_TEXTAREA_ID = "article-body";

/**
 * Draft editor.
 *
 * The body is Markdown with a toolbar, not a rich-text surface. A
 * contenteditable editor stores browser-generated HTML, which is untrusted
 * input the renderer would then have to sanitise correctly forever; Markdown
 * rendered through our own restricted renderer cannot carry markup at all. The
 * toolbar and preview exist so that security decision costs the writer nothing.
 */
export function ArticleEditor({
  article,
  categories,
}: {
  article: Article;
  categories: { id: string; name: string }[];
}) {
  const [saved, setSaved] = useState(false);
  const [body, setBody] = useState(article.body ?? "");
  const [preview, setPreview] = useState(false);

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

  /** Ctrl/Cmd+B and +I, because every writing tool has them. */
  function onBodyKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key !== "b" && key !== "i") return;

    event.preventDefault();
    const el = event.currentTarget;
    const marker = key === "b" ? "**" : "*";
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end) || (key === "b" ? "bold text" : "italic text");

    el.setRangeText(`${marker}${selected}${marker}`, start, end, "end");
    el.setSelectionRange(start + marker.length, start + marker.length + selected.length);
    setBody(el.value);
    setSaved(false);
  }

  return (
    <div className="max-w-3xl">
      <form action={saveAction} onChange={() => setSaved(false)} className="space-y-6">
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

        <div className="border-t border-hairline pt-6">
          <HeroImageField
            initialUrl={article.hero_image_url}
            initialAlt={article.hero_image_alt}
            initialCredit={article.hero_image_credit}
          />
        </div>

        <div className="border-t border-hairline pt-6">
          <label htmlFor="summary" className="block text-meta text-muted">
            Summary — what the desk reads in the queue
          </label>
          <textarea id="summary" name="summary" rows={3} defaultValue={article.summary ?? ""} className={`mt-1 ${FIELD}`} />
        </div>

        <div className="border-t border-hairline pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <label htmlFor={BODY_TEXTAREA_ID} className="text-meta text-muted">
              Body — use headings for the sub-questions readers search for: what
              happened, who is involved, what happens next.
            </label>
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              aria-pressed={preview}
              className="rounded-control border border-hairline px-3 py-1.5 text-meta text-ink hover:border-muted"
            >
              {preview ? "Back to writing" : "Preview"}
            </button>
          </div>

          {preview ? (
            <div className="mt-3 border border-hairline p-5">
              {body.trim() ? (
                <div className="max-w-measure">{renderMarkdown(body)}</div>
              ) : (
                <p className="text-body text-muted">Nothing written yet.</p>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <EditorToolbar textareaId={BODY_TEXTAREA_ID} />
              <textarea
                id={BODY_TEXTAREA_ID}
                name="body"
                rows={24}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={onBodyKeyDown}
                className="w-full border border-hairline bg-paper px-3 py-2.5 font-mono text-[0.85rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>
          )}

          {/* Keeps the value submitted while the preview is showing and the
              textarea is unmounted. */}
          {preview ? <input type="hidden" name="body" value={body} /> : null}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-hairline pt-6">
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
          <p className="max-w-measure text-meta leading-relaxed text-muted">
            Submitting hands the piece to the desk. You will not be able to edit
            it afterwards, and an editor decides whether and when it publishes.
            Save your draft first — submitting does not save unsaved changes.
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

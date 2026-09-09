"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { generateDraft } from "@/app/contribute/ai-actions";

/**
 * Drafts an article from a topic.
 *
 * The warning below is not boilerplate. Asked to write from a topic alone, the
 * model has no documents and no way to check anything, so any name, figure or
 * quotation in the result is plausible rather than sourced. It is required to
 * list those claims, and the editor sees that list on the draft before anything
 * else — but the checking is a person's job and the form says so.
 */
export function AiDraftForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await generateDraft(new FormData(event.currentTarget));
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) router.push(`/contribute/${result.data.id}`);
  }

  const fieldClass =
    "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  if (!open) {
    return (
      <div className="mt-6 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Draft with AI</h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          Give it a topic and it writes a structured first draft — headline,
          standfirst, body, tags, key facts and entities — straight into your
          drafts for you to check and edit.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-control border border-hairline px-4 py-2 text-body text-ink hover:border-muted"
        >
          Start an AI draft
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-hairline pt-6">
      <h2 className="text-section text-ink">Draft with AI</h2>

      <div className="mt-3 border-l-2 border-signal pl-4">
        <p className="text-meta font-semibold text-signal">Everything it writes needs checking</p>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          The model cannot look anything up. Without source material, any name,
          number, date or quotation it produces is invented — convincingly. It
          will list what it could not verify, and that list is attached to the
          draft. Nothing publishes until you publish it.
        </p>
      </div>

      <form onSubmit={submit} className="mt-5 max-w-2xl space-y-4">
        <div>
          <label htmlFor="ai-topic" className="block text-meta text-muted">
            What is the article about?
          </label>
          <textarea
            id="ai-topic"
            name="topic"
            required
            rows={3}
            placeholder="The council has voted to close three libraries to cover a budget shortfall"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="ai-angle" className="block text-meta text-muted">
            Angle or emphasis (optional)
          </label>
          <input
            id="ai-angle"
            name="angle"
            placeholder="Focus on what happens to the staff"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="ai-category" className="block text-meta text-muted">Section</label>
          <select id="ai-category" name="category_id" required defaultValue="" className={fieldClass}>
            <option value="" disabled>Choose a section</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="ai-source" className="block text-meta text-muted">
            Source material (optional, but this is what makes it accurate)
          </label>
          <textarea
            id="ai-source"
            name="source_material"
            rows={8}
            placeholder="Paste a press release, a report, a transcript, or your notes from a call. With this, the model works only from what you give it instead of from memory."
            className={`${fieldClass} font-mono text-[0.8rem]`}
          />
        </div>

        {error ? <p role="alert" className="text-meta text-signal">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Writing…" : "Write the draft"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="rounded-control border border-hairline px-5 py-2.5 text-body text-ink hover:border-muted"
          >
            Cancel
          </button>
          {pending ? (
            <span className="text-meta text-muted">This usually takes 20–40 seconds.</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

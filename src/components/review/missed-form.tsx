"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { submitMissedReview } from "@/app/review/review-actions";

/**
 * One question about a story the engine did not write: should it have?
 * Yes asks how important it was; no needs nothing more.
 */
export function MissedForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const mountedAt = useRef(0);
  const [verdict, setVerdict] = useState<"yes" | "no" | null>(null);
  const [importance, setImportance] = useState<number | null>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | { ok: true } | null, formData: FormData) => {
      formData.set("seconds_spent", String(Math.round((Date.now() - mountedAt.current) / 1000)));
      const result = await submitMissedReview(formData);
      if ("ok" in result) router.refresh();
      return result;
    },
    null,
  );

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const ready = verdict === "no" || (verdict === "yes" && importance !== null);

  const chip = (selected: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        selected
          ? "rounded-control border border-accent px-2.5 py-1 text-meta text-accent"
          : "rounded-control border border-hairline px-2.5 py-1 text-meta text-ink hover:border-muted"
      }
    >
      {label}
    </button>
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="should_have_written" value={verdict ?? ""} />
      <input type="hidden" name="importance" value={importance ?? ""} />
      <span className="text-meta text-muted">Should we have written this?</span>
      {chip(verdict === "yes", "Yes", () => setVerdict("yes"))}
      {chip(verdict === "no", "No", () => setVerdict("no"))}
      {verdict === "yes" ? (
        <span className="flex items-center gap-1.5">
          <span className="ml-2 text-meta text-muted">Importance</span>
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={importance === v}
              onClick={() => setImportance(v)}
              className={
                importance === v
                  ? "h-8 w-8 rounded-full border border-accent bg-accent text-meta text-paper"
                  : "h-8 w-8 rounded-full border border-hairline text-meta text-ink hover:border-muted"
              }
            >
              {v}
            </button>
          ))}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={!ready || pending}
        className="ml-auto rounded-control border border-hairline px-3 py-1 text-meta text-ink hover:border-muted disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state && "error" in state ? <span role="alert" className="basis-full text-meta text-signal">{state.error}</span> : null}
    </form>
  );
}

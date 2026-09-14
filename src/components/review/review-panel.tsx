"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { submitArticleReview } from "@/app/review/review-actions";

/**
 * The review panel: one story, a fixed set of questions, about a minute.
 *
 * Keyboard first. The number keys set whichever scale was touched last
 * (importance to begin with), E O L S set the timing, Enter saves once the
 * three required answers exist. A reviewer who never leaves the keyboard can
 * do a story in twenty seconds; one who prefers the mouse can click
 * everything. Seconds spent are recorded from the moment the panel mounts.
 */

const TIMINGS = [
  { value: "early", label: "Early", key: "E" },
  { value: "on_time", label: "On time", key: "O" },
  { value: "late", label: "Late", key: "L" },
  { value: "stale", label: "Stale", key: "S" },
] as const;

const ISSUES = [
  { value: "wrong_facts", label: "Wrong facts" },
  { value: "missing_context", label: "Missing context" },
  { value: "wrong_picture", label: "Wrong picture" },
  { value: "wrong_section", label: "Wrong section" },
  { value: "duplicate", label: "Duplicate" },
  { value: "weak_headline", label: "Weak headline" },
  { value: "not_news", label: "Not news" },
  { value: "reads_like_pr", label: "Reads like PR" },
  { value: "poor_writing", label: "Poor writing" },
  { value: "too_short", label: "Too short" },
  { value: "too_long", label: "Too long" },
] as const;

const IMPORTANCE_HINTS = ["Should not exist", "Filler", "A solid story", "Lead of its section", "Front page anywhere"];
const QUALITY_HINTS = ["Unusable", "Weak", "Adequate", "Good", "Excellent"];

type Result = { error: string } | { ok: true; note?: string };

export function ReviewPanel({
  articleId,
  eventId,
  sections,
  currentSectionId,
}: {
  articleId: string;
  eventId: string | null;
  sections: { id: string; name: string }[];
  currentSectionId: string | null;
}) {
  const router = useRouter();
  const mountedAt = useRef(0);
  const [importance, setImportance] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const [timing, setTiming] = useState<string | null>(null);
  const [issues, setIssues] = useState<Set<string>>(new Set());
  const [betterSection, setBetterSection] = useState<string>("");
  const [wouldNotRun, setWouldNotRun] = useState(false);
  const [activeScale, setActiveScale] = useState<"importance" | "quality">("importance");
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: Result | null, formData: FormData) => {
      // Measured at submit, not during render: the clock is not part of the view.
      formData.set("seconds_spent", String(Math.round((Date.now() - mountedAt.current) / 1000)));
      formData.set("device", /Mobi|Android/i.test(navigator.userAgent) ? "phone" : "desktop");
      const result = await submitArticleReview(formData);
      if ("ok" in result) router.push("/review/next");
      return result;
    },
    null,
  );

  const complete = importance !== null && quality !== null && timing !== null;

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "SELECT" || target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key >= "1" && event.key <= "5") {
        const value = Number(event.key);
        if (activeScale === "importance") {
          setImportance(value);
          setActiveScale("quality");
        } else {
          setQuality(value);
        }
        event.preventDefault();
        return;
      }
      const upper = event.key.toUpperCase();
      const t = TIMINGS.find((x) => x.key === upper);
      if (t) {
        setTiming(t.value);
        event.preventDefault();
        return;
      }
      if (event.key === "Enter" && complete && !pending) {
        formRef.current?.requestSubmit();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeScale, complete, pending]);

  const toggleIssue = (value: string) => {
    setIssues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      if (value === "wrong_section" && !next.has(value)) setBetterSection("");
      return next;
    });
  };

  const scaleButton = (
    scale: "importance" | "quality",
    value: number,
    current: number | null,
    setter: (v: number) => void,
    hint: string,
  ) => (
    <button
      key={value}
      type="button"
      aria-pressed={current === value}
      title={hint}
      onClick={() => {
        setter(value);
        setActiveScale(scale === "importance" ? "quality" : "quality");
      }}
      className={
        current === value
          ? "h-9 w-9 rounded-full border border-accent bg-accent text-meta text-paper"
          : "h-9 w-9 rounded-full border border-hairline text-meta text-ink hover:border-muted"
      }
    >
      {value}
    </button>
  );

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
    <form
      ref={formRef}
      action={formAction}
      className="sticky bottom-0 mt-10 border-t border-hairline bg-paper pt-4 pb-4"
      aria-label="Review this story"
    >
      <input type="hidden" name="article_id" value={articleId} />
      <input type="hidden" name="event_id" value={eventId ?? ""} />
      <input type="hidden" name="importance" value={importance ?? ""} />
      <input type="hidden" name="quality" value={quality ?? ""} />
      <input type="hidden" name="timing" value={timing ?? ""} />
      {[...issues].map((issue) => (
        <input key={issue} type="hidden" name="issues" value={issue} />
      ))}
      <input type="hidden" name="better_section_id" value={issues.has("wrong_section") ? betterSection : ""} />
      <input type="hidden" name="would_not_run" value={wouldNotRun ? "true" : "false"} />

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr] sm:items-baseline">
        <span className="text-meta text-muted">Importance</span>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5].map((v) => scaleButton("importance", v, importance, setImportance, IMPORTANCE_HINTS[v - 1]))}
          <span className="ml-1 text-meta text-muted">{importance ? IMPORTANCE_HINTS[importance - 1] : "5 is front page anywhere, 1 should not exist"}</span>
        </div>

        <span className="text-meta text-muted">Timing</span>
        <div className="flex flex-wrap gap-2">
          {TIMINGS.map((t) => chip(timing === t.value, t.label, () => setTiming(t.value)))}
        </div>

        <span className="text-meta text-muted">Quality</span>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5].map((v) => scaleButton("quality", v, quality, setQuality, QUALITY_HINTS[v - 1]))}
          <span className="ml-1 text-meta text-muted">{quality ? QUALITY_HINTS[quality - 1] : "writing, accuracy, headline, picture, section"}</span>
        </div>

        <span className="text-meta text-muted">Issues</span>
        <div className="flex flex-wrap gap-2">
          {ISSUES.map((i) => chip(issues.has(i.value), i.label, () => toggleIssue(i.value)))}
          {issues.has("wrong_section") ? (
            <label className="flex items-center gap-2 text-meta text-muted">
              Should be
              <select
                value={betterSection}
                onChange={(e) => setBetterSection(e.target.value)}
                className="rounded-control border border-hairline bg-paper px-2 py-1 text-meta text-ink"
              >
                <option value="">choose a section</option>
                {sections.filter((s) => s.id !== currentSectionId).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <span className="text-meta text-muted">Would not run</span>
        <div className="flex flex-wrap items-center gap-2">
          {chip(wouldNotRun, wouldNotRun ? "Yes, this should not have been published" : "No", () => setWouldNotRun((v) => !v))}
          <span className="text-meta text-muted">Use rarely. It counts three times.</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-meta text-muted">Keys: 1 to 5 sets importance then quality, E O L S set timing, Enter saves</span>
        <div className="flex items-center gap-3">
          {state && "error" in state ? <span role="alert" className="text-meta text-signal">{state.error}</span> : null}
          <button
            type="submit"
            disabled={!complete || pending}
            className="rounded-control border border-accent bg-accent px-4 py-2 text-body text-paper hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save and next"}
          </button>
        </div>
      </div>
    </form>
  );
}

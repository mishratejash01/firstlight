"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import type { DialogueQuestion } from "@/lib/ai/steer";
import type { DialogueReply, EngineTurn } from "@/app/admin/steer-actions";

/**
 * The dialogue in which the engine makes sure it has understood.
 *
 * It cannot be dismissed while the engine still has questions: an
 * instruction half-settled is worse than none, because the engine would act
 * on its own guess. The one way out before the engine is satisfied is to
 * discard the whole thing, and that asks twice. Once the engine has said
 * what it will do, the dialogue shows that in the engine's words, and the
 * administrator can close it or send a correction, which reopens it.
 *
 * Rendered through a portal into document.body so it sits above everything
 * and inside no other form.
 */
export function SteerDialog({
  title,
  initial,
  onAnswer,
  onDiscard,
  onClose,
  doneTitle,
  doneDetail,
}: {
  title: string;
  initial: EngineTurn;
  onAnswer: (payload: { answers: { questionId: string; question: string; answer: string }[]; note: string }) => Promise<DialogueReply>;
  onDiscard: () => Promise<unknown>;
  onClose: () => void;
  doneTitle: string;
  doneDetail: string;
}) {
  const [turn, setTurn] = useState<EngineTurn>(initial);
  const [history, setHistory] = useState<{ question: string; answer: string }[]>([]);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [pending, setPending] = useState(false);
  const [discarding, setDiscarding] = useState<"no" | "asked" | "yes">("no");
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, [turn]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && turn.satisfied && !correcting && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [turn.satisfied, correcting, pending, onClose]);

  const fieldClass =
    "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  function answerFor(question: DialogueQuestion): string {
    if (question.type === "text") return (typed[question.id] ?? "").trim();
    const picked = chosen[question.id] ?? [];
    const extra = (typed[question.id] ?? "").trim();
    return [...picked, extra ? `Also: ${extra}` : ""].filter(Boolean).join("; ");
  }

  const unanswered = turn.questions.filter((q) => !answerFor(q));

  async function send(payload: { answers: { questionId: string; question: string; answer: string }[]; note: string }) {
    setPending(true);
    setError(null);
    try {
      const reply = await onAnswer(payload);
      if (!reply.ok) {
        setError(reply.error);
        return;
      }
      setHistory((h) => [...h, ...payload.answers.map((a) => ({ question: a.question, answer: a.answer })), ...(payload.note ? [{ question: "Added", answer: payload.note }] : [])]);
      setTurn(reply.turn);
      setChosen({});
      setTyped({});
      setNote("");
      setCorrecting(false);
    } catch (cause) {
      setError(cause instanceof Error ? `That did not go through: ${cause.message}` : "That did not go through. Try again.");
    } finally {
      setPending(false);
    }
  }

  function submitAnswers() {
    if (unanswered.length) {
      setError(unanswered.length === 1 ? "One question is still unanswered." : `${unanswered.length} questions are still unanswered.`);
      return;
    }
    void send({
      answers: turn.questions.map((q) => ({ questionId: q.id, question: q.text, answer: answerFor(q) })),
      note: note.trim(),
    });
  }

  function submitCorrection() {
    if (!note.trim()) {
      setError("Say what should change.");
      return;
    }
    void send({ answers: [], note: note.trim() });
  }

  async function discard() {
    setDiscarding("yes");
    try {
      await onDiscard();
      onClose();
    } catch {
      setDiscarding("no");
      setError("Could not discard it. Try again.");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="steer-heading"
        tabIndex={-1}
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto border border-hairline bg-paper p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="steer-heading" className="text-section text-ink">
            {turn.satisfied && !correcting ? doneTitle : title}
          </h2>
          {!turn.satisfied ? (
            <span className="text-meta text-muted">
              Round {turn.round} of {turn.maxRounds}
            </span>
          ) : null}
        </div>

        {history.length ? (
          <dl className="mt-4 border-l-2 border-hairline pl-4">
            {history.map((item, index) => (
              <div key={index} className={index ? "mt-2" : ""}>
                <dt className="text-meta text-muted">{item.question}</dt>
                <dd className="text-meta text-ink">{item.answer}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {turn.satisfied && !correcting ? (
          <div className="mt-5">
            <p className="max-w-measure text-meta leading-relaxed text-muted">{doneDetail}</p>
            <p className="mt-4 max-w-measure text-body leading-relaxed text-ink">{turn.understanding}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  setCorrecting(true);
                  setError(null);
                }}
                className="rounded-control border border-hairline px-5 py-2.5 text-body text-ink hover:border-muted"
              >
                That is not quite right
              </button>
            </div>
          </div>
        ) : null}

        {turn.satisfied && correcting ? (
          <div className="mt-5">
            <p className="max-w-measure text-body leading-relaxed text-ink">{turn.understanding}</p>
            <label htmlFor="steer-correction" className="mt-5 block text-meta text-muted">
              What should change?
            </label>
            <textarea
              id="steer-correction"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={pending}
              className={fieldClass}
            />
            {error ? (
              <p role="alert" className="mt-2 text-meta text-signal">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={submitCorrection}
                disabled={pending}
                className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send the correction"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCorrecting(false);
                  setNote("");
                  setError(null);
                }}
                disabled={pending}
                className="rounded-control border border-hairline px-5 py-2.5 text-body text-ink hover:border-muted disabled:opacity-60"
              >
                Keep it as it is
              </button>
              {pending ? <span className="text-meta text-muted">The engine is reading it…</span> : null}
            </div>
          </div>
        ) : null}

        {!turn.satisfied ? (
          <div className="mt-5 space-y-6">
            {turn.questions.map((question, index) => (
              <fieldset key={question.id} disabled={pending}>
                <legend className="text-body text-ink">
                  {index + 1}. {question.text}
                </legend>
                {question.why ? <p className="mt-0.5 text-meta text-muted">{question.why}</p> : null}

                {question.type === "text" ? (
                  <textarea
                    rows={3}
                    value={typed[question.id] ?? ""}
                    onChange={(event) => setTyped({ ...typed, [question.id]: event.target.value })}
                    className={fieldClass}
                  />
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {question.options.map((option) => {
                      const picked = (chosen[question.id] ?? []).includes(option);
                      return (
                        <label key={option} className="flex cursor-pointer items-start gap-2 text-body text-ink">
                          <input
                            type={question.type === "single" ? "radio" : "checkbox"}
                            name={`q-${question.id}`}
                            checked={picked}
                            onChange={() =>
                              setChosen({
                                ...chosen,
                                [question.id]:
                                  question.type === "single"
                                    ? [option]
                                    : picked
                                      ? (chosen[question.id] ?? []).filter((o) => o !== option)
                                      : [...(chosen[question.id] ?? []), option],
                              })
                            }
                            className="mt-1 accent-accent"
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                    <input
                      value={typed[question.id] ?? ""}
                      onChange={(event) => setTyped({ ...typed, [question.id]: event.target.value })}
                      placeholder="Anything to add to this answer (optional)"
                      className={fieldClass}
                    />
                  </div>
                )}
              </fieldset>
            ))}

            <div>
              <label htmlFor="steer-note" className="block text-meta text-muted">
                Anything else the engine should know (optional)
              </label>
              <textarea
                id="steer-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={pending}
                className={fieldClass}
              />
            </div>

            {error ? (
              <p role="alert" className="text-meta text-signal">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={submitAnswers}
                disabled={pending}
                className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send the answers"}
              </button>
              {pending ? <span className="text-meta text-muted">The engine is reading them…</span> : null}
            </div>

            <p className="border-t border-hairline pt-4 text-meta text-muted">
              This stays open until the engine is sure it has understood.{" "}
              {discarding === "no" ? (
                <button
                  type="button"
                  onClick={() => setDiscarding("asked")}
                  disabled={pending}
                  className="text-accent underline underline-offset-4 disabled:text-muted"
                >
                  Discard it instead
                </button>
              ) : discarding === "asked" ? (
                <>
                  Discard it, and the engine forgets this entirely?{" "}
                  <button type="button" onClick={discard} className="text-signal underline underline-offset-4">
                    Yes, discard
                  </button>{" "}
                  ·{" "}
                  <button type="button" onClick={() => setDiscarding("no")} className="text-accent underline underline-offset-4">
                    No, keep going
                  </button>
                </>
              ) : (
                "Discarding…"
              )}
            </p>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

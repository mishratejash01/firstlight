import type { TranscriptTurn } from "@/lib/ai/steer";
import { formatDateTime } from "@/lib/format/datetime";

/** The stored dialogue, or nothing if the column holds something else. */
export function readTranscript(raw: unknown): TranscriptTurn[] {
  return Array.isArray(raw)
    ? (raw as TranscriptTurn[]).filter((turn) => turn && (turn.role === "engine" || turn.role === "admin"))
    : [];
}

/**
 * A settled dialogue, read back: each round's questions with the answers
 * given, the notes added, and the engine's statement when it was satisfied.
 * This is the record of why an instruction says what it says.
 */
export function SteerTranscript({ transcript }: { transcript: TranscriptTurn[] }) {
  const rounds: { engine: Extract<TranscriptTurn, { role: "engine" }>; reply: Extract<TranscriptTurn, { role: "admin" }> | null }[] = [];
  for (let i = 0; i < transcript.length; i += 1) {
    const turn = transcript[i];
    if (turn.role !== "engine") continue;
    const next = transcript[i + 1];
    rounds.push({ engine: turn, reply: next && next.role === "admin" ? next : null });
  }

  if (!rounds.length) return <p className="mt-2 text-meta text-muted">No dialogue was recorded.</p>;

  return (
    <ol className="mt-3 space-y-4">
      {rounds.map((round, index) => (
        <li key={index} className="border-l-2 border-hairline pl-4">
          <p className="text-meta text-muted">
            Round {index + 1} · {formatDateTime(round.engine.at)}
          </p>
          {round.engine.satisfied ? (
            <p className="mt-1 max-w-measure text-body leading-relaxed text-ink">
              <span className="text-muted">The engine was satisfied and wrote: </span>
              {round.engine.understanding}
            </p>
          ) : (
            <ul className="mt-1 space-y-2">
              {round.engine.questions.map((question) => {
                const answer = round.reply?.answers.find((a) => a.questionId === question.id)?.answer;
                return (
                  <li key={question.id}>
                    <p className="max-w-measure text-body text-ink">{question.text}</p>
                    {question.options.length ? (
                      <p className="max-w-measure text-meta text-muted">Options: {question.options.join(" · ")}</p>
                    ) : null}
                    <p className="max-w-measure text-meta text-ink">
                      <span className="text-muted">Answer: </span>
                      {answer ?? "—"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          {round.reply?.note ? (
            <p className="mt-2 max-w-measure text-meta text-ink">
              <span className="text-muted">{round.engine.satisfied ? "Correction sent: " : "Added: "}</span>
              {round.reply.note}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

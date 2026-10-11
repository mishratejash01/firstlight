"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { answerDirective, discardDirective, startDirective, type EngineTurn } from "@/app/admin/steer-actions";

import { SteerDialog } from "./steer-dialog";

const TTLS = [
  { value: "24h", label: "24 hours" },
  { value: "48h", label: "48 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Until I remove it" },
];

/**
 * Gives the engine a standing instruction.
 *
 * The instruction is written in plain words and given a life. Sending it
 * opens the dialogue: the engine asks about anything unclear and the
 * instruction takes effect only once it has said what it will do.
 */
export function SteerNewInstruction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<{ id: string; turn: EngineTurn } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = event.currentTarget;
    try {
      const result = await startDirective(new FormData(form));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setDialogue({ id: result.id, turn: result.turn });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not go through. Try again.");
    } finally {
      setPending(false);
    }
  }

  const fieldClass =
    "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <>
      <form onSubmit={submit} className="mt-5 max-w-2xl space-y-4">
        <div>
          <label htmlFor="steer-prompt" className="block text-meta text-muted">
            What should the engine do?
          </label>
          <textarea
            id="steer-prompt"
            name="prompt"
            required
            rows={4}
            placeholder="For the next two days, cover only the Bihar assembly election — results, reactions, the new government. Nothing else."
            className={fieldClass}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="steer-ttl" className="block text-meta text-muted">
              For how long
            </label>
            <select id="steer-ttl" name="ttl" defaultValue="24h" className={fieldClass}>
              {TTLS.map((ttl) => (
                <option key={ttl.value} value={ttl.value}>
                  {ttl.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "The engine is reading it…" : "Ask the engine"}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-meta text-signal">
            {error}
          </p>
        ) : null}
        <p className="max-w-measure text-meta leading-relaxed text-muted">
          The engine will ask about anything it is not sure of before the instruction takes effect. When
          the time is up, or you remove it, the engine goes back to normal as if it had never been given.
        </p>
      </form>

      {dialogue ? (
        <SteerDialog
          title="Settling the instruction"
          initial={dialogue.turn}
          onAnswer={(payload) => answerDirective({ id: dialogue.id, ...payload })}
          onDiscard={() => discardDirective(dialogue.id)}
          onClose={() => {
            setDialogue(null);
            router.refresh();
          }}
          doneTitle="Instructions noted."
          doneDetail="The instruction is in force from now. This is what the engine understood, in its own words; it is what every triage and writing decision will follow until the instruction ends."
        />
      ) : null}
    </>
  );
}

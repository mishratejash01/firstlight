"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  answerCommission,
  answerDirective,
  discardCommission,
  discardDirective,
  resumeCommission,
  resumeDirective,
  type EngineTurn,
} from "@/app/admin/steer-actions";

import { SteerDialog } from "./steer-dialog";

/**
 * Reopens a dialogue that did not finish, from the engine's last questions.
 *
 * Every turn is saved as it happens, so a dialogue survives a closed tab, a
 * dropped connection or a deploy; this is the way back into it.
 */
export function ResumeDialogueButton({ kind, id }: { kind: "directive" | "commission"; id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turn, setTurn] = useState<EngineTurn | null>(null);

  async function resume() {
    setPending(true);
    setError(null);
    try {
      const result = kind === "directive" ? await resumeDirective(id) : await resumeCommission(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTurn(result.turn);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reopen it. Reload the page and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <span className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={resume}
          disabled={pending}
          className="rounded-control border border-accent bg-accent px-3.5 py-1.5 text-meta text-paper hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Opening…" : "Resume"}
        </button>
        {error ? (
          <span role="alert" className="text-meta text-signal">
            {error}
          </span>
        ) : null}
      </span>

      {turn ? (
        <SteerDialog
          title={kind === "directive" ? "Settling the instruction" : "Settling the brief"}
          initial={turn}
          onAnswer={(payload) =>
            kind === "directive" ? answerDirective({ id, ...payload }) : answerCommission({ id, ...payload })
          }
          onDiscard={() => (kind === "directive" ? discardDirective(id) : discardCommission(id))}
          onClose={() => {
            setTurn(null);
            router.refresh();
          }}
          doneTitle={kind === "directive" ? "Instructions noted." : "Brief noted."}
          doneDetail={
            kind === "directive"
              ? "The instruction is in force from now. This is what the engine understood, in its own words; it is what every triage and writing decision will follow until the instruction ends."
              : "The story is queued. The desk writes it on its next pass, within about two minutes, or press 'Write it now' in the list. This is what the engine understood, in its own words."
          }
        />
      ) : null}
    </>
  );
}

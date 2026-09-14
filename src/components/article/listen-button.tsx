"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { AmbientPad } from "@/lib/audio/ambient-pad";
import {
  NO_VOICES,
  hasSpeech,
  pickVoice,
  readSupported,
  readVoices,
  subscribeNothing,
  subscribeVoices,
  toUtterances,
} from "@/lib/audio/speech";

/**
 * Read the story aloud, in the paper's one voice.
 *
 * Uses the browser's own speech engine, so it costs nothing and sends nothing
 * anywhere: the words already on the page are spoken by the device. The voice
 * is fixed: Google UK English Male, the British voice Chrome ships. There is
 * no picker and nothing to remember; a paper reads in one voice.
 *
 * Not every device has that voice — no iPhone does, and Firefox and Edge use
 * their own engines — so where it is missing the nearest British male voice
 * stands in, chosen silently. Hiding the button on every phone would serve
 * nobody.
 *
 * The text is spoken one sentence at a time. That is what makes the pauses
 * land where a newsreader's would, and it also sidesteps a long-standing
 * Chrome habit of falling silent partway through a single long utterance.
 *
 * The voice, the engine and the sentence splitter live in lib/audio/speech so
 * the bulletin reads in the same voice as the article page; the reasoning
 * behind the fallback order is recorded there.
 *
 * Under the voice, a quiet synthesised bed (see ambient-pad.ts) fades in
 * while reading and out when it pauses or stops. It sits far below speech and
 * is there to make listening feel settled, not to be listened to.
 *
 * Rendered only when the engine exists. A button that does nothing is worse
 * than no button, so on a browser without speech it is not there.
 */

type Status = "idle" | "playing" | "paused";

export function ListenButton({
  headline,
  standfirst,
  blocks,
  minutes,
}: {
  headline: string;
  standfirst: string | null;
  blocks: string[];
  minutes: number;
}) {
  const supported = useSyncExternalStore(subscribeNothing, readSupported, () => false);
  const voices = useSyncExternalStore(subscribeVoices, readVoices, () => NO_VOICES);

  const [status, setStatus] = useState<Status>("idle");
  const [position, setPosition] = useState(0);

  const positionRef = useRef(0);
  const statusRef = useRef<Status>("idle");
  const padRef = useRef<AmbientPad | null>(null);

  const pieces = useMemo(
    () => toUtterances([headline, ...(standfirst ? [standfirst] : []), ...blocks]),
    [headline, standfirst, blocks],
  );

  const voice = useMemo(() => pickVoice(voices), [voices]);

  // Leaving the page must not leave the voice talking or the bed playing.
  useEffect(() => {
    return () => {
      if (hasSpeech()) window.speechSynthesis.cancel();
      padRef.current?.dispose();
      padRef.current = null;
    };
  }, []);

  const bedOn = () => {
    if (!padRef.current) padRef.current = new AmbientPad();
    void padRef.current.start();
  };
  const bedOff = () => padRef.current?.stop();

  function speakFrom(index: number, withVoice: SpeechSynthesisVoice | null) {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (index >= pieces.length) {
      statusRef.current = "idle";
      setStatus("idle");
      positionRef.current = 0;
      setPosition(0);
      bedOff();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(pieces[index]);
    if (withVoice) {
      utterance.voice = withVoice;
      utterance.lang = withVoice.lang;
    }
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      if (statusRef.current !== "playing") return;
      positionRef.current = index + 1;
      setPosition(index + 1);
      speakFrom(index + 1, withVoice);
    };
    utterance.onerror = (event) => {
      // "interrupted" and "canceled" are our own doing; anything else ends the reading.
      if (event.error === "interrupted" || event.error === "canceled") return;
      statusRef.current = "idle";
      setStatus("idle");
      bedOff();
    };
    synth.speak(utterance);
  }

  const play = () => {
    statusRef.current = "playing";
    setStatus("playing");
    bedOn();
    speakFrom(positionRef.current, voice);
  };

  // Pause keeps the place; resume restarts the current sentence rather than
  // trusting the engine's own resume, which some browsers drop after a while.
  const pause = () => {
    statusRef.current = "paused";
    setStatus("paused");
    window.speechSynthesis.cancel();
    bedOff();
  };

  const stop = () => {
    statusRef.current = "idle";
    setStatus("idle");
    positionRef.current = 0;
    setPosition(0);
    window.speechSynthesis.cancel();
    bedOff();
  };

  if (!supported || !pieces.length) return null;

  const progress = pieces.length ? Math.round((position / pieces.length) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-meta">
      {status === "playing" ? (
        <button
          type="button"
          onClick={pause}
          className="rounded-control border border-hairline px-3 py-1 text-ink hover:border-muted"
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          onClick={play}
          aria-label={status === "paused" ? "Resume reading aloud" : "Listen to this story"}
          className="rounded-control border border-hairline px-3 py-1 text-ink hover:border-muted"
        >
          {status === "paused" ? "Resume" : `Listen · ${minutes} min`}
        </button>
      )}

      {status !== "idle" ? (
        <>
          <button type="button" onClick={stop} className="text-muted hover:text-accent">
            Stop
          </button>
          <span className="text-muted" aria-live="polite">
            {progress}%
          </span>
        </>
      ) : null}

    </div>
  );
}

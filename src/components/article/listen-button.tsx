"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

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
 * Rendered only when the engine exists. A button that does nothing is worse
 * than no button, so on a browser without speech it is not there.
 */

type Status = "idle" | "playing" | "paused";

const WANTED_VOICE = "Google UK English Male";

/**
 * The stand-ins, in order, for devices without the wanted voice. Each is a
 * British male voice from that platform's own engine: Edge's neural Ryan,
 * Apple's Daniel, and Android's Google voices whose ids mark the male
 * variants. Then any British voice, then any English one.
 */
const FALLBACK_ORDER: ((v: SpeechSynthesisVoice) => boolean)[] = [
  (v) => v.name === WANTED_VOICE,
  (v) => /Ryan/i.test(v.name) && isBritish(v),
  (v) => /^Daniel/i.test(v.name) && isBritish(v),
  (v) => isBritish(v) && /gbb|gbd|rjs/i.test(v.voiceURI),
  (v) => isBritish(v) && /male/i.test(v.name) && !/female/i.test(v.name),
  (v) => isBritish(v),
  (v) => v.lang.toLowerCase().startsWith("en"),
];

function isBritish(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.replace("_", "-").toLowerCase() === "en-gb";
}

/** The wanted voice, else the first stand-in the device has; network voices before local. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const matches of FALLBACK_ORDER) {
    const candidates = voices.filter(matches);
    if (candidates.length) {
      return candidates.find((v) => !v.localService) ?? candidates[0];
    }
  }
  return null;
}

/* The engine as an external store. Chrome delivers its voice list after a
   voiceschanged event rather than on first ask, so the component subscribes
   to that and re-reads. The snapshot is cached by content so React sees the
   same array until the list actually changes. */
const NO_VOICES: SpeechSynthesisVoice[] = [];
let cachedKey = "";
let cachedVoices: SpeechSynthesisVoice[] = NO_VOICES;

function hasSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function subscribeVoices(onChange: () => void): () => void {
  if (!hasSpeech()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}

function readVoices(): SpeechSynthesisVoice[] {
  if (!hasSpeech()) return NO_VOICES;
  const list = window.speechSynthesis.getVoices();
  const key = list.map((v) => v.voiceURI).join("|");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedVoices = list;
  }
  return cachedVoices;
}

function readSupported(): boolean {
  return hasSpeech();
}

function subscribeNothing(): () => void {
  return () => {};
}

/** Sentence-sized pieces, so pauses fall at full stops and no piece runs long. */
function toUtterances(blocks: string[]): string[] {
  const pieces: string[] = [];
  for (const block of blocks) {
    const sentences = block.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [block];
    let current = "";
    for (const sentence of sentences) {
      const next = `${current} ${sentence}`.trim();
      if (current && next.length > 220) {
        pieces.push(current);
        current = sentence.trim();
      } else {
        current = next;
      }
    }
    if (current) pieces.push(current);
  }
  return pieces;
}

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

  const pieces = useMemo(
    () => toUtterances([headline, ...(standfirst ? [standfirst] : []), ...blocks]),
    [headline, standfirst, blocks],
  );

  const voice = useMemo(() => pickVoice(voices), [voices]);

  // Leaving the page must not leave the voice talking.
  useEffect(() => {
    return () => {
      if (hasSpeech()) window.speechSynthesis.cancel();
    };
  }, []);

  function speakFrom(index: number, withVoice: SpeechSynthesisVoice | null) {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (index >= pieces.length) {
      statusRef.current = "idle";
      setStatus("idle");
      positionRef.current = 0;
      setPosition(0);
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
    };
    synth.speak(utterance);
  }

  const play = () => {
    statusRef.current = "playing";
    setStatus("playing");
    speakFrom(positionRef.current, voice);
  };

  // Pause keeps the place; resume restarts the current sentence rather than
  // trusting the engine's own resume, which some browsers drop after a while.
  const pause = () => {
    statusRef.current = "paused";
    setStatus("paused");
    window.speechSynthesis.cancel();
  };

  const stop = () => {
    statusRef.current = "idle";
    setStatus("idle");
    positionRef.current = 0;
    setPosition(0);
    window.speechSynthesis.cancel();
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

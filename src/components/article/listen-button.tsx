"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/**
 * Read the story aloud, with the best voice the reader's device has.
 *
 * Uses the browser's own speech engine, so it costs nothing and sends nothing
 * anywhere: the words already on the page are spoken by the device. Quality
 * therefore depends on the device, and the one thing this component can do
 * about that is choose well. Every voice is scored: English first, Indian
 * then British then American; the neural and network voices that Edge,
 * Chrome, Apple and Android ship are ranked above the older compact ones by
 * name and by the fact that they are not local. The reader can override the
 * choice, and the override is remembered on that device.
 *
 * The text is spoken one sentence at a time. That is what makes the pauses
 * land where a newsreader's would, and it also sidesteps a long-standing
 * Chrome habit of falling silent partway through a single long utterance.
 *
 * Rendered only when the engine exists. A button that does nothing is worse
 * than no button, so on a browser without speech it is not there.
 */

type Status = "idle" | "playing" | "paused";

const STORAGE_KEY = "india-front:voice";

/** Language preference, most wanted first. */
const LANGUAGE_ORDER = ["en-IN", "en-GB", "en-US", "en-AU", "en-IE", "en-NZ", "en-ZA", "en"];

/** Names that mark the higher-quality engines each vendor ships. */
const QUALITY_MARKS = [/natural/i, /neural/i, /online/i, /premium/i, /enhanced/i, /google/i, /siri/i];
/** Names that mark the low-quality fallbacks. */
const POOR_MARKS = [/compact/i, /espeak/i, /novelty/i, /whisper/i, /bad news/i, /bells/i, /zarvox/i];

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.replace("_", "-");
  const langIndex = LANGUAGE_ORDER.findIndex(
    (wanted) => lang === wanted || (wanted === "en" && lang.startsWith("en")),
  );
  if (langIndex === -1) return -1;

  let score = (LANGUAGE_ORDER.length - langIndex) * 10;
  if (QUALITY_MARKS.some((mark) => mark.test(voice.name))) score += 25;
  if (POOR_MARKS.some((mark) => mark.test(voice.name))) score -= 40;
  // Network voices are the vendors' better ones on every platform that has them.
  if (!voice.localService) score += 8;
  if (voice.default) score += 2;
  return score;
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
    cachedVoices = list
      .filter((v) => scoreVoice(v) >= 0)
      .sort((a, b) => scoreVoice(b) - scoreVoice(a));
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

function rememberedVoice(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
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
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [position, setPosition] = useState(0);

  const positionRef = useRef(0);
  const statusRef = useRef<Status>("idle");

  const pieces = useMemo(
    () => toUtterances([headline, ...(standfirst ? [standfirst] : []), ...blocks]),
    [headline, standfirst, blocks],
  );

  const voice = useMemo(() => {
    if (!voices.length) return null;
    const wanted = chosenName ?? rememberedVoice();
    return voices.find((v) => v.name === wanted) ?? voices[0];
  }, [voices, chosenName]);

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

  const changeVoice = (name: string) => {
    setChosenName(name);
    try {
      window.localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // Remembering the choice is a convenience, not a requirement.
    }
    if (statusRef.current === "playing") {
      const next = voices.find((v) => v.name === name) ?? null;
      speakFrom(positionRef.current, next);
    }
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

      {voices.length > 1 ? (
        <label className="text-muted">
          <span className="sr-only">Voice</span>
          <select
            value={voice?.name ?? ""}
            onChange={(event) => changeVoice(event.target.value)}
            className="max-w-[14rem] rounded-control border border-hairline bg-paper px-2 py-1 text-meta text-muted"
          >
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name.replace(/^Microsoft\s+/, "").replace(/\s+Online\s*\(Natural\)/i, "")} ({v.lang})
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

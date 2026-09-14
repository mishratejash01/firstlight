"use client";

import Link from "next/link";
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
import type { BulletinLine } from "@/lib/bulletin/script";

/**
 * The spoken bulletin: the running order, read in the paper's voice.
 *
 * The same engine as the article's Listen button — the device's own speech
 * synthesis, costing nothing and sending nothing anywhere — pointed at several
 * stories instead of one. See lib/audio/speech for the voice.
 *
 * The running order is on the page as well as in the ear, and the line being
 * spoken is marked as it goes. That is not decoration: it is what lets a
 * listener see what is coming, skip to the story they want, and read the one
 * they just missed. It is also the whole bulletin in text for anyone who cannot
 * play audio at all, which is the accessible floor this feature has to clear
 * before the audio is worth anything.
 *
 * Each line is one story, so skipping forward moves a story rather than a
 * sentence. Within a line the text is still spoken sentence by sentence, which
 * is what keeps the pauses where a newsreader would put them and sidesteps
 * Chrome falling silent partway through a long utterance.
 */

type Status = "idle" | "playing" | "paused";

export function BulletinPlayer({ lines }: { lines: BulletinLine[] }) {
  const supported = useSyncExternalStore(
    subscribeNothing,
    readSupported,
    () => false,
  );
  const voices = useSyncExternalStore(subscribeVoices, readVoices, () => NO_VOICES);
  const voice = useMemo(() => pickVoice(voices), [voices]);

  const [status, setStatus] = useState<Status>("idle");
  const [lineIndex, setLineIndex] = useState(0);

  const statusRef = useRef<Status>("idle");
  const lineRef = useRef(0);
  const padRef = useRef<AmbientPad | null>(null);

  // Each line split into speakable pieces once, not on every render.
  const pieces = useMemo(
    () => lines.map((line) => toUtterances([line.text])),
    [lines],
  );

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

  /** Speak piece `piece` of line `line`, then whatever follows it. */
  function speak(line: number, piece: number) {
    const synth = window.speechSynthesis;
    synth.cancel();

    if (line >= lines.length) {
      finish();
      return;
    }
    if (piece >= pieces[line].length) {
      lineRef.current = line + 1;
      setLineIndex(line + 1);
      speak(line + 1, 0);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(pieces[line][piece]);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      if (statusRef.current !== "playing") return;
      speak(line, piece + 1);
    };
    utterance.onerror = (event) => {
      // "interrupted" and "canceled" are our own doing; anything else ends it.
      if (event.error === "interrupted" || event.error === "canceled") return;
      finish();
    };
    synth.speak(utterance);
  }

  function finish() {
    statusRef.current = "idle";
    setStatus("idle");
    lineRef.current = 0;
    setLineIndex(0);
    bedOff();
  }

  const play = (from = lineRef.current) => {
    lineRef.current = from;
    setLineIndex(from);
    statusRef.current = "playing";
    setStatus("playing");
    bedOn();
    speak(from, 0);
  };

  // Pause keeps the place but drops back to the start of the current line;
  // resuming mid-sentence is what browsers handle least reliably, and a
  // newsreader picking a story up from its first word sounds deliberate.
  const pause = () => {
    statusRef.current = "paused";
    setStatus("paused");
    window.speechSynthesis.cancel();
    bedOff();
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    finish();
  };

  const jump = (to: number) => {
    const target = Math.max(0, Math.min(lines.length - 1, to));
    if (statusRef.current === "playing") play(target);
    else {
      lineRef.current = target;
      setLineIndex(target);
    }
  };

  if (!lines.length) return null;

  return (
    <div>
      {supported ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-panel bg-wash px-4 py-3">
          <button
            type="button"
            onClick={() => (status === "playing" ? pause() : play())}
            className="rounded-control bg-signal px-4 py-2 font-label text-body font-semibold text-paper hover:opacity-90"
          >
            {status === "playing"
              ? "Pause"
              : status === "paused"
                ? "Resume"
                : "Play bulletin"}
          </button>

          <button
            type="button"
            onClick={() => jump(lineIndex - 1)}
            disabled={lineIndex === 0}
            className="rounded-control border border-hairline bg-paper px-3 py-2 text-meta text-ink hover:text-accent disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => jump(lineIndex + 1)}
            disabled={lineIndex >= lines.length - 1}
            className="rounded-control border border-hairline bg-paper px-3 py-2 text-meta text-ink hover:text-accent disabled:opacity-40"
          >
            Next
          </button>

          {status !== "idle" ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-control border border-hairline bg-paper px-3 py-2 text-meta text-ink hover:text-accent"
            >
              Stop
            </button>
          ) : null}

          <span className="ms-auto text-meta tabular-nums text-muted">
            {lineIndex + 1}/{lines.length}
          </span>
        </div>
      ) : (
        // A button that does nothing is worse than no button. The running order
        // below is the bulletin either way, so nothing is lost but the audio.
        <p className="rounded-panel bg-wash px-4 py-3 text-meta text-muted">
          This browser has no speech engine, so the bulletin cannot be read
          aloud here. The full running order is below.
        </p>
      )}

      <ol className="mt-6">
        {lines.map((line, index) => {
          const current = index === lineIndex && status !== "idle";
          return (
            <li
              key={index}
              aria-current={current ? "true" : undefined}
              className={`border-b border-hairline py-4 ${
                current ? "border-s-2 border-s-signal ps-4" : ""
              }`}
            >
              <div className="flex items-baseline gap-4">
                <span className="w-6 shrink-0 text-meta tabular-nums text-muted">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-body leading-relaxed ${
                      current ? "text-ink" : "text-ink"
                    }`}
                  >
                    {line.text}
                  </p>
                  {line.article ? (
                    <Link
                      href={`/${line.article.categories.slug}/${line.article.slug}`}
                      className="mt-1.5 inline-block text-meta text-accent underline-offset-4 hover:underline"
                    >
                      Read the full story
                    </Link>
                  ) : null}
                </div>
                {supported ? (
                  <button
                    type="button"
                    onClick={() => jump(index)}
                    className="shrink-0 text-meta text-muted hover:text-accent"
                  >
                    {/* Jumping while stopped only moves the place; the label
                        says what happens either way. */}
                    Play from here
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

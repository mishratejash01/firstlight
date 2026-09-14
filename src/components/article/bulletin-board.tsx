"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  NO_VOICES,
  hasSpeech,
  pickVoice,
  readSupported,
  readVoices,
  subscribeNothing,
  subscribeVoices,
} from "@/lib/audio/speech";

/**
 * The bulletin board: the day's headlines, one at a time, on the paper's red.
 *
 * One line, one story, then the next — the rhythm of a broadcast strap rather
 * than a page of links. Fifty of them is a full round of the day's news; at a
 * few seconds each it is several minutes of reading, which is the point. It is
 * something to leave running.
 *
 * It rotates silently on its own and speaks only when asked, and that split is
 * forced rather than chosen: every browser blocks speech synthesis until the
 * reader has interacted with the page, so a board that tried to talk on arrival
 * would simply be mute, with no way to tell the reader why. Silent rotation on
 * a timer is what works unprompted; the voice is one press away.
 *
 * When it is speaking, the timer is not driving it — the next headline comes
 * when the current one has finished being read. A fixed interval would cut a
 * long headline off mid-clause and leave a short one hanging in silence.
 */

export type BoardItem = {
  id: string;
  headline: string;
  href: string;
  category: string;
};

/** How long a headline holds the board when nothing is being spoken. */
const SILENT_MS = 4500;

export function BulletinBoard({
  items,
  brand,
}: {
  items: BoardItem[];
  /** The paper's name, passed in rather than imported, so the board has no
   *  opinion about what it is branding. */
  brand: string;
}) {
  const supported = useSyncExternalStore(
    subscribeNothing,
    readSupported,
    () => false,
  );
  const voices = useSyncExternalStore(subscribeVoices, readVoices, () => NO_VOICES);
  const voice = useMemo(() => pickVoice(voices), [voices]);

  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const indexRef = useRef(0);

  const count = items.length;
  const safeIndex = count ? index % count : 0;

  // Silent rotation. Runs only while nothing is being spoken; when the voice is
  // on, the speech end event advances instead.
  useEffect(() => {
    if (speaking || count < 2) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, SILENT_MS);
    return () => clearInterval(timer);
  }, [speaking, count]);

  // Never leave the voice running after the reader has gone.
  useEffect(() => {
    return () => {
      if (hasSpeech()) window.speechSynthesis.cancel();
    };
  }, []);

  function speakFrom(at: number) {
    if (!hasSpeech() || !count) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    const position = at % count;
    indexRef.current = position;
    setIndex(position);

    const item = items[position];
    // The desk is named before the headline, as a newsreader does. It is also
    // the only cue a listener gets that the subject has changed.
    const utterance = new SpeechSynthesisUtterance(
      `${item.category}. ${item.headline}`,
    );
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = 1;
    utterance.onend = () => {
      if (!speakingRef.current) return;
      speakFrom(position + 1);
    };
    utterance.onerror = (event) => {
      // "interrupted" and "canceled" are our own doing — stopping, or moving on.
      if (event.error === "interrupted" || event.error === "canceled") return;
      speakingRef.current = false;
      setSpeaking(false);
    };
    synth.speak(utterance);
  }

  const start = () => {
    speakingRef.current = true;
    setSpeaking(true);
    speakFrom(indexRef.current);
  };

  const stop = () => {
    speakingRef.current = false;
    setSpeaking(false);
    if (hasSpeech()) window.speechSynthesis.cancel();
  };

  const step = (delta: number) => {
    const next = (safeIndex + delta + count) % count;
    indexRef.current = next;
    if (speakingRef.current) speakFrom(next);
    else setIndex(next);
  };

  if (!count) return null;

  const item = items[safeIndex];

  return (
    <section
      aria-label="News bulletin board"
      className="rounded-panel bg-signal-deep px-5 py-5 text-paper sm:px-8 sm:py-7"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="font-label text-[1.0625rem] font-extrabold tracking-[-0.02em]">
          {brand}
        </p>
        <span aria-hidden="true" className="h-4 w-px bg-paper/35" />
        <span className="eyebrow font-label text-paper/75">Bulletin</span>

        <div className="ms-auto flex items-center gap-2">
          {supported ? (
            <button
              type="button"
              onClick={() => (speaking ? stop() : start())}
              className="rounded-control bg-paper px-3.5 py-1.5 font-label text-meta font-semibold text-signal-deep hover:opacity-90"
            >
              {speaking ? "Stop" : "Listen"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous headline"
            className="rounded-control border border-paper/30 px-2.5 py-1.5 text-meta text-paper hover:bg-paper/10"
          >
            &larr;
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next headline"
            className="rounded-control border border-paper/30 px-2.5 py-1.5 text-meta text-paper hover:bg-paper/10"
          >
            &rarr;
          </button>
        </div>
      </div>

      {/* One line from the small breakpoint up, cut with an ellipsis rather
          than allowed to reflow the panel and shift every control on it each
          time the story changes.

          On a phone it gets two. A strict single line in a 375px panel cuts a
          headline at about twenty-five characters — "Regulator opens inquiry
          int…" — which is not a one-line bulletin, it is a truncated word. Two
          lines there carry the whole thought and keep the panel a fixed height,
          which is what the rule was protecting in the first place.

          The voice always reads the headline in full, whatever is shown. */}
      <p className="mt-5 min-h-[3.4rem] sm:min-h-[3.1rem]">
        <Link
          href={item.href}
          className="block line-clamp-2 text-[1.25rem] leading-[1.3] font-semibold text-paper underline-offset-[6px] hover:underline sm:truncate sm:text-[1.75rem] sm:leading-[1.25]"
        >
          {item.headline}
        </Link>
      </p>

      <div className="mt-3 flex items-center gap-3 text-meta text-paper/75">
        <span className="font-label font-semibold text-paper">
          {item.category}
        </span>
        <span aria-hidden="true">|</span>
        <span className="tabular-nums">
          {safeIndex + 1} of {count}
        </span>
        {speaking ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-paper"
            />
            Reading
          </span>
        ) : null}
      </div>

      {/* The bar fills across the run, so a reader can see how far through the
          day's fifty they are without counting. */}
      <div
        aria-hidden="true"
        className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-paper/20"
      >
        <div
          className="h-full bg-paper/70 transition-[width] duration-500"
          style={{ width: `${((safeIndex + 1) / count) * 100}%` }}
        />
      </div>
    </section>
  );
}

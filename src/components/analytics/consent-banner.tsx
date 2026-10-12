"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * Tracking consent prompt, in two forms.
 *
 * "ask" is the question: nothing is measured until the reader answers. It is
 * what every reader outside India sees, and what anyone sees on opening
 * Privacy settings.
 *
 * "notice" is for readers in India while measurement there is on by default
 * (see lib/analytics/consent): it says that measurement is on and offers to
 * turn it off, rather than asking a question whose answer is already in
 * effect.
 *
 * A card in the corner rather than a bar across the foot of the screen: it
 * covers less of the page a reader has just opened, and carries the paper's
 * mark so it reads as the paper speaking, not a third-party script.
 *
 * The two buttons are identical in size, colour and weight. A refusal styled
 * as a faint link, or as the plainer of two buttons, next to a prominent accept
 * is a dark pattern and, in the EU and UK, is not valid consent: saying no has
 * to be as easy as yes.
 */
const button =
  "flex-1 rounded-control bg-ink px-4 py-2.5 font-label text-body font-semibold text-paper transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function ConsentBanner({
  variant,
  onDecision,
}: {
  variant: "ask" | "notice";
  onDecision: (state: "granted" | "denied" | "noted") => void;
}) {
  const notice = variant === "notice";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-heading"
      aria-describedby="consent-body"
      className="fixed inset-x-3 bottom-3 z-50 rounded-panel border border-hairline bg-paper p-5 shadow-[0_12px_40px_rgb(20_22_28/0.16)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[25rem] sm:p-6"
    >
      <div className="flex items-center gap-3">
        <Image
          src="/brand/dove.png"
          alt=""
          aria-hidden="true"
          width={256}
          height={256}
          className="h-9 w-9 shrink-0"
        />
        <h2
          id="consent-heading"
          className="font-headline text-[1.1875rem] leading-tight font-semibold text-ink"
        >
          {notice ? "We measure how this site is read" : "May we measure how you read?"}
        </h2>
      </div>

      <p id="consent-body" className="mt-3 font-dek text-meta leading-relaxed text-ink">
        {notice
          ? "For readers in India this is on by default: we record which articles you read and how far you get, using a random identifier stored in your browser, and we load Google Analytics, to decide what to cover next. You can turn it off here, or at any time from Privacy settings at the foot of every page."
          : "With your agreement we record which articles you read and how far you get, using a random identifier stored in your browser, and we load Google Analytics, to decide what to cover next. You can change your choice at any time from Privacy settings at the foot of every page."}
      </p>

      <p className="mt-2 text-meta">
        <Link href="/privacy" className="text-accent underline underline-offset-4">
          What we record, and what we never do
        </Link>
      </p>

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={() => onDecision("denied")} className={button}>
          {notice ? "Turn off" : "Decline"}
        </button>
        <button
          type="button"
          onClick={() => onDecision(notice ? "noted" : "granted")}
          className={button}
        >
          {notice ? "OK" : "Agree"}
        </button>
      </div>
    </div>
  );
}

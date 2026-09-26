"use client";

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
 * The two buttons carry equal visual weight in both. A refusal styled as a
 * faint text link next to a prominent accept button is a dark pattern and, in
 * the EU and UK, is not valid consent: saying no has to be as easy as yes.
 */
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-paper px-5 py-5 sm:px-8"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="consent-heading" className="text-body font-semibold text-ink">
            Measuring how this site is read
          </h2>
          <p className="mt-1 max-w-prose text-meta text-muted">
            {notice
              ? "For readers in India this is on by default: we record which articles you read and how far you get, using a random identifier stored in your browser, and we load Google Analytics, to decide what to cover next. You can turn it off here, or at any time from Privacy settings at the foot of every page."
              : "With your agreement we record which articles you read and how far you get, using a random identifier stored in your browser, and we load Google Analytics, to decide what to cover next. You can change your choice at any time from Privacy settings at the foot of every page."}
          </p>
        </div>

        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => onDecision("denied")}
            className="flex-1 rounded-control border border-hairline px-4 py-2 text-body text-ink transition-colors hover:border-muted sm:flex-none"
          >
            {notice ? "Turn off" : "Decline"}
          </button>
          <button
            type="button"
            onClick={() => onDecision(notice ? "noted" : "granted")}
            className="flex-1 rounded-control border border-accent bg-accent px-4 py-2 text-body text-paper transition-colors hover:opacity-90 sm:flex-none"
          >
            {notice ? "OK" : "Agree"}
          </button>
        </div>
      </div>
    </div>
  );
}

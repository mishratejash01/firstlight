"use client";

/**
 * Tracking consent prompt.
 *
 * Accept and decline carry equal visual weight. A decline button styled as a
 * faint text link next to a prominent accept button is a dark pattern and, in
 * the EU and UK, is not valid consent — refusing has to be as easy as agreeing.
 */
export function ConsentBanner({
  onDecision,
}: {
  onDecision: (state: "granted" | "denied") => void;
}) {
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
            With your agreement we record which articles you read and how far
            you get, to decide what to cover next. We never store your IP
            address. You can change this at any time.
          </p>
        </div>

        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => onDecision("denied")}
            className="flex-1 rounded-control border border-hairline px-4 py-2 text-body text-ink transition-colors hover:border-muted sm:flex-none"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => onDecision("granted")}
            className="flex-1 rounded-control border border-accent bg-accent px-4 py-2 text-body text-paper transition-colors hover:opacity-90 sm:flex-none"
          >
            Agree
          </button>
        </div>
      </div>
    </div>
  );
}

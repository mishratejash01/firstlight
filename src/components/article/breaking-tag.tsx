/**
 * The only place the signal colour appears anywhere on the site.
 *
 * Kept as its own component so that stays true: if a second use is ever added,
 * it has to be added here, in front of this comment.
 */
export function BreakingTag() {
  return (
    <span className="eyebrow inline-flex items-center gap-1.5 text-signal">
      <span aria-hidden="true" className="inline-block h-2.5 w-0.5 bg-signal" />
      Breaking
    </span>
  );
}

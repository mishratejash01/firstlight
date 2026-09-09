import Link from "next/link";

/**
 * One thing that may need doing, with the number attached and a way to go do it.
 *
 * Deliberately not a metric tile. A bare "3" tells an administrator nothing
 * actionable; "3 stories waiting for a decision → Open the desk" tells them
 * what it means and where to act. Cards with a count of zero are not rendered
 * at all, so the section only ever shows real work.
 */
export function AttentionCard({
  count,
  title,
  detail,
  href,
  actionLabel,
}: {
  count: number;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="border-t border-hairline py-5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="text-[1.75rem] tabular-nums leading-none text-ink">
          {count}
        </span>
        <h3 className="text-[1.1rem] text-ink">{title}</h3>
      </div>
      <p className="mt-1.5 max-w-measure text-meta leading-relaxed text-muted">{detail}</p>
      <Link
        href={href}
        className="mt-2 inline-block text-meta text-accent underline underline-offset-4"
      >
        {actionLabel}
      </Link>
    </div>
  );
}

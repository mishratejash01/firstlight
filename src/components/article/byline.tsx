import Link from "next/link";

import { formatTimeAgo } from "@/lib/format/datetime";

/**
 * Byline and timestamp.
 *
 * A wire or curated item may have no staff byline, in which case the
 * attribution label stands in — an unattributed story is worse than an
 * awkwardly attributed one.
 */
export function Byline({
  author,
  publishedAt,
  attributionLabel,
  className = "",
}: {
  author: { slug: string; display_name: string } | null;
  publishedAt: string | null;
  attributionLabel?: string | null;
  className?: string;
}) {
  return (
    <p className={`text-meta text-muted ${className}`}>
      {author ? (
        <>
          <Link href={`/author/${author.slug}`} className="hover:text-accent">
            {author.display_name}
          </Link>
          {publishedAt ? " · " : null}
        </>
      ) : attributionLabel ? (
        <>{attributionLabel}{publishedAt ? " · " : null}</>
      ) : null}
      {publishedAt ? <time dateTime={publishedAt}>{formatTimeAgo(publishedAt)}</time> : null}
    </p>
  );
}

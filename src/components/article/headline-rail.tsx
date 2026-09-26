import Image from "next/image";
import Link from "next/link";

import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * A column of the latest headlines.
 *
 * No panel and no rule over the heading: the column sits on the page and the
 * hairlines between its entries are all the structure it needs.
 *
 * The column is text first. The top story gets a picture under its
 * headline and the rest carry none — a thumbnail on every row spends most of
 * the column's height on photographs an inch wide, and at this width the
 * section label above each headline does the identifying that a thumbnail was
 * doing badly. Hairlines separate them, which is all the separation a labelled
 * list needs.
 *
 * `compact` is the form beside an article: every entry alike, smaller type and
 * no picture, so the column reads as a quiet list next to the story rather
 * than as a second story competing with it.
 */
export function HeadlineRail({
  articles,
  title,
  showLeadImage = true,
  compact = false,
}: {
  articles: ArticleCardData[];
  title: string;
  /** Off where the column already carries pictures above it — a third one here
   *  would make the block a gallery rather than a list of what has happened. */
  showLeadImage?: boolean;
  compact?: boolean;
}) {
  if (!articles.length) return null;

  if (compact) {
    return (
      <aside aria-label={title}>
        <h2 className="eyebrow font-label font-semibold text-signal">{title}</h2>
        <ul className="mt-3 divide-y divide-hairline">
          {articles.map((article) => (
            <li key={article.id} className="group py-3 first:pt-1">
              <Link href={`/${article.categories.slug}/${article.slug}`}>
                <p className="font-label text-[0.75rem] font-semibold text-muted">
                  {article.categories.name}
                </p>
                <h3 className="mt-1 text-[0.9375rem] leading-[1.35] text-ink group-hover:text-accent">
                  {article.headline}
                </h3>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    );
  }

  const [lead, ...rest] = articles;
  const leadHref = `/${lead.categories.slug}/${lead.slug}`;

  return (
    <aside aria-label={title}>
      <h2 className="eyebrow font-label font-semibold text-signal">{title}</h2>

      <div className="mt-4">
        <article className="group">
          <Link href={leadHref}>
            <h3 className="text-[1.0625rem] leading-[1.28] text-ink group-hover:text-accent">
              {lead.headline}
            </h3>

            {/* Headline above the picture, not below it: the top story is
                  the only one here with room for both, and the words are what
                  the reader came down this column for. */}
            {showLeadImage && lead.hero_image_url ? (
              <div className="relative mt-3 aspect-[16/10] w-full overflow-hidden rounded-media bg-hairline">
                <Image
                  src={
                    cloudinaryImage(lead.hero_image_url, "card") ??
                    lead.hero_image_url
                  }
                  alt={lead.hero_image_alt ?? ""}
                  fill
                  sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 22rem"
                  className="object-cover"
                />
              </div>
            ) : null}
          </Link>
        </article>

        {rest.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {rest.map((article) => (
              <li key={article.id} className="group py-3.5">
                <Link href={`/${article.categories.slug}/${article.slug}`}>
                  <p className="eyebrow font-label font-semibold text-accent">
                    {article.categories.name}
                  </p>
                  <h3 className="mt-1.5 text-[1.0625rem] leading-[1.28] text-ink group-hover:text-accent">
                    {article.headline}
                  </h3>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

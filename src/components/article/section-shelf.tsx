import Link from "next/link";

import { ArticleCard } from "./article-card";
import { ArticleRow } from "./article-row";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * One section's block on the front page: a lead with a picture, then the rest
 * of the section as rows beside it.
 *
 * The heavy rule above the label is the only mark separating one section from
 * the next — no card, no panel, no tint, no column rules. Rows rather than a
 * second and third card because the lead is the section's story of the day and
 * three equal pictures say the opposite.
 */
export function SectionShelf({
  title,
  href,
  articles,
}: {
  title: string;
  href: string;
  articles: ArticleCardData[];
}) {
  if (!articles.length) return null;

  // The lead-and-rows layout needs enough stories to fill the space beside the
  // lead; below that it leaves a third of the row empty, which reads as a hole
  // rather than as space. A thin section gets even cards instead.
  if (articles.length < 5) {
    return (
      <section className="border-t-2 border-ink pt-3">
        <SectionHeader title={title} href={href} />
        <div className="story-grid mt-6">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              variant="card"
              showEyebrow={false}
            />
          ))}
        </div>
      </section>
    );
  }

  const [lead, ...others] = articles;
  // Six rows fill two columns of three, roughly the depth of the lead's
  // picture and headline beside them. Anything past that belongs on the
  // section front, not here.
  const rest = others.slice(0, 6);
  const half = Math.ceil(rest.length / 2);
  const columns = [rest.slice(0, half), rest.slice(half)];

  return (
    <section className="border-t-2 border-ink pt-3">
      <SectionHeader title={title} href={href} />

      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-3">
        <ArticleCard article={lead} variant="lead" showEyebrow={false} />

        {columns.map((column, index) => (
          <div key={index} className="divide-y divide-hairline">
            {column.map((article) => (
              <div key={article.id} className="py-5 first:pt-0">
                {/* The block is already labelled with its section, so the rows
                    inside it carry no eyebrow of their own. */}
                <ArticleRow article={article} showEyebrow={false} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The section label and its "more" link — the same row in both layouts. */
function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-section text-ink">
        <Link href={href} className="hover:text-accent">
          {title}
        </Link>
      </h2>
      <Link
        href={href}
        className="shrink-0 text-meta text-accent hover:underline underline-offset-4"
      >
        More {title.toLowerCase()}
      </Link>
    </div>
  );
}

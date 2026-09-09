import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import type { Metadata } from "next";

import { AiDisclosure } from "@/components/article/ai-disclosure";
import { ArticleCard } from "@/components/article/article-card";
import { Eyebrow } from "@/components/article/eyebrow";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { ReadingInstrumentation } from "@/components/analytics/reading-instrumentation";
import { getArticle, getRelatedArticles } from "@/lib/queries/article-detail";
import { getRecentArticles } from "@/lib/queries/articles";
import { HeadlineRail } from "@/components/article/headline-rail";
import {
  captureRequestContext,
  logPageView,
} from "@/lib/analytics/server-events";
import { renderMarkdown } from "@/lib/format/markdown";
import { cloudinaryImage } from "@/lib/media/transform";
import { formatDateTime } from "@/lib/format/datetime";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  newsArticleJsonLd,
} from "@/lib/seo/json-ld";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Rendered per request rather than statically.
 *
 * That is a deliberate trade. A cached article page cannot log a server-side
 * view, and server-side capture is the only reach measurement an ad blocker
 * cannot switch off. Freshness matters on a news page anyway; the CDN can still
 * cache by response header later without losing the count.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[category]/[slug]">,
): Promise<Metadata> {
  const { category, slug } = await props.params;
  const result = await getArticle(category, slug);
  if (!result) return { title: "Not found" };

  const { article } = result;
  const url = `${SITE_URL}/${article.categories.slug}/${article.slug}`;
  const description =
    article.meta_description ??
    article.standfirst ??
    article.summary ??
    undefined;

  return {
    title: article.meta_title ?? article.headline,
    description,
    alternates: { canonical: article.canonical_url ?? url },
    openGraph: {
      type: "article",
      title: article.headline,
      description,
      url,
      publishedTime: article.published_at ?? undefined,
      modifiedTime: article.updated_at,
      images: article.hero_image_url ? [article.hero_image_url] : undefined,
    },
  };
}

export default async function ArticlePage(
  props: PageProps<"/[category]/[slug]">,
) {
  const { category, slug } = await props.params;
  const result = await getArticle(category, slug);
  if (!result) notFound();

  const { article, tags, entities, keyFacts, faqs, events } = result;
  // Fired together rather than in sequence: the rail has nothing to do with the
  // related ranking, and an article page should not wait for two round trips.
  const [related, recent] = await Promise.all([
    getRelatedArticles(article.id, 3),
    getRecentArticles(8),
  ]);
  // The story being read is not "latest" to the person reading it.
  const latest = recent.filter((item) => item.id !== article.id).slice(0, 6);
  const url = `${SITE_URL}/${article.categories.slug}/${article.slug}`;

  // Request context must be read here, during render: cookies() and headers()
  // are unavailable inside an after() callback. The write itself is deferred so
  // the counter never delays the read.
  const requestContext = await captureRequestContext();
  after(() =>
    logPageView({
      articleId: article.id,
      path: `/${category}/${slug}`,
      context: requestContext,
    }),
  );

  const primaryEntities = entities.filter((e) => e.relation === "about");
  const faqSchema = faqJsonLd(faqs);

  return (
    <>
      <SiteHeader activeSlug={article.categories.slug} />

      <JsonLd data={newsArticleJsonLd({ article, url, entities, keyFacts })} />
      {faqSchema ? <JsonLd data={faqSchema} /> : null}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", url: SITE_URL },
          {
            name: article.categories.name,
            url: `${SITE_URL}/${article.categories.slug}`,
          },
          { name: article.headline, url },
        ])}
      />

      <ReadingInstrumentation articleId={article.id} />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="mx-auto grid max-w-[72rem] grid-cols-1 gap-x-16 lg:grid-cols-[minmax(0,42rem)_26rem]">
          <article className="min-w-0 pt-8 pb-10">
            <Eyebrow article={article} className="mb-2.5" />

            <h1 className="headline-lg text-hero leading-[1.08] text-ink sm:text-[2.75rem]">
              {article.headline}
            </h1>

            {article.standfirst ? (
              <p className="mt-4 text-[1.1875rem] leading-[1.5] text-muted">
                {article.standfirst}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-5">
              {article.authors ? (
                <p className="text-meta text-ink">
                  <Link
                    href={`/author/${article.authors.slug}`}
                    className="hover:text-accent"
                  >
                    {article.authors.display_name}
                  </Link>
                  {article.authors.title ? (
                    <span className="text-muted">
                      {" "}
                      · {article.authors.title}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {article.published_at ? (
                <p className="text-meta text-muted">
                  <span aria-hidden="true" className="mr-3">
                    &middot;
                  </span>
                  <time dateTime={article.published_at}>
                    {formatDateTime(article.published_at)}
                  </time>
                </p>
              ) : null}
            </div>

            {article.hero_image_url ? (
              <figure className="media-wide">
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-media bg-hairline">
                  <Image
                    src={
                      cloudinaryImage(article.hero_image_url, "hero") ??
                      article.hero_image_url
                    }
                    alt={article.hero_image_alt ?? ""}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 672px"
                    className="object-cover"
                  />
                </div>
                {/* The credit is set apart from the caption rather than run into
 it: a picture desk credit is an attribution, not a sentence. */}
                {article.hero_image_alt || article.hero_image_credit ? (
                  <figcaption className="mt-2 text-meta text-muted">
                    {article.hero_image_alt}
                    {article.hero_image_credit ? (
                      <span className="whitespace-nowrap">
                        {" "}
                        &middot; {article.hero_image_credit}
                      </span>
                    ) : null}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}

            {/* A curated item is a summary and a link. There is no body column on
 the row to render, by database constraint, so this branch cannot
 silently reproduce someone else's article. */}
            {article.origin === "curated" ? (
              <div className="mt-6">
                <p className="text-prose text-ink">{article.summary}</p>
                {article.attribution_url ? (
                  <p className="mt-5 border-l-2 border-accent pl-4 text-body">
                    <a
                      href={article.attribution_url}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                      className="text-accent underline underline-offset-4"
                      data-track="click_source_link"
                    >
                      Read the full report at{" "}
                      {article.attribution_label ?? "the original source"}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-7">{renderMarkdown(article.body)}</div>
            )}

            {article.ai_assisted ? (
              <AiDisclosure
                reviewed={Boolean(article.reviewed_by)}
                unverifiedCount={article.ai_unverified_claims?.length ?? 0}
              />
            ) : null}

            {keyFacts.length ? (
              <section className="mt-12 border-t border-hairline pt-6">
                <h2 className="text-section text-ink">Key numbers</h2>
                <dl className="mt-4 divide-y divide-hairline">
                  {keyFacts.map((fact) => (
                    <div
                      key={fact.label}
                      className="flex flex-wrap items-baseline gap-x-4 py-3"
                    >
                      <dt className="text-meta text-muted">{fact.label}</dt>
                      <dd className="text-[1.25rem] text-ink">{fact.value}</dd>
                      <dd className="w-full text-meta text-muted">
                        Source: {fact.attribution}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {faqs.length ? (
              <section className="mt-12 border-t border-hairline pt-6">
                <h2 className="text-section text-ink">
                  Questions readers are asking
                </h2>
                <div className="mt-4 divide-y divide-hairline">
                  {faqs.map((faq) => (
                    <div key={faq.question} className="py-4">
                      <h3 className="text-[1.1rem] text-ink">{faq.question}</h3>
                      <p className="mt-1.5 text-body leading-relaxed text-muted">
                        {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {events.length ? (
              <section className="mt-12 border-t border-hairline pt-6">
                <h2 className="text-section text-ink">Follow this story</h2>
                <ul className="mt-3 space-y-2">
                  {events.map((event) => (
                    <li key={event.slug}>
                      <Link
                        href={`/live/${event.slug}`}
                        className="text-body text-accent underline underline-offset-4"
                      >
                        {event.title}
                      </Link>
                      {event.is_live ? (
                        <span className="ml-2 text-meta text-signal">
                          Updating
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {primaryEntities.length ? (
              <section className="mt-12 border-t border-hairline pt-6">
                <h2 className="text-body font-semibold text-ink">
                  In this story
                </h2>
                <ul className="mt-3 space-y-1.5">
                  {primaryEntities.map(({ entity, roleNote }) => (
                    <li key={entity.slug} className="text-meta text-muted">
                      <span className="text-ink">{entity.name}</span>
                      {roleNote ? ` — ${roleNote}` : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {tags.length ? (
              <section className="mt-12 border-t border-hairline pt-6">
                <h2 className="sr-only">Topics</h2>
                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                  {tags.map((tag) => (
                    <li key={tag.slug}>
                      <Link
                        href={`/topic/${tag.slug}`}
                        className="text-meta text-accent hover:underline underline-offset-4"
                      >
                        {tag.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-12 border-t border-hairline pt-8">
              <NewsletterSignup context="article-end" />
            </div>
          </article>

          {/* The rail sticks while the story scrolls: an article runs far longer
              than six headlines do, and a column that scrolls out of sight after
              the second paragraph is just the old empty margin with pictures in
              it for a moment. */}
          <aside className="border-t border-hairline pt-8 lg:border-t-0 lg:pt-8">
            <div className="lg:sticky lg:top-8">
              <HeadlineRail articles={latest} title="Latest" />
            </div>
          </aside>
        </div>

        {related.length ? (
          <section className="border-t border-hairline pt-6 pb-12">
            <h2 className="mb-6 text-section text-ink">More on this story</h2>
            <div className="story-grid">
              {related.map((item) => (
                <ArticleCard
                  key={item.id}
                  article={{
                    id: item.id,
                    slug: item.slug,
                    headline: item.headline,
                    standfirst: item.standfirst,
                    summary: null,
                    hero_image_url: item.hero_image_url,
                    hero_image_alt: item.hero_image_alt,
                    published_at: item.published_at,
                    is_breaking: false,
                    origin: "original",
                    attribution_url: null,
                    attribution_label: null,
                    categories: {
                      slug: item.category_slug,
                      name: item.category_name,
                    },
                    authors:
                      item.author_name && item.author_slug
                        ? {
                            slug: item.author_slug,
                            display_name: item.author_name,
                          }
                        : null,
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </>
  );
}

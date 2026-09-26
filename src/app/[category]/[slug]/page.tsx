import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ArticleCard } from "@/components/article/article-card";
import { Eyebrow } from "@/components/article/eyebrow";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { PageViewBeacon } from "@/components/analytics/page-view-beacon";
import { ReadingInstrumentation } from "@/components/analytics/reading-instrumentation";
import { getArticle, getRelatedArticles } from "@/lib/queries/article-detail";
import { getRecentArticles } from "@/lib/queries/articles";
import { HeadlineRail } from "@/components/article/headline-rail";
import { ListenButton } from "@/components/article/listen-button";
import { renderMarkdown } from "@/lib/format/markdown";
import { listeningMinutes, markdownToSpeech } from "@/lib/format/speech-text";
import {
  SHARE_IMAGE_SHAPE,
  cloudinaryCrop,
  cloudinaryImage,
} from "@/lib/media/transform";
import { formatDateTime, toIstIso } from "@/lib/format/datetime";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  newsArticleJsonLd,
} from "@/lib/seo/json-ld";
import { lastChanged } from "@/lib/queries/syndication";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

/**
 * A story counts as updated, for the visible "Updated" line, once its text has
 * changed more than this long after publication. Fixing a typo in the first
 * minutes is not an update a reader needs told about.
 */
const UPDATE_NOTICE_AFTER_MS = 15 * 60 * 1000;

/**
 * Picture libraries as their names are written, not as the picture search
 * records them ("via wikimedia_commons").
 */
const LIBRARY_NAMES: Record<string, string> = {
  wikimedia_commons: "Wikimedia Commons",
  wikimedia: "Wikimedia Commons",
  flickr: "Flickr",
  rawpixel: "rawpixel",
  geographorguk: "Geograph",
};

function readableCredit(credit: string): string {
  return credit.replace(/ via ([a-z_]+)$/, (whole, key: string) =>
    LIBRARY_NAMES[key] ? ` via ${LIBRARY_NAMES[key]}` : whole,
  );
}

function modifiedTime(article: { published_at: string | null; content_updated_at: string | null }) {
  if (!article.published_at) return null;
  return lastChanged({
    published_at: article.published_at,
    content_updated_at: article.content_updated_at,
  });
}

/**
 * Served from the edge cache, rebuilt at most every five minutes.
 *
 * No article is rendered at build time: each is rendered the first time it is
 * asked for and cached from then on, so a correction reaches readers within
 * five minutes and a new story is there on its first request. It used to be
 * rendered afresh for every reader so that the server could count the view;
 * the page now reports its own view (PageViewBeacon), and a reader no longer
 * waits for a render and two database round trips before the story arrives.
 */
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata(
  props: PageProps<"/[category]/[slug]">,
): Promise<Metadata> {
  const { category, slug } = await props.params;
  const result = await getArticle(category, slug);
  if (!result) return { title: "Not found" };

  const { article, tags } = result;
  const url = absoluteUrl(`/${article.categories.slug}/${article.slug}`);
  const description =
    article.meta_description ??
    article.standfirst ??
    article.summary ??
    undefined;
  const modified = modifiedTime(article) ?? undefined;
  const shareImage = cloudinaryCrop(
    article.hero_image_url,
    SHARE_IMAGE_SHAPE.width,
    SHARE_IMAGE_SHAPE.height,
  );
  const images = shareImage
    ? [
        {
          url: shareImage,
          width: SHARE_IMAGE_SHAPE.width,
          height: SHARE_IMAGE_SHAPE.height,
          alt: article.hero_image_alt ?? article.headline,
        },
      ]
    : article.hero_image_url
      ? [{ url: article.hero_image_url, alt: article.hero_image_alt ?? article.headline }]
      : undefined;

  return {
    title: article.meta_title ?? article.headline,
    description,
    alternates: { canonical: article.canonical_url ?? url },
    authors: article.authors
      ? [{ name: article.authors.display_name, url: absoluteUrl(`/author/${article.authors.slug}`) }]
      : [{ name: SITE_NAME, url: SITE_URL }],
    openGraph: {
      type: "article",
      title: article.headline,
      description,
      url,
      publishedTime: toIstIso(article.published_at),
      modifiedTime: toIstIso(modified),
      section: article.categories.name,
      tags: tags.map((tag) => tag.name),
      authors: article.authors
        ? [absoluteUrl(`/author/${article.authors.slug}`)]
        : [SITE_URL],
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: article.headline,
      description,
      images: images?.map((image) => image.url),
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
  const url = absoluteUrl(`/${article.categories.slug}/${article.slug}`);
  // What the listen button will read: the body with its markup stripped,
  // computed here so the client is sent words rather than Markdown.
  const speechBlocks = article.body ? markdownToSpeech(article.body) : [];
  // Shown only when the text changed well after publication; a correction in
  // the first minutes is not an update a reader needs told about.
  const modified = modifiedTime(article);
  const updatedAt =
    modified &&
    article.published_at &&
    Date.parse(modified) - Date.parse(article.published_at) > UPDATE_NOTICE_AFTER_MS
      ? modified
      : null;

  const primaryEntities = entities.filter((e) => e.relation === "about");
  const faqSchema = faqJsonLd(faqs);

  return (
    <>
      {/* The bar skips the story being read: an alert pointing at the page the
          reader is already on is a dead end. */}
      <SiteHeader activeSlug={article.categories.slug} excludeId={article.id} />

      <JsonLd
        data={newsArticleJsonLd({
          article: { ...article, dateModified: modifiedTime(article) },
          url,
          entities,
          keyFacts,
          tags,
          searchKeywords: article.search_keywords,
        })}
      />
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

      <PageViewBeacon articleId={article.id} />
      <ReadingInstrumentation articleId={article.id} />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        {/* The page runs to the same width as the masthead and the front
            page, so the story's left edge and the rail's right edge line up
            with everything above them. The story takes all the room the rail
            leaves: headline and picture run the full width of the column, so
            nothing opens up between the story and the rail. The rail is a
            narrow list of headlines behind a hairline, secondary to the piece
            the reader opened. */}
        <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-x-14 2xl:grid-cols-[minmax(0,1fr)_20rem]">
          <article className="min-w-0 pt-8 pb-10">
            <Eyebrow article={article} className="mb-2.5" />

            <h1 className="headline-lg text-hero leading-[1.08] text-ink sm:text-[2.75rem]">
              {article.headline}
            </h1>

            {article.standfirst ? (
              <p className="mt-4 max-w-[42rem] text-[1.1875rem] leading-[1.5] text-ink xl:max-w-[46rem]">
                {article.standfirst}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-5">
              {/* The byline. A story without a named writer is the paper's
                  own and says so, linked to the page about who we are. */}
              <p className="text-meta text-ink">
                {article.authors ? (
                  <>
                    By{" "}
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
                  </>
                ) : (
                  <>
                    By{" "}
                    <Link href="/about" className="hover:text-accent">
                      {SITE_NAME}
                    </Link>
                  </>
                )}
              </p>
              {article.published_at ? (
                <p className="text-meta text-muted">
                  <span aria-hidden="true" className="mr-3">
                    &middot;
                  </span>
                  Published{" "}
                  <time dateTime={toIstIso(article.published_at)}>
                    {formatDateTime(article.published_at)}
                  </time>
                  {updatedAt ? (
                    <>
                      <span aria-hidden="true" className="mx-3">
                        &middot;
                      </span>
                      Updated{" "}
                      <time dateTime={toIstIso(updatedAt)}>
                        {formatDateTime(updatedAt)}
                      </time>
                    </>
                  ) : null}
                </p>
              ) : null}
              {article.origin !== "curated" && speechBlocks.length ? (
                <div className="basis-full sm:ml-auto sm:basis-auto">
                  <ListenButton
                    headline={article.headline}
                    standfirst={article.standfirst}
                    blocks={speechBlocks}
                    minutes={listeningMinutes(speechBlocks)}
                  />
                </div>
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
                    loading="eager"
                    fetchPriority="high"
                    sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 672px"
                    className="object-cover"
                  />
                </div>
                {/* The credit follows the caption after a middle dot: a
                    picture desk credit is an attribution, not a sentence. It
                    wraps wherever it must, even inside a long file name or
                    code in a library credit, because a caption that cannot
                    break widens the page past a phone's screen. */}
                {article.hero_image_alt || article.hero_image_credit ? (
                  <figcaption className="mt-2 text-meta text-muted [overflow-wrap:anywhere]">
                    {article.hero_image_alt}
                    {article.hero_image_credit ? (
                      <>
                        {" "}
                        &middot; {readableCredit(article.hero_image_credit)}
                      </>
                    ) : null}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}

            {/* Everything that is read line by line holds to the reading
                measure, even where the picture above runs wider. On larger
                screens the type steps up and the measure with it, so the text
                fills more of the column while a line stays under about
                seventy-five characters. */}
            <div className="max-w-[42rem] xl:max-w-[44rem] xl:[--text-prose:1.1875rem] 2xl:max-w-[47rem] 2xl:[--text-prose:1.25rem]">
              {/* A curated item is a summary and a link. There is no body column on
   the row to render, by database constraint, so this branch cannot
   silently reproduce someone else's article. */}
              {article.origin === "curated" ? (
                <div className="mt-6">
                  <p className="font-label text-prose text-ink">
                    {article.summary}
                  </p>
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
                <div className="font-label mt-7">
                  {renderMarkdown(article.body)}
                </div>
              )}

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
            </div>
          </article>

          {/* The rail sticks while the story scrolls: an article runs far longer
              than six headlines do, and a column that scrolls out of sight after
              the second paragraph is just the old empty margin with pictures in
              it for a moment. */}
          <aside className="border-t border-hairline pt-8 lg:border-t-0 lg:border-l lg:pt-8 lg:pl-8">
            <div className="lg:sticky lg:top-20">
              <HeadlineRail articles={latest} title="Latest" compact />
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
                            title: null,
                            avatar_url: null,
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

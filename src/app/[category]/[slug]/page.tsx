import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ArticleCard } from "@/components/article/article-card";
import { Eyebrow } from "@/components/article/eyebrow";
import { CaseStudyBox } from "@/components/case-study/case-study-box";
import { CaseStudyPage } from "@/components/case-study/case-study-page";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { PageViewBeacon } from "@/components/analytics/page-view-beacon";
import { ReadingInstrumentation } from "@/components/analytics/reading-instrumentation";
import { getArticle, getRelatedArticles } from "@/lib/queries/article-detail";
import { getCaseStudyFor } from "@/lib/queries/case-studies";
import { getAllSections } from "@/lib/queries/navigation";
import { readableCredit } from "@/lib/format/credit";
import { InlineLatest } from "@/components/site/live-headlines";
import { ListenButton } from "@/components/article/listen-button";
import { renderMarkdown } from "@/lib/format/markdown";
import { displayTagName } from "@/lib/format/tag-name";
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
import { PUBLISHER, SITE_NAME, SITE_URL, X_HANDLE, absoluteUrl } from "@/lib/site";

/**
 * A story counts as updated, for the visible "Updated" line, once its text has
 * changed more than this long after publication. Fixing a typo in the first
 * minutes is not an update a reader needs told about.
 */
const UPDATE_NOTICE_AFTER_MS = 15 * 60 * 1000;

function modifiedTime(article: { published_at: string | null; content_updated_at: string | null }) {
  if (!article.published_at) return null;
  return lastChanged({
    published_at: article.published_at,
    content_updated_at: article.content_updated_at,
  });
}

/**
 * Served from the edge cache, rebuilt at most once an hour, and at once when
 * the desk changes the story (revalidateStory).
 *
 * No article is rendered at build time: each is rendered the first time it is
 * asked for and cached from then on, so a new story is there on its first
 * request. Nothing on the page changes unless the story does: the latest
 * headlines beside it, the breaking banner and the date come from the
 * browser, so a page is stored once rather than again for every story
 * published elsewhere. It used to be
 * rendered afresh for every reader so that the server could count the view;
 * the page now reports its own view (PageViewBeacon), and a reader no longer
 * waits for a render and two database round trips before the story arrives.
 */
export const revalidate = 3600;

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
      ...(X_HANDLE ? { site: X_HANDLE } : {}),
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
  const related = await getRelatedArticles(article.id, 3);

  // A case study is the same row with a different page (see lib/ai/case-study).
  if (article.format === "case_study") {
    const sections = await getAllSections();
    const subjectName = sections.find((section) => section.slug === article.subject_slug)?.name ?? null;
    return <CaseStudyPage result={result} related={related} subjectName={subjectName} />;
  }
  // The case study that answers the question behind this story, if there is one.
  const caseStudy = article.origin === "curated" ? null : await getCaseStudyFor(article.id);
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
      {/* Carries the @id the article's page node points at
          (mainEntityOfPage.breadcrumb). Without it the pointer resolved to
          nothing, and Google read it as a breadcrumb with no items. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Home", url: absoluteUrl("/") },
            {
              name: article.categories.name,
              url: `${SITE_URL}/${article.categories.slug}`,
            },
            { name: article.headline, url },
          ],
          `${url}#breadcrumb`,
        )}
      />

      <PageViewBeacon articleId={article.id} />
      <ReadingInstrumentation articleId={article.id} />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
      {/* One column, in the middle of the page. The headline, the standfirst,
            the byline and the body all share its left edge, so the story reads
            as a single block from the top down; only the pictures break out
            wider than it. There is no rail: other stories are set into the
            story between paragraphs instead (see InlineLatest), so nothing
            runs beside the text and leaves an empty column for most of it. */}
        <article className="mx-auto min-w-0 max-w-[46rem] pt-8 pb-10 lg:max-w-[52rem] xl:max-w-[54rem] 2xl:max-w-[56rem]">
          {/* The headline block runs to the picture's width and edges,
              wider than the body copy below it: the headline is the one
              line on the page meant to be taken in whole at a glance. */}
          <header className="breakout">
            <Eyebrow article={article} className="mb-2.5" />

            <h1 className="headline-lg text-hero leading-[1.08] text-ink sm:text-[2.75rem]">
              {article.headline}
            </h1>

            {article.standfirst ? (
              <p className="mt-4 font-dek text-[1.1875rem] leading-[1.5] text-ink lg:text-[1.3125rem]">
                {article.standfirst}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-5">
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
          </header>

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

          {/* The column is the reading measure. On larger screens the type
              steps up with it, so a line stays under about seventy-five
              characters. */}
          <div className="lg:[--text-prose:1.1875rem] xl:[--text-prose:1.25rem]">
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
                <InlineLatest excludeId={article.id} from={0} count={3} label="Latest" />
              </div>
            ) : (
              <div className="font-label mt-7">
                {/* Other stories go in after the third paragraph, once the
                    reader is into the piece, and again after the eighth in a
                    long one. A story too short to reach either still carries
                    them, at the end. */}
                {renderMarkdown(article.body, {
                  inserts: [
                    ...(caseStudy ? [{ afterParagraph: 2, node: <CaseStudyBox item={caseStudy} /> }] : []),
                    {
                      afterParagraph: 3,
                      node: <InlineLatest excludeId={article.id} from={0} count={3} label="Latest" />,
                    },
                    {
                      afterParagraph: 8,
                      node: <InlineLatest excludeId={article.id} from={3} count={3} label="More stories" />,
                    },
                  ],
                })}
              </div>
            )}

            {keyFacts.length ? (
              <section className="mt-12">
                <h2 className="text-section text-ink">Key numbers</h2>
                <div
                  className="table-wrap mt-4"
                  role="region"
                  aria-label="Key numbers"
                  tabIndex={0}
                >
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">What</th>
                        <th scope="col">Figure</th>
                        <th scope="col">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keyFacts.map((fact) => (
                        <tr key={fact.label}>
                          <th scope="row">{fact.label}</th>
                          <td>{fact.value}</td>
                          <td className="text-muted">{fact.attribution}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {faqs.length ? (
              <section className="mt-12">
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
              <section className="mt-12">
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
              <section className="mt-12">
                <h2 className="text-section text-ink">In this story</h2>
                <div
                  className="table-wrap mt-4"
                  role="region"
                  aria-label="People and organisations in this story"
                  tabIndex={0}
                >
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Role in the story</th>
                      </tr>
                    </thead>
                    <tbody>
                      {primaryEntities.map(({ entity, roleNote }) => (
                        <tr key={entity.slug}>
                          <th scope="row">{entity.name}</th>
                          <td>{roleNote ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {tags.length ? (
              // A plain line of links, "Topics" then each name with a dot
              // between them: set apart by weight and colour, not boxed.
              <section className="mt-12 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-label text-meta font-semibold text-ink">
                  Topics
                </h2>
                <ul className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-label text-meta">
                  {tags.map((tag, index) => (
                    <li key={tag.slug} className="flex items-baseline gap-x-2">
                      <Link
                        href={`/topic/${tag.slug}`}
                        className="text-ink underline-offset-4 hover:underline"
                      >
                        {displayTagName(
                          tag.name,
                          entities.map(({ entity }) => entity.name),
                        )}
                      </Link>
                      {index < tags.length - 1 ? (
                        <span aria-hidden="true" className="text-muted">
                          &middot;
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-12">
              <NewsletterSignup context="article-end" variant="panel" />
            </div>
          </div>
        </article>


        {related.length ? (
          <section className="pt-6 pb-12">
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

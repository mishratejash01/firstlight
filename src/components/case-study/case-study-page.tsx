import Link from "next/link";

import { PageViewBeacon } from "@/components/analytics/page-view-beacon";
import { ReadingInstrumentation } from "@/components/analytics/reading-instrumentation";
import { ArticleCard } from "@/components/article/article-card";
import { ListenButton } from "@/components/article/listen-button";
import { JsonLd } from "@/components/seo/json-ld";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { readCaseStudy, type CaseStudyBlock } from "@/lib/ai/case-study";
import { readableCredit } from "@/lib/format/credit";
import { formatDate, formatDateTime, toIstIso } from "@/lib/format/datetime";
import { renderMarkdown } from "@/lib/format/markdown";
import { listeningMinutes, markdownToSpeech } from "@/lib/format/speech-text";
import { displayTagName } from "@/lib/format/tag-name";
import type { getArticle, getRelatedArticles } from "@/lib/queries/article-detail";
import { breadcrumbJsonLd, faqJsonLd, newsArticleJsonLd } from "@/lib/seo/json-ld";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

import { CaseStudyPicture } from "./case-study-card";

type Result = NonNullable<Awaited<ReturnType<typeof getArticle>>>;
type Related = Awaited<ReturnType<typeof getRelatedArticles>>;

const EFFECT: Record<CaseStudyBlock["responses"][number]["effect"], { label: string; dot: string; text: string }> = {
  working: { label: "Working", dot: "bg-accent", text: "text-ink" },
  mixed: { label: "Mixed results", dot: "bg-ink", text: "text-ink" },
  too_early: { label: "Too early to say", dot: "bg-muted", text: "text-muted" },
  not_working: { label: "Not working", dot: "bg-signal", text: "text-signal" },
  unknown: { label: "Unclear", dot: "bg-muted", text: "text-muted" },
};

const KIND: Record<CaseStudyBlock["responses"][number]["kind"], string> = {
  institutional: "Institution",
  grassroots: "Community",
  market: "Market",
  individual: "Individuals",
};

type Chapter = { id: string; title: string };

/** A chapter heading: its number in the margin's colour, the title in the display face, a rule above. */
function Chapter({ chapter, index, children }: { chapter: Chapter; index: number; children: React.ReactNode }) {
  return (
    <section id={chapter.id} aria-labelledby={`${chapter.id}-title`} className="mt-14 scroll-mt-24 border-t border-hairline pt-6">
      <div className="flex items-baseline gap-3">
        <span aria-hidden="true" className="font-label text-meta font-semibold tabular-nums text-accent">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2 id={`${chapter.id}-title`} className="headline-lg text-[1.625rem] leading-[1.15] text-ink sm:text-[1.875rem]">
          {chapter.title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/**
 * A case study's page, laid out as a dossier.
 *
 * The question and its one-line answer open the page across the full
 * measure, with the picture beside them rather than under them, so the
 * page starts on the answer and not on a photograph. Below, a contents rail
 * stays beside the reading column on a wide screen; on a phone the same
 * contents are a row of chips. The short answer is set as a pull quote in
 * the paper's warm panel; the figures are a stat strip; how it works runs
 * down a line as numbered steps; each response carries its verdict.
 */
export async function CaseStudyPage({
  result,
  related,
  subjectName,
}: {
  result: Result;
  related: Related;
  subjectName: string | null;
}) {
  const { article, tags, entities, keyFacts, faqs } = result;
  const block = readCaseStudy(article.case_study);
  const url = absoluteUrl(`/${article.categories.slug}/${article.slug}`);
  const speechBlocks = article.body ? markdownToSpeech(article.body) : [];
  const reviewed = article.reviewed_at ?? article.content_updated_at ?? article.published_at;
  const faqSchema = faqJsonLd(faqs);
  const chapters: Chapter[] = block
    ? [
        { id: "now", title: "What's happening now" },
        { id: "how", title: block.mechanism.title || "How it works" },
        { id: "who", title: "Who it affects" },
        { id: "responses", title: "What's being done, and is it working" },
        ...(block.whatYouCanDo.length ? [{ id: "do", title: "What you can do" }] : []),
        ...(block.openQuestions.length ? [{ id: "unknown", title: "What we still don't know" }] : []),
        ...(faqs.length ? [{ id: "faq", title: "Questions readers ask" }] : []),
        ...(block.sources.length ? [{ id: "sources", title: "Sources" }] : []),
        ...(block.updates.length ? [{ id: "updates", title: "Updates" }] : []),
      ]
    : [];
  const at = (id: string) => chapters.findIndex((c) => c.id === id);

  const contents = (
    <ol className="space-y-2.5">
      {chapters.map((chapter, index) => (
        <li key={chapter.id} className="flex gap-3 font-label text-meta leading-snug">
          <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
          <a href={`#${chapter.id}`} className="text-ink hover:text-accent">
            {chapter.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <SiteHeader activeSlug={article.categories.slug} excludeId={article.id} />

      <JsonLd
        data={newsArticleJsonLd({
          article: { ...article, dateModified: reviewed },
          url,
          entities,
          keyFacts,
          tags,
          searchKeywords: article.search_keywords,
          type: "Article",
        })}
      />
      {faqSchema ? <JsonLd data={faqSchema} /> : null}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Home", url: absoluteUrl("/") },
            { name: article.categories.name, url: `${SITE_URL}/${article.categories.slug}` },
            { name: article.headline, url },
          ],
          `${url}#breadcrumb`,
        )}
      />

      <PageViewBeacon articleId={article.id} />
      <ReadingInstrumentation articleId={article.id} />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <article className="pt-8 pb-10">
          {/* The opening: question, answer and meta on the left, the picture on
              the right, so the page starts on the answer. */}
          <header className="grid gap-8 border-b border-hairline pb-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7 lg:self-center">
              <p className="flex items-center gap-3 font-label text-meta">
                <span aria-hidden="true" className="inline-block h-[2px] w-8 bg-accent" />
                <Link href={`/${article.categories.slug}`} className="font-semibold text-accent hover:underline">
                  Case study
                </Link>
                {subjectName && article.subject_slug ? (
                  <>
                    <span aria-hidden="true" className="text-muted">
                      &middot;
                    </span>
                    <Link href={`/${article.subject_slug}`} className="text-ink hover:text-accent">
                      {subjectName}
                    </Link>
                  </>
                ) : null}
              </p>

              <h1 className="headline-lg mt-4 text-hero leading-[1.06] text-ink sm:text-hero-lg">{article.headline}</h1>

              {article.standfirst ? (
                <p className="mt-5 max-w-[38rem] font-dek text-[1.1875rem] leading-[1.5] text-ink lg:text-[1.3125rem]">{article.standfirst}</p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 font-label text-meta text-muted">
                <span>
                  By{" "}
                  <Link href="/about" className="text-ink hover:text-accent">
                    {SITE_NAME}
                  </Link>
                </span>
                {article.published_at ? (
                  <>
                    <span aria-hidden="true">&middot;</span>
                    <time dateTime={toIstIso(article.published_at)}>{formatDate(article.published_at)}</time>
                  </>
                ) : null}
                {reviewed ? (
                  <>
                    <span aria-hidden="true">&middot;</span>
                    <span>
                      Reviewed <time dateTime={toIstIso(reviewed)}>{formatDate(reviewed)}</time>
                    </span>
                  </>
                ) : null}
                {speechBlocks.length ? (
                  <span className="basis-full sm:ml-auto sm:basis-auto">
                    <ListenButton headline={article.headline} standfirst={article.standfirst} blocks={speechBlocks} minutes={listeningMinutes(speechBlocks)} />
                  </span>
                ) : null}
              </div>
            </div>

            {article.hero_image_url ? (
              <figure className="lg:col-span-5">
                <CaseStudyPicture
                  item={article}
                  preset="hero"
                  priority
                  aspect="aspect-[4/3]"
                  sizes="(max-width: 1024px) calc(100vw - 32px), 460px"
                />
                {article.hero_image_alt || article.hero_image_credit ? (
                  <figcaption className="mt-2 text-kicker leading-snug text-muted [overflow-wrap:anywhere]">
                    {article.hero_image_alt}
                    {article.hero_image_credit ? <> &middot; {readableCredit(article.hero_image_credit)}</> : null}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}
          </header>

          <div className="pt-8 lg:grid lg:grid-cols-12 lg:gap-12">
            {/* The contents rail, beside the reading column on a wide screen. */}
            <aside className="hidden lg:col-span-3 lg:block">
              <div className="sticky top-24">
                <p className="font-label text-meta font-semibold text-ink">In this case study</p>
                <div className="mt-3 border-t border-hairline pt-3">{contents}</div>
                {reviewed ? (
                  <p className="mt-6 border-t border-hairline pt-3 font-label text-meta text-muted">
                    Last reviewed
                    <br />
                    <time dateTime={toIstIso(reviewed)} className="text-ink">
                      {formatDate(reviewed)}
                    </time>
                  </p>
                ) : null}
                {block?.updates.length ? (
                  <p className="mt-3 font-label text-meta text-muted">
                    <a href="#updates" className="text-ink hover:text-accent">
                      {block.updates.length} update{block.updates.length === 1 ? "" : "s"}
                    </a>{" "}
                    since publication
                  </p>
                ) : null}
              </div>
            </aside>

            <div className="min-w-0 lg:col-span-9 lg:[--text-prose:1.1875rem] xl:[--text-prose:1.25rem]">
              {block ? (
                <>
                  {/* The answer, complete on its own, set as the pull quote it is. */}
                  <blockquote className="rounded-panel bg-quote px-6 py-6 sm:px-8 sm:py-7">
                    <p className="font-label text-meta font-semibold text-ink">The short answer</p>
                    <p className="mt-3 max-w-[40rem] font-dek text-[1.25rem] leading-[1.5] text-ink sm:text-[1.375rem]">{block.shortAnswer}</p>
                  </blockquote>

                  <nav aria-label="On this page" className="-mx-4 mt-5 overflow-x-auto px-4 lg:hidden">
                    <ol className="flex w-max gap-2">
                      {chapters.map((chapter, index) => (
                        <li key={chapter.id}>
                          <a href={`#${chapter.id}`} className="inline-block rounded-control border border-hairline px-3 py-1.5 font-label text-meta text-ink">
                            <span className="text-muted">{String(index + 1).padStart(2, "0")}</span> {chapter.title}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>

                  {block.atAGlance.length ? (
                    <section aria-label="At a glance" className="mt-10">
                      <dl className="grid grid-cols-2 border-t border-l border-hairline sm:grid-cols-3">
                        {block.atAGlance.map((fact) => (
                          <div key={fact.label} className="border-r border-b border-hairline px-4 py-5 sm:px-5">
                            <dd className={`headline-lg leading-[1.05] text-ink ${fact.value.length > 18 ? "text-[1.25rem] sm:text-[1.375rem]" : "text-[1.75rem] sm:text-[2rem]"}`}>
                              {fact.value}
                            </dd>
                            <dt className="mt-2 font-label text-meta font-semibold text-ink">{fact.label}</dt>
                            <dd className="mt-1 text-kicker leading-snug text-muted">{fact.attribution}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ) : null}

                  <Chapter chapter={chapters[at("now")]} index={at("now")}>
                    {block.trigger ? (
                      <p className="mt-4 rounded-control border border-hairline px-3.5 py-2.5 font-label text-meta text-muted">
                        Prompted by{" "}
                        {block.trigger.href ? (
                          <Link href={block.trigger.href} className="text-ink underline-offset-4 hover:text-accent hover:underline">
                            {block.trigger.title}
                          </Link>
                        ) : (
                          <span className="text-ink">{block.trigger.title}</span>
                        )}
                      </p>
                    ) : null}
                    <div className="font-label mt-4 max-w-[46rem]">{renderMarkdown(block.now)}</div>
                  </Chapter>

                  <Chapter chapter={chapters[at("how")]} index={at("how")}>
                    <ol className="relative mt-8 ml-4 space-y-9 border-l-2 border-hairline pl-9">
                      {block.mechanism.steps.map((step, index) => (
                        <li key={step.title} className="relative">
                          <span
                            aria-hidden="true"
                            className="absolute top-0 -left-[3.3rem] flex h-9 w-9 items-center justify-center rounded-full bg-accent font-label text-[0.9375rem] font-semibold text-paper"
                          >
                            {index + 1}
                          </span>
                          <h3 className="headline-lg pt-1.5 text-[1.25rem] leading-snug text-ink">{step.title}</h3>
                          <p className="mt-2 max-w-[42rem] font-label text-prose leading-[1.6] text-ink">{step.text}</p>
                        </li>
                      ))}
                    </ol>
                  </Chapter>

                  <Chapter chapter={chapters[at("who")]} index={at("who")}>
                    <div className="font-label mt-4 max-w-[46rem]">{renderMarkdown(block.affects)}</div>
                  </Chapter>

                  <Chapter chapter={chapters[at("responses")]} index={at("responses")}>
                    <ul className="mt-6 divide-y divide-hairline border-y border-hairline">
                      {block.responses.map((response) => {
                        const effect = EFFECT[response.effect];
                        return (
                          <li key={`${response.actor}-${response.what.slice(0, 20)}`} className="grid gap-x-8 gap-y-3 py-5 sm:grid-cols-[minmax(0,1fr)_11rem]">
                            <div className="min-w-0">
                              <p className="font-label text-kicker font-semibold text-muted">{KIND[response.kind]}</p>
                              <h3 className="headline-lg mt-1 text-[1.1875rem] leading-snug text-ink">{response.actor}</h3>
                              <p className="mt-2 max-w-[42rem] text-body leading-relaxed text-ink">{response.what}</p>
                              <p className="mt-1.5 max-w-[42rem] text-meta leading-relaxed text-muted">{response.evidence}</p>
                            </div>
                            <p className="sm:pt-5 sm:text-right">
                              <span className={`inline-flex items-center gap-2 rounded-control border border-hairline px-2.5 py-1 font-label text-meta font-semibold ${effect.text}`}>
                                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${effect.dot}`} />
                                {effect.label}
                              </span>
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </Chapter>

                  {block.whatYouCanDo.length ? (
                    <Chapter chapter={chapters[at("do")]} index={at("do")}>
                      <ol className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
                        {block.whatYouCanDo.map((item, index) => (
                          <li key={item} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
                            <span aria-hidden="true" className="headline-lg text-[1.5rem] leading-none text-accent">
                              {index + 1}
                            </span>
                            <p className="font-label text-body leading-relaxed text-ink">{item}</p>
                          </li>
                        ))}
                      </ol>
                    </Chapter>
                  ) : null}

                  {block.openQuestions.length ? (
                    <Chapter chapter={chapters[at("unknown")]} index={at("unknown")}>
                      <ul className="mt-5 max-w-[46rem] space-y-3">
                        {block.openQuestions.map((item) => (
                          <li key={item} className="flex gap-3 font-label text-body leading-relaxed text-ink">
                            <span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </Chapter>
                  ) : null}
                </>
              ) : (
                <div className="font-label mt-7 max-w-[46rem]">{renderMarkdown(article.body)}</div>
              )}

              {faqs.length ? (
                <Chapter chapter={{ id: "faq", title: "Questions readers ask" }} index={Math.max(at("faq"), 0)}>
                  <div className="mt-2 max-w-[46rem] divide-y divide-hairline">
                    {faqs.map((faq) => (
                      <div key={faq.question} className="py-4">
                        <h3 className="font-label text-[1.0625rem] font-semibold leading-snug text-ink">{faq.question}</h3>
                        <p className="mt-1.5 text-body leading-relaxed text-muted">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                </Chapter>
              ) : null}

              {block?.sources.length ? (
                <Chapter chapter={chapters[at("sources")]} index={at("sources")}>
                  <ol className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-2">
                    {block.sources.map((source, index) => (
                      <li key={source.url} className="flex gap-3 text-meta leading-relaxed">
                        <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-muted">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <a href={source.url} rel="noopener noreferrer nofollow" target="_blank" className="text-ink underline-offset-4 hover:text-accent hover:underline [overflow-wrap:anywhere]">
                            {source.title}
                          </a>
                          <span className="block text-muted">
                            {source.publisher}
                            {source.usedFor ? ` · ${source.usedFor}` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </Chapter>
              ) : null}

              {block?.updates.length ? (
                <Chapter chapter={chapters[at("updates")]} index={at("updates")}>
                  <ol className="relative mt-6 ml-1.5 space-y-5 border-l-2 border-hairline pl-6">
                    {[...block.updates].reverse().map((update) => (
                      <li key={update.at} className="relative">
                        <span aria-hidden="true" className="absolute top-1.5 -left-[1.95rem] h-3 w-3 rounded-full border-2 border-accent bg-paper" />
                        <p className="font-label text-meta text-muted">
                          <time dateTime={toIstIso(update.at)}>{formatDateTime(update.at)}</time>
                        </p>
                        <p className="mt-1 max-w-[42rem] text-body leading-relaxed text-ink">
                          {update.note}
                          {update.href ? (
                            <>
                              {" "}
                              <Link href={update.href} className="text-accent underline-offset-4 hover:underline">
                                Read the story
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </li>
                    ))}
                  </ol>
                </Chapter>
              ) : null}

              {tags.length ? (
                <section className="mt-12 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-hairline pt-5">
                  <h2 className="font-label text-meta font-semibold text-ink">Topics</h2>
                  <ul className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-label text-meta">
                    {tags.map((tag, index) => (
                      <li key={tag.slug} className="flex items-baseline gap-x-2">
                        <Link href={`/topic/${tag.slug}`} className="text-ink underline-offset-4 hover:underline">
                          {displayTagName(tag.name, entities.map(({ entity }) => entity.name))}
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

              <div className="mt-12 max-w-[46rem]">
                <NewsletterSignup context="article-end" variant="panel" />
              </div>
            </div>
          </div>
        </article>

        {related.length ? (
          <section className="border-t border-hairline pt-8 pb-12">
            <h2 className="mb-6 font-label text-section font-semibold text-ink">The news on this</h2>
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
                    categories: { slug: item.category_slug, name: item.category_name },
                    authors:
                      item.author_name && item.author_slug
                        ? { slug: item.author_slug, display_name: item.author_name, title: null, avatar_url: null }
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

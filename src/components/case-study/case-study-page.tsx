import Image from "next/image";
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
import { cloudinaryImage } from "@/lib/media/transform";
import type { getArticle, getRelatedArticles } from "@/lib/queries/article-detail";
import { breadcrumbJsonLd, faqJsonLd, newsArticleJsonLd } from "@/lib/seo/json-ld";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

type Result = NonNullable<Awaited<ReturnType<typeof getArticle>>>;
type Related = Awaited<ReturnType<typeof getRelatedArticles>>;

const EFFECT: Record<CaseStudyBlock["responses"][number]["effect"], { label: string; className: string }> = {
  working: { label: "Working", className: "text-ink" },
  mixed: { label: "Mixed results", className: "text-ink" },
  too_early: { label: "Too early to say", className: "text-muted" },
  not_working: { label: "Not working", className: "text-signal" },
  unknown: { label: "Unclear", className: "text-muted" },
};

const KIND: Record<CaseStudyBlock["responses"][number]["kind"], string> = {
  institutional: "Institution",
  grassroots: "Community",
  market: "Market",
  individual: "Individuals",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 scroll-mt-24">
      <h2 id={`${id}-title`} className="font-headline text-[1.5rem] leading-tight text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A case study's page: the question, the short answer, then the working —
 * the news that prompted it, how it works as numbered steps, who it affects,
 * what is being done with a verdict on each response, what a reader can do,
 * what is still unknown, the sources, and the log of updates. Kept to the
 * article page's reading column and type, so it reads as the same paper.
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
  const sections: { id: string; title: string }[] = block
    ? [
        { id: "now", title: "What's happening now" },
        { id: "how", title: block.mechanism.title || "How it works" },
        { id: "who", title: "Who it affects" },
        { id: "responses", title: "What's being done" },
        { id: "do", title: "What you can do" },
        { id: "unknown", title: "Still unknown" },
        { id: "sources", title: "Sources" },
      ]
    : [];

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
        <article className="mx-auto min-w-0 max-w-[46rem] pt-8 pb-10 lg:max-w-[52rem] xl:max-w-[54rem] 2xl:max-w-[56rem]">
          <header className="breakout">
            <p className="font-label text-meta text-muted">
              <Link href={`/${article.categories.slug}`} className="font-semibold text-ink hover:text-accent">
                Case study
              </Link>
              {subjectName && article.subject_slug ? (
                <>
                  <span aria-hidden="true" className="mx-2">
                    &middot;
                  </span>
                  <Link href={`/${article.subject_slug}`} className="hover:text-accent">
                    {subjectName}
                  </Link>
                </>
              ) : null}
            </p>

            <h1 className="headline-lg mt-2.5 text-hero leading-[1.08] text-ink sm:text-[2.75rem]">{article.headline}</h1>

            {article.standfirst ? (
              <p className="mt-4 font-dek text-[1.1875rem] leading-[1.5] text-ink lg:text-[1.3125rem]">{article.standfirst}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-5">
              <p className="text-meta text-ink">
                By{" "}
                <Link href="/about" className="hover:text-accent">
                  {SITE_NAME}
                </Link>
              </p>
              {article.published_at ? (
                <p className="text-meta text-muted">
                  <span aria-hidden="true" className="mr-3">
                    &middot;
                  </span>
                  <time dateTime={toIstIso(article.published_at)}>{formatDate(article.published_at)}</time>
                  {reviewed ? (
                    <>
                      <span aria-hidden="true" className="mx-3">
                        &middot;
                      </span>
                      Reviewed <time dateTime={toIstIso(reviewed)}>{formatDate(reviewed)}</time>
                    </>
                  ) : null}
                </p>
              ) : null}
              {speechBlocks.length ? (
                <div className="basis-full sm:ml-auto sm:basis-auto">
                  <ListenButton headline={article.headline} standfirst={article.standfirst} blocks={speechBlocks} minutes={listeningMinutes(speechBlocks)} />
                </div>
              ) : null}
            </div>
          </header>

          {article.hero_image_url ? (
            <figure className="media-wide">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-media bg-hairline">
                <Image
                  src={cloudinaryImage(article.hero_image_url, "hero") ?? article.hero_image_url}
                  alt={article.hero_image_alt ?? ""}
                  fill
                  loading="eager"
                  fetchPriority="high"
                  sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 672px"
                  className="object-cover"
                />
              </div>
              {article.hero_image_alt || article.hero_image_credit ? (
                <figcaption className="mt-2 text-meta text-muted [overflow-wrap:anywhere]">
                  {article.hero_image_alt}
                  {article.hero_image_credit ? <> &middot; {readableCredit(article.hero_image_credit)}</> : null}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <div className="lg:[--text-prose:1.1875rem] xl:[--text-prose:1.25rem]">
            {block ? (
              <>
                {/* The answer, complete on its own, before any of the working. */}
                <div className="mt-8 rounded-panel bg-wash px-5 py-5 sm:px-7 sm:py-6">
                  <p className="font-label text-meta font-semibold text-ink">The short answer</p>
                  <p className="mt-2 font-label text-prose leading-[1.6] text-ink">{block.shortAnswer}</p>
                </div>

                <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 font-label text-meta">
                  {sections.map((section) => (
                    <a key={section.id} href={`#${section.id}`} className="text-accent underline-offset-4 hover:underline">
                      {section.title}
                    </a>
                  ))}
                </nav>

                {block.atAGlance.length ? (
                  <section aria-label="At a glance" className="mt-10 border-t border-hairline pt-6">
                    <h2 className="font-label text-meta font-semibold text-ink">At a glance</h2>
                    <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                      {block.atAGlance.map((fact) => (
                        <div key={fact.label} className="border-l-2 border-hairline pl-4">
                          <dt className="font-label text-meta text-muted">{fact.label}</dt>
                          <dd className="mt-0.5 font-headline text-[1.25rem] leading-tight text-ink">{fact.value}</dd>
                          <dd className="mt-0.5 text-meta text-muted">{fact.attribution}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}

                <Section id="now" title="What's happening now">
                  {block.trigger ? (
                    <p className="mt-2 font-label text-meta text-muted">
                      Prompted by:{" "}
                      {block.trigger.href ? (
                        <Link href={block.trigger.href} className="text-accent underline-offset-4 hover:underline">
                          {block.trigger.title}
                        </Link>
                      ) : (
                        block.trigger.title
                      )}
                    </p>
                  ) : null}
                  <div className="font-label mt-4">{renderMarkdown(block.now)}</div>
                </Section>

                <Section id="how" title={block.mechanism.title || "How it works"}>
                  <ol className="mt-6 space-y-6">
                    {block.mechanism.steps.map((step, index) => (
                      <li key={step.title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4">
                        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-label text-[0.95rem] font-semibold text-paper">
                          {index + 1}
                        </span>
                        <div className="pt-1">
                          <h3 className="font-label text-[1.0625rem] font-semibold leading-snug text-ink">{step.title}</h3>
                          <p className="mt-1.5 font-label text-prose leading-[1.6] text-ink">{step.text}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Section>

                <Section id="who" title="Who it affects">
                  <div className="font-label mt-4">{renderMarkdown(block.affects)}</div>
                </Section>

                <Section id="responses" title="What's being done, and is it working">
                  <div className="mt-4 divide-y divide-hairline border-t border-hairline">
                    {block.responses.map((response) => {
                      const effect = EFFECT[response.effect];
                      return (
                        <div key={`${response.actor}-${response.what.slice(0, 20)}`} className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                          <div>
                            <p className="font-label text-meta text-muted">{KIND[response.kind]}</p>
                            <h3 className="mt-0.5 font-label text-[1.0625rem] font-semibold text-ink">{response.actor}</h3>
                            <p className="mt-1 text-body leading-relaxed text-ink">{response.what}</p>
                            <p className="mt-1.5 text-meta leading-relaxed text-muted">{response.evidence}</p>
                          </div>
                          <p className={`font-label text-body font-semibold sm:pt-5 sm:text-right ${effect.className}`}>{effect.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                {block.whatYouCanDo.length ? (
                  <Section id="do" title="What you can do">
                    <ul className="mt-4 list-disc space-y-2 pl-5 font-label text-prose leading-[1.6] text-ink">
                      {block.whatYouCanDo.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </Section>
                ) : null}

                {block.openQuestions.length ? (
                  <Section id="unknown" title="What we still don't know">
                    <ul className="mt-4 list-disc space-y-2 pl-5 font-label text-prose leading-[1.6] text-ink">
                      {block.openQuestions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </>
            ) : (
              <div className="font-label mt-7">{renderMarkdown(article.body)}</div>
            )}

            {faqs.length ? (
              <section className="mt-12">
                <h2 className="font-headline text-[1.5rem] leading-tight text-ink">Questions readers ask</h2>
                <div className="mt-4 divide-y divide-hairline">
                  {faqs.map((faq) => (
                    <div key={faq.question} className="py-4">
                      <h3 className="text-[1.1rem] text-ink">{faq.question}</h3>
                      <p className="mt-1.5 text-body leading-relaxed text-muted">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {block?.sources.length ? (
              <Section id="sources" title="Sources">
                <ol className="mt-4 list-decimal space-y-2 pl-5 text-body leading-relaxed text-ink">
                  {block.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} rel="noopener noreferrer nofollow" target="_blank" className="text-accent underline underline-offset-4 [overflow-wrap:anywhere]">
                        {source.title}
                      </a>
                      <span className="text-muted">
                        {" "}
                        &middot; {source.publisher}
                        {source.usedFor ? ` · ${source.usedFor}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
            ) : null}

            {block?.updates.length ? (
              <section id="updates" className="mt-12 scroll-mt-24">
                <h2 className="font-headline text-[1.5rem] leading-tight text-ink">Updates</h2>
                <ul className="mt-4 space-y-3">
                  {[...block.updates].reverse().map((update) => (
                    <li key={update.at} className="border-l-2 border-hairline pl-4">
                      <p className="font-label text-meta text-muted">
                        <time dateTime={toIstIso(update.at)}>{formatDateTime(update.at)}</time>
                      </p>
                      <p className="mt-0.5 text-body leading-relaxed text-ink">
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
                </ul>
              </section>
            ) : null}

            {tags.length ? (
              <section className="mt-12 flex flex-wrap items-baseline gap-x-3 gap-y-1">
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

            <div className="mt-12">
              <NewsletterSignup context="article-end" variant="panel" />
            </div>
          </div>
        </article>

        {related.length ? (
          <section className="pt-6 pb-12">
            <h2 className="mb-6 text-section text-ink">The news on this</h2>
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

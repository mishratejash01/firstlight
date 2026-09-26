import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { captureRequestContext, logPageView } from "@/lib/analytics/server-events";
import { formatClockTime, formatDate, formatDateTime } from "@/lib/format/datetime";
import { renderMarkdown } from "@/lib/format/markdown";
import { liveBlogJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";


// A live blog is worthless stale.
export const dynamic = "force-dynamic";

async function getEvent(slug: string) {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("news_events")
    .select(
      "id, slug, title, summary, is_live, status, coverage_starts_at, coverage_ends_at, published_at, hero_image_url, meta_title, meta_description, categories ( slug, name )",
    )
    .eq("slug", slug)
    .in("status", ["developing", "concluded"])
    .maybeSingle();

  if (!event) return null;

  const [updates, linked] = await Promise.all([
    supabase
      .from("event_updates")
      .select("id, anchor, headline, body, published_at, is_key_update, authors ( slug, display_name )")
      .eq("event_id", event.id)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false }),
    supabase
      .from("article_events")
      .select("relation, articles ( slug, headline, published_at, categories ( slug, name ) )")
      .eq("event_id", event.id)
      .order("position", { ascending: true }),
  ]);

  return {
    event,
    updates: updates.data ?? [],
    linked: (linked.data ?? []).filter((row) => row.articles),
  };
}

export async function generateMetadata(
  props: PageProps<"/live/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const result = await getEvent(slug);
  if (!result) return { title: "Not found" };

  return pageMetadata({
    title: result.event.meta_title ?? `${result.event.title}: live updates`,
    description: result.event.meta_description ?? result.event.summary,
    path: `/live/${result.event.slug}`,
  });
}

export default async function LiveEventPage(props: PageProps<"/live/[slug]">) {
  const { slug } = await props.params;
  const result = await getEvent(slug);
  if (!result) notFound();

  const { event, updates, linked } = result;
  const url = absoluteUrl(`/live/${event.slug}`);

  const requestContext = await captureRequestContext();
  after(() => logPageView({ path: `/live/${slug}`, context: requestContext }));

  return (
    <>
      <SiteHeader />

      {/* liveBlogUpdate is emitted oldest-first, which is the order the schema
          expects, while the page renders newest-first for readers. */}
      <JsonLd
        data={liveBlogJsonLd({
          url,
          title: event.title,
          summary: event.summary,
          coverageStart: event.coverage_starts_at,
          coverageEnd: event.coverage_ends_at,
          imageUrl: event.hero_image_url,
          updates: [...updates]
            .reverse()
            .map((u) => ({
              anchor: u.anchor as string,
              headline: u.headline,
              body: u.body,
              published_at: u.published_at,
            })),
        })}
      />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <div className="flex flex-wrap items-center gap-3">
            {event.is_live ? (
              <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-signal">
                <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-signal" />
                Updating
              </span>
            ) : (
              <span className="text-meta text-muted">Coverage closed</span>
            )}
            {event.categories ? (
              <Link
                href={`/${event.categories.slug}`}
                className="text-meta text-accent underline-offset-4 hover:underline"
              >
                {event.categories.name}
              </Link>
            ) : null}
          </div>

          <h1 className="mt-3 text-hero leading-tight text-ink lg:text-hero-lg">
            {event.title}
          </h1>
          {event.summary ? (
            <p className="mt-4 max-w-measure text-lead leading-relaxed text-muted">
              {event.summary}
            </p>
          ) : null}
          <p className="mt-4 text-meta text-muted">
            Coverage from {formatDate(event.coverage_starts_at)}
            {updates.length ? ` · ${updates.length} updates` : null}
          </p>
        </div>

        <div className="grid gap-10 py-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="sr-only">Live updates</h2>
            <ol className="space-y-8">
              {updates.map((update) => (
                <li
                  key={update.id}
                  // Stable per-update anchor: this is what makes a narrow search
                  // land on the specific development instead of the page top.
                  id={update.anchor as string}
                  className="scroll-mt-24 border-t border-hairline pt-5 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-baseline gap-3">
                    <a
                      href={`#${update.anchor}`}
                      className="text-[1.05rem] text-accent"
                      aria-label={`Link to update at ${formatClockTime(update.published_at)}`}
                    >
                      {formatClockTime(update.published_at)}
                    </a>
                    {update.is_key_update ? (
                      <span className="text-meta font-semibold text-ink">Key update</span>
                    ) : null}
                  </div>

                  <h3 className="mt-1.5 text-[1.3rem] leading-snug text-ink">
                    {update.headline}
                  </h3>
                  <div className="mt-1">{renderMarkdown(update.body)}</div>

                  <p className="mt-2 text-meta text-muted">
                    {update.authors ? `${update.authors.display_name} · ` : null}
                    <time dateTime={update.published_at}>
                      {formatDateTime(update.published_at)}
                    </time>
                  </p>
                </li>
              ))}
              {!updates.length ? (
                <li className="text-lead text-muted">No updates posted yet.</li>
              ) : null}
            </ol>
          </div>

          <aside className="lg:border-l lg:border-hairline lg:pl-8">
            {/* The hub links out to each substantive piece and each piece links
                back. That reciprocal structure is what concentrates the ranking
                signal, and is what distinguishes this from thin duplicate pages. */}
            <h2 className="text-section text-ink">Related coverage</h2>
            {linked.length ? (
              <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
                {linked.map((row, index) => {
                  const article = row.articles!;
                  return (
                    <li key={`${article.slug}-${index}`} className="py-4">
                      <h3 className="text-[1.05rem] leading-snug text-ink">
                        <Link
                          href={`/${article.categories.slug}/${article.slug}`}
                          className="hover:text-accent"
                        >
                          {article.headline}
                        </Link>
                      </h3>
                      <p className="mt-1 text-meta text-muted capitalize">
                        {row.relation.replace("_", " ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-meta text-muted">
                No separate pieces filed on this event yet.
              </p>
            )}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { submitToIndexNow } from "@/lib/seo/indexnow";
import { draftingModelId } from "@/lib/ai/config";
import { attachStructuredData } from "@/lib/ai/attach-structure";
import { draftFromTrend } from "@/lib/ai/draft";
import { getSourceDocuments } from "@/lib/fetch/extract";
import { resolveGoogleNewsUrl } from "@/lib/fetch/google-redirect";
import { illustrateArticle } from "@/lib/media/illustrate";
import { verifyEvent } from "./verify";
import { Output, generateText } from "ai";
import { z } from "zod";
import { aiIsConfigured, modelChain } from "@/lib/ai/config";
import { recordSameAs } from "./wikidata";

/**
 * From a newsworthy event to a published article.
 *
 * The sequence is deliberate:
 *
 *   claim   — one run takes the event, atomically, so two overlapping runs
 *             cannot write it twice
 *   read    — the source articles the event was built from, most
 *             authoritative outlets first
 *   verify  — claims extracted from those sources; the number of independent
 *             sources required scales with how serious the claims are
 *   write   — our own piece, grounded in the source text
 *   picture — a licensed photograph where one can be confirmed, otherwise a
 *             typographic card
 *   publish — as a scheduled article, live after the configured delay, so an
 *             editor has that long to pull it
 *
 * The daily cap, the delay and the kill switch are the same settings the
 * other automated writers use. Nothing here gets a separate allowance.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** Reclaim an event whose writer went quiet. */
const STALE_CLAIM_MINUTES = 10;
/** How long a failed attempt waits before the event is tried again. */
const RETRY_AFTER_MINUTES = 15;
const MAX_ATTEMPTS = 3;

export type EventWriteOutcome = {
  eventId: string;
  title: string;
  status: "published" | "drafted" | "held" | "failed" | "skipped";
  slug?: string;
  severity?: string;
  sourcesRead?: number;
  illustration?: "photo" | "card" | "none";
  reason?: string;
};

export type EventWriteReport = {
  autoWrite: boolean;
  publishing: boolean;
  remaining: number;
  outcomes: EventWriteOutcome[];
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? fallback;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Puts an event back in the queue with a note, after a failed attempt. The
 * attempt count was incremented on claim, so an event that fails three times
 * stops being tried.
 */
async function release(eventId: string, reason: string, attempts: number): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("story_events")
    .update({
      status: attempts >= MAX_ATTEMPTS ? "rejected" : "newsworthy",
      last_error: reason,
      triage_reason:
        attempts >= MAX_ATTEMPTS ? `Gave up after ${attempts} attempts: ${reason}` : undefined,
    })
    .eq("id", eventId);
}

type NewsItem = { title: string; url: string; source: string };
type SourceDoc = {
  url: string;
  source: string;
  title: string | null;
  byline: string | null;
  content: string;
};

/**
 * The source articles behind an event: one per outlet, the most authoritative
 * outlets first, from the streams that link to actual articles. Reads up to
 * `maxDocuments` of them; zero means headlines only.
 */
async function gatherDocuments(
  eventId: string,
  authority: Map<string, number>,
  maxDocuments: number,
): Promise<{ newsItems: NewsItem[]; documents: SourceDoc[] }> {
  const supabase = createAdminClient();

  const { data: mentions } = await supabase
    .from("signal_mentions")
    .select("title, url, source_kind, source_key, observed_at")
    .eq("event_id", eventId)
    .not("url", "is", null)
    .in("source_kind", ["gnews", "rss", "hn"])
    .order("observed_at", { ascending: true })
    .limit(60);

  // One item per outlet, keyed by the outlet rather than the link's host:
  // Google News links all share one host and say nothing about who wrote it.
  const byOutlet = new Map<string, NewsItem>();
  for (const mention of mentions ?? []) {
    if (!mention.url) continue;
    const outlet = mention.source_key || hostOf(mention.url);
    if (!outlet || outlet === "unknown") continue;
    if (!byOutlet.has(outlet)) byOutlet.set(outlet, { title: mention.title, url: mention.url, source: mention.source_key });
  }

  const newsItems = [...byOutlet.entries()]
    .sort((a, b) => (authority.get(b[0]) ?? 0.8) - (authority.get(a[0]) ?? 0.8))
    .map(([, item]) => item);

  let documents: SourceDoc[] = [];
  if (maxDocuments > 0 && newsItems.length) {
    const targets = newsItems.slice(0, maxDocuments);
    // Google redirects become the real article URLs here, so the reader has
    // something it can actually open.
    for (const target of targets) target.url = await resolveGoogleNewsUrl(target.url);
    const fetched = await getSourceDocuments(targets.map((item) => item.url));
    documents = fetched
      .filter((doc) => doc.status === "ok" && doc.content)
      .map((doc) => ({
        url: doc.url,
        source: targets.find((item) => item.url === doc.url)?.source ?? doc.host,
        title: doc.title,
        byline: doc.byline,
        content: doc.content as string,
      }));
  }

  return { newsItems, documents };
}

async function loadAuthority(): Promise<Map<string, number>> {
  const supabase = createAdminClient();
  const { data: rows } = await supabase.from("source_authority").select("host, weight");
  return new Map((rows ?? []).map((r) => [r.host, Number(r.weight)]));
}

export async function writeEvents(limit = 1): Promise<EventWriteReport> {
  const supabase = createAdminClient();

  const autoWrite = await readSetting<boolean>("engine_auto_write", true);
  const publishing = await readSetting<boolean>("autonomous_publishing_enabled", false);
  const dailyLimit = await readSetting<number>("autonomous_daily_limit", 6);
  const delayMinutes = await readSetting<number>("autonomous_publish_delay_minutes", 0);
  const fetchSources = await readSetting<boolean>("source_fetch_enabled", true);
  const maxDocuments = await readSetting<number>("engine_max_documents", 5);
  const minSourcesRequired = await readSetting<number>("source_fetch_min_required", 1);

  const report: EventWriteReport = { autoWrite, publishing, remaining: 0, outcomes: [] };
  if (!autoWrite) return report;

  // Shared with every other automated writer, counted from the database.
  // The cap is on what reaches readers: drafts an editor never published do
  // not use it up, otherwise a morning of drafting would silence the desk
  // for the rest of the day once publishing is switched on.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("ai_assisted", true)
    .in("status", ["scheduled", "published"])
    .gte("ai_generated_at", since);

  report.remaining = Math.max(dailyLimit - (count ?? 0), 0);
  if (report.remaining === 0) {
    report.outcomes.push({
      eventId: "",
      title: "—",
      status: "skipped",
      reason: `Daily limit of ${dailyLimit} already reached.`,
    });
    return report;
  }

  const now = Date.now();
  const retryBefore = new Date(now - RETRY_AFTER_MINUTES * 60_000).toISOString();
  const staleBefore = new Date(now - STALE_CLAIM_MINUTES * 60_000).toISOString();

  // Newsworthy events not recently attempted, plus claims that went stale.
  const { data: candidates } = await supabase
    .from("story_events")
    .select(
      "id, title, entities, independent_sources, write_attempts, triage_section, triage_angle, triage_reason, urgency, score",
    )
    .or(
      `and(status.eq.newsworthy,or(claimed_at.is.null,claimed_at.lt.${retryBefore})),and(status.eq.writing,claimed_at.lt.${staleBefore})`,
    )
    .lt("write_attempts", MAX_ATTEMPTS)
    .order("score", { ascending: false })
    .limit(40);

  if (!candidates?.length) return report;

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true);

  // Balance across sections. Every candidate here has already passed triage,
  // so choosing among them by section costs nothing in quality; it only
  // decides which good story goes first. The section with the fewest stories
  // live in the last day goes first, the score breaks ties, and a section
  // with nothing worth writing simply gets nothing.
  const { data: recent } = await supabase
    .from("articles")
    .select("category_id")
    .eq("ai_assisted", true)
    .in("status", ["scheduled", "published"])
    .gte("ai_generated_at", since);
  const perSection = new Map<string, number>();
  for (const row of recent ?? []) {
    perSection.set(row.category_id, (perSection.get(row.category_id) ?? 0) + 1);
  }
  const sectionOf = (name: string | null) =>
    (categories ?? []).find((c) => c.name.toLowerCase() === (name ?? "").toLowerCase()) ??
    (categories ?? [])[0];
  candidates.sort((a, b) => {
    const ca = perSection.get(sectionOf(a.triage_section)?.id ?? "") ?? 0;
    const cb = perSection.get(sectionOf(b.triage_section)?.id ?? "") ?? 0;
    return ca - cb || Number(b.score) - Number(a.score);
  });

  const authority = await loadAuthority();

  const publishedSlugs: string[] = [];

  for (const event of candidates.slice(0, Math.min(limit, report.remaining))) {
    const attempts = (event.write_attempts ?? 0) + 1;

    // The claim. A single UPDATE whose WHERE repeats the availability test, so
    // if another run got here first this affects no rows and we move on.
    const { data: claimed } = await supabase
      .from("story_events")
      .update({
        status: "writing",
        claimed_at: new Date().toISOString(),
        write_attempts: attempts,
      })
      .eq("id", event.id)
      .or(
        `and(status.eq.newsworthy,or(claimed_at.is.null,claimed_at.lt.${retryBefore})),and(status.eq.writing,claimed_at.lt.${staleBefore})`,
      )
      .select("id");

    if (!claimed?.length) {
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "skipped",
        reason: "Claimed by another run.",
      });
      continue;
    }

    const { newsItems, documents } = await gatherDocuments(
      event.id,
      authority,
      fetchSources ? maxDocuments : 0,
    );

    if (!newsItems.length) {
      await release(event.id, "No linked coverage to write from.", attempts);
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "held",
        reason: "No linked articles yet — waiting for coverage.",
      });
      continue;
    }

    if (documents.length < minSourcesRequired) {
      await release(
        event.id,
        `Only ${documents.length} of ${Math.min(newsItems.length, maxDocuments)} linked articles could be read.`,
        attempts,
      );
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "held",
        sourcesRead: documents.length,
        reason: "No readable source text — refusing to write from headlines alone.",
      });
      continue;
    }

    // The gate. How many independent sources this needs depends on what the
    // sources are actually claiming.
    const verification = await verifyEvent({
      eventId: event.id,
      title: event.title,
      independentSources: Number(event.independent_sources ?? 0),
      documents: documents.map((doc) => ({ source: doc.source, title: doc.title, content: doc.content })),
    });

    if (!verification.passed) {
      await release(event.id, verification.reason, attempts);
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "held",
        severity: verification.severity,
        sourcesRead: documents.length,
        reason: verification.reason,
      });
      continue;
    }

    const section =
      (categories ?? []).find(
        (c) => c.name.toLowerCase() === (event.triage_section ?? "").toLowerCase(),
      ) ?? null;

    const result = await draftFromTrend({
      term: verification.summary || event.title,
      newsItems,
      documents,
      sectionName: section?.name,
      angle: [event.triage_angle, event.urgency === "breaking" ? "This is breaking news; lead with what is confirmed." : null]
        .filter(Boolean)
        .join(" "),
    });

    if (!result.ok) {
      await release(event.id, result.error, attempts);
      report.outcomes.push({ eventId: event.id, title: event.title, status: "failed", reason: result.error });
      continue;
    }

    const draft = result.data;

    const body = draft.bodyMarkdown.trimEnd();
    if (!/[.!?"'\)\]]$/.test(body)) {
      await release(event.id, "Draft ended mid-sentence.", attempts);
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "failed",
        reason: "Draft ended mid-sentence and was discarded.",
      });
      continue;
    }

    const chosenSection =
      section ??
      (categories ?? []).find(
        (c) => c.name.toLowerCase() === (draft.suggestedTags[0] ?? "").toLowerCase(),
      ) ??
      (categories ?? [])[0];

    if (!chosenSection) {
      await release(event.id, "No sections configured.", attempts);
      report.outcomes.push({ eventId: event.id, title: event.title, status: "failed", reason: "No sections configured." });
      continue;
    }

    const base = slugify(draft.headline) || slugify(event.title) || "story";
    const { data: clash } = await supabase
      .from("articles")
      .select("slug")
      .eq("slug", base)
      .maybeSingle();

    const publishedAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();

    const illustration = await illustrateArticle({
      headline: draft.headline,
      section: chosenSection.name,
      subjects: draft.entities
        .filter((entity) => entity.relation === "about")
        .map((entity) => ({ name: entity.name, type: entity.type })),
      related: draft.entities
        .filter((entity) => entity.relation !== "about")
        .map((entity) => ({ name: entity.name, type: entity.type })),
      brief: draft.imageBrief,
    });

    const { data: article, error } = await supabase
      .from("articles")
      .insert({
        headline: draft.headline,
        slug: clash ? withUniqueSuffix(base) : base,
        standfirst: draft.standfirst,
        summary: draft.summary,
        body: draft.bodyMarkdown,
        category_id: chosenSection.id,
        origin: "original",
        status: publishing ? (delayMinutes > 0 ? "scheduled" : "published") : "draft",
        published_at: publishing ? publishedAt : null,
        ai_assisted: true,
        ai_model: draftingModelId(),
        ai_generated_at: new Date().toISOString(),
        ai_unverified_claims: draft.unverifiedClaims,
        hero_image_url: illustration?.url ?? null,
        hero_image_alt: illustration?.alt ?? null,
        hero_image_credit: illustration?.credit ?? null,
        image_brief: draft.imageBrief,
      })
      .select("id, slug")
      .single();

    if (error) {
      await release(event.id, error.message, attempts);
      report.outcomes.push({ eventId: event.id, title: event.title, status: "failed", reason: error.message });
      continue;
    }

    await supabase
      .from("story_events")
      .update({
        status: "written",
        article_id: article.id,
        summary: verification.summary || null,
        last_error: null,
      })
      .eq("id", event.id);

    await attachStructuredData(supabase, article.id, draft);
    if (illustration?.sameAs.length) await recordSameAs(supabase, illustration.sameAs);

    if (publishing) publishedSlugs.push(article.slug);

    report.outcomes.push({
      eventId: event.id,
      title: event.title,
      status: publishing ? "published" : "drafted",
      slug: article.slug,
      severity: verification.severity,
      sourcesRead: documents.length,
      illustration: illustration?.kind ?? "none",
    });
  }

  if (publishedSlugs.length && SITE_URL) {
    const { data: rows } = await supabase
      .from("articles")
      .select("slug, categories ( slug )")
      .in("slug", publishedSlugs);

    const urls = (rows ?? [])
      .map((row) => {
        const category = row.categories as unknown as { slug: string } | null;
        return category ? `${SITE_URL}/${category.slug}/${row.slug}` : null;
      })
      .filter((url): url is string => Boolean(url));

    if (urls.length) await submitToIndexNow(urls);
  }

  return report;
}

export type RedraftOutcome = {
  ok: boolean;
  slug?: string;
  sourcesRead?: number;
  reason?: string;
};

/**
 * Rewrites a written event's article from the same sources under the current
 * house rules, keeping the headline, slug and status. The previous text is
 * kept as a version by the articles trigger, so an editor can compare or
 * revert. Structure (tags, entities, key facts, FAQs) is re-attached from the
 * new draft.
 */
export async function redraftEvent(eventId: string): Promise<RedraftOutcome> {
  const supabase = createAdminClient();
  const maxDocuments = await readSetting<number>("engine_max_documents", 5);

  const { data: event } = await supabase
    .from("story_events")
    .select("id, title, summary, article_id, triage_section, triage_angle, urgency")
    .eq("id", eventId)
    .maybeSingle();
  if (!event?.article_id) return { ok: false, reason: "No article is attached to this event." };

  const { data: article } = await supabase
    .from("articles")
    .select("id, slug, headline, categories ( name )")
    .eq("id", event.article_id)
    .maybeSingle();
  if (!article) return { ok: false, reason: "The article no longer exists." };

  const { newsItems, documents } = await gatherDocuments(eventId, await loadAuthority(), maxDocuments);
  if (!documents.length) return { ok: false, reason: "None of the source articles could be read." };

  const section = article.categories as unknown as { name: string } | null;
  const result = await draftFromTrend({
    term: event.summary || event.title,
    newsItems,
    documents,
    sectionName: section?.name,
    angle: [
      event.triage_angle,
      `Keep this headline exactly: "${article.headline}".`,
    ]
      .filter(Boolean)
      .join(" "),
  });
  if (!result.ok) return { ok: false, reason: result.error };

  const draft = result.data;
  const body = draft.bodyMarkdown.trimEnd();
  if (!/[.!?"'\)\]]$/.test(body)) {
    return { ok: false, reason: "Draft ended mid-sentence and was discarded." };
  }

  const { error } = await supabase
    .from("articles")
    .update({
      standfirst: draft.standfirst,
      summary: draft.summary,
      body: draft.bodyMarkdown,
      ai_unverified_claims: draft.unverifiedClaims,
      ai_generated_at: new Date().toISOString(),
    })
    .eq("id", article.id);
  if (error) return { ok: false, reason: error.message };

  // Clean re-attach: the new draft's structure replaces the old, rather than
  // piling on top of it.
  for (const table of ["article_tags", "article_entities", "article_key_facts", "article_faqs"] as const) {
    await supabase.from(table).delete().eq("article_id", article.id);
  }
  await attachStructuredData(supabase, article.id, draft);

  return { ok: true, slug: article.slug, sourcesRead: documents.length };
}

export type ReillustrateReport = { considered: number; replaced: number; titles: string[] };

/**
 * Gives a photograph to stories that went out with a card.
 *
 * Runs from the stored entities, so it costs no model call: the drafter
 * already said what each story was about. Looks at the last two weeks of
 * card-illustrated or unillustrated stories and tries the illustrator again; the tiers are
 * wider than they were when the story was written, and the card is what
 * readers see until this succeeds.
 */
const briefSchema = z.object({
  imageBrief: z
    .string()
    .describe(
      "The photograph this story needs, as a generic scene in three to eight words: 'hospital consultation room', 'undersea cable repair ship'. No names of people, companies or places.",
    ),
});

/** Asks the assist model what picture a story needs, when the draft did not say. */
async function briefFor(headline: string, standfirst: string | null): Promise<string | null> {
  if (!aiIsConfigured()) return null;
  for (const model of modelChain("assist")) {
    try {
      const { output } = await generateText({
        model,
        maxRetries: 0,
        system: "You choose stock photographs for a news desk. Describe the scene, never a person or a named place.",
        prompt: `Headline: ${headline}\n${standfirst ? `Standfirst: ${standfirst}` : ""}`,
        output: Output.object({ schema: briefSchema }),
      });
      return output.imageBrief;
    } catch {
      // Step down the chain.
    }
  }
  return null;
}

export async function reillustrateCards(limit = 3, scope: "cards" | "all" = "cards"): Promise<ReillustrateReport> {
  const supabase = createAdminClient();
  const report: ReillustrateReport = { considered: 0, replaced: 0, titles: [] };

  let query = supabase
    .from("articles")
    .select("id, headline, standfirst, hero_image_credit, image_brief, categories ( name )")
    .eq("ai_assisted", true)
    .in("status", ["scheduled", "published", "draft"])
    .gte("created_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(scope === "all" ? limit * 3 : limit);
  if (scope === "cards") query = query.or("hero_image_credit.eq.The Federal Post,hero_image_url.is.null");
  const { data: articles } = await query;

  for (const article of articles ?? []) {
    if (report.considered >= limit) break;

    const { data: links } = await supabase
      .from("article_entities")
      .select("relation, entities ( name, entity_type )")
      .eq("article_id", article.id);

    const toSubject = (row: { relation: string; entities: unknown }) => {
      const entity = row.entities as { name: string; entity_type: string } | null;
      return entity ? { name: entity.name, type: entity.entity_type, relation: row.relation } : null;
    };
    const all = (links ?? []).map(toSubject).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const subjects = all.filter((s) => s.relation === "about");
    const related = all.filter((s) => s.relation !== "about");

    const isCard = article.hero_image_credit === "The Federal Post" || !article.hero_image_credit;
    report.considered += 1;

    let brief = article.image_brief;
    if (!brief) {
      brief = await briefFor(article.headline, article.standfirst);
      if (brief) await supabase.from("articles").update({ image_brief: brief }).eq("id", article.id);
    }
    if (!subjects.length && !related.length && !brief) continue;

    // A story that already has a picture is only redone when a relevant one
    // exists — the subject itself or the writer's scene. A card or an empty
    // slot takes anything the full cascade can find.
    const section = (article.categories as unknown as { name: string } | null)?.name ?? "News";
    const illustration = await illustrateArticle({
      headline: article.headline,
      section,
      subjects,
      related,
      brief,
      relevantOnly: !isCard,
    });
    if (!illustration || illustration.kind !== "photo") continue;

    const { error } = await supabase
      .from("articles")
      .update({
        hero_image_url: illustration.url,
        hero_image_alt: illustration.alt,
        hero_image_credit: illustration.credit,
      })
      .eq("id", article.id);
    if (error) continue;

    if (illustration.sameAs.length) await recordSameAs(supabase, illustration.sameAs);
    report.replaced += 1;
    report.titles.push(article.headline);
  }

  return report;
}

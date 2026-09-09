import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { submitToIndexNow } from "@/lib/seo/indexnow";
import { draftingModelId } from "./config";
import { attachStructuredData } from "./attach-structure";
import { draftArticle } from "./draft";
import type { DraftedArticle } from "./schemas";

/**
 * Autonomous article generation and publishing.
 *
 * This is the one path in the codebase that publishes without a human. It uses
 * the service-role client, which has rolbypassrls, so the articles RLS policy —
 * the rule that otherwise makes it impossible for anything but an editor to set
 * status = 'published' — does not apply here.
 *
 * That is deliberate and was an explicit product decision. It is also the
 * reason this module is written defensively: a daily cap, a per-topic cadence,
 * a database kill switch checked on every run, and a full audit trail of what
 * was published and which of its claims the model could not verify.
 *
 * Nothing published here has been read by a person before it goes live.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export type GenerationOutcome = {
  topicId: string;
  topic: string;
  status: "published" | "skipped" | "failed";
  articleSlug?: string;
  unverifiedClaimCount?: number;
  reason?: string;
};

export type GenerationReport = {
  enabled: boolean;
  publishedToday: number;
  dailyLimit: number;
  outcomes: GenerationOutcome[];
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

/**
 * Writes the generated article and every piece of structure that came with it.
 *
 * The provenance columns are populated on the same insert as the body, not
 * afterwards, so there is no window in which a published AI article exists
 * without its record of what could not be verified.
 */
async function publishDraft(
  draft: DraftedArticle,
  categoryId: string,
  delayMinutes: number,
): Promise<string> {
  const supabase = createAdminClient();

  const base = slugify(draft.headline) || "untitled";
  const { data: clash } = await supabase
    .from("articles")
    .select("slug")
    .eq("slug", base)
    .maybeSingle();

  const publishedAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();

  const { data: article, error } = await supabase
    .from("articles")
    .insert({
      headline: draft.headline,
      slug: clash ? withUniqueSuffix(base) : base,
      standfirst: draft.standfirst,
      summary: draft.summary,
      body: draft.bodyMarkdown,
      category_id: categoryId,
      origin: "original",
      // A delay above zero means the row is live in the database but not yet
      // visible: the public read policy admits it only once published_at has
      // passed, so an editor has that long to pull it.
      status: delayMinutes > 0 ? "scheduled" : "published",
      published_at: publishedAt,
      ai_assisted: true,
      ai_model: draftingModelId(),
      ai_generated_at: new Date().toISOString(),
      ai_unverified_claims: draft.unverifiedClaims,
    })
    .select("id, slug")
    .single();

  if (error) throw new Error(error.message);

  await attachStructuredData(supabase, article.id, draft);

  return article.slug;
}

/**
 * One scheduled run.
 *
 * Picks topics that are due, writes and publishes each, and records the result
 * against the topic so a repeatedly failing brief is visible rather than silent.
 */
export async function runAutonomousGeneration(): Promise<GenerationReport> {
  const supabase = createAdminClient();

  const enabled = await readSetting<boolean>("autonomous_publishing_enabled", false);
  const dailyLimit = await readSetting<number>("autonomous_daily_limit", 6);
  const delayMinutes = await readSetting<number>("autonomous_publish_delay_minutes", 0);

  // Counted from what is actually in the database, not from a counter that
  // could drift. Restarting the worker cannot reset the cap.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("ai_assisted", true)
    .gte("ai_generated_at", since);

  const publishedToday = count ?? 0;
  const report: GenerationReport = {
    enabled,
    publishedToday,
    dailyLimit,
    outcomes: [],
  };

  if (!enabled) return report;

  const remaining = Math.max(dailyLimit - publishedToday, 0);
  if (remaining === 0) return report;

  const { data: topics } = await supabase
    .from("ai_topics")
    .select("id, topic, angle, category_id, cadence_hours, last_generated_at, categories ( name )")
    .eq("is_active", true)
    .order("last_generated_at", { ascending: true, nullsFirst: true })
    .limit(remaining * 3);

  const now = Date.now();
  const published: string[] = [];

  for (const topic of topics ?? []) {
    if (report.outcomes.filter((o) => o.status === "published").length >= remaining) break;

    // Respect the per-topic gap, so the site does not fill with variations on
    // the same brief.
    if (topic.last_generated_at) {
      const due = new Date(topic.last_generated_at).getTime() + topic.cadence_hours * 3600_000;
      if (now < due) {
        report.outcomes.push({
          topicId: topic.id,
          topic: topic.topic,
          status: "skipped",
          reason: "Not due yet",
        });
        continue;
      }
    }

    const category = topic.categories as unknown as { name: string } | null;
    const result = await draftArticle({
      topic: topic.topic,
      angle: topic.angle ?? undefined,
      sectionName: category?.name,
    });

    if (!result.ok) {
      await supabase
        .from("ai_topics")
        .update({ last_error: result.error })
        .eq("id", topic.id);

      report.outcomes.push({
        topicId: topic.id,
        topic: topic.topic,
        status: "failed",
        reason: result.error,
      });
      continue;
    }

    try {
      const slug = await publishDraft(result.data, topic.category_id, delayMinutes);
      published.push(slug);

      // Stamping the time and incrementing the counter in one database call,
      // so two overlapping runs cannot read-modify-write over each other.
      await supabase.rpc("record_topic_generation", { p_topic_id: topic.id });

      report.outcomes.push({
        topicId: topic.id,
        topic: topic.topic,
        status: "published",
        articleSlug: slug,
        unverifiedClaimCount: result.data.unverifiedClaims.length,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Publish failed";
      await supabase.from("ai_topics").update({ last_error: message }).eq("id", topic.id);

      report.outcomes.push({
        topicId: topic.id,
        topic: topic.topic,
        status: "failed",
        reason: message,
      });
    }
  }

  // Tell search engines once, at the end, rather than per article.
  if (published.length && SITE_URL) {
    const { data: rows } = await supabase
      .from("articles")
      .select("slug, categories ( slug )")
      .in("slug", published);

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

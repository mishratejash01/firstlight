import "server-only";

import { Output, generateText } from "ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { ASSIST_MODEL, aiIsConfigured } from "@/lib/ai/config";
import { trendTriageSchema, type TrendTriage } from "@/lib/ai/schemas";
import type { TrendNewsItem } from "./google-trends";

/**
 * Decides whether a trending search term is worth covering.
 *
 * The exclusion list already removed the categories that are never news. This
 * handles the judgement calls it cannot: a footballer's name might be a
 * transfer story or a fixture preview; a company name might be a results
 * announcement or a share-price blip. The headlines Google matched to the term
 * are what make that distinguishable, so they are given to the model as the
 * evidence.
 *
 * Where no model is configured, nothing is guessed. Terms stay `pending` and an
 * editor triages them by hand — a slower newsroom, not a wrong one.
 */

const TRIAGE_SYSTEM = `
You triage trending search terms for a serious general-interest news publication.

You are shown a term people are searching for and the headlines currently
matched to it. Decide whether the publication should write about it.

Treat as NOT newsworthy:
- Box-office totals, TV ratings, streaming numbers
- Share price movements with no underlying event
- Fixture previews, betting tips, fantasy line-ups, ongoing scorelines
- Celebrity relationships, appearance, gossip
- Astrology, numerology, religious calendars
- Product launches that are simply marketing
- Anything the supplied headlines do not actually support

Treat as newsworthy:
- Events with consequences for people beyond those directly involved
- Government, policy, courts, public safety, public health
- Significant business events: results, insolvency, regulation, jobs
- Disasters, conflict, protest
- Sport where the story is beyond the result: governance, doping, finance

Be strict. A publication that chases every trend stops being a publication.
`.trim();

export type TriageResult =
  | { ok: true; triage: TrendTriage }
  | { ok: false; error: string };

export async function triageTrend(input: {
  term: string;
  newsItems: TrendNewsItem[];
  sections: string[];
}): Promise<TriageResult> {
  if (!aiIsConfigured()) {
    return { ok: false, error: "AI assist is not configured." };
  }

  try {
    const headlines = input.newsItems
      .map((item) => `- ${item.source}: ${item.title}`)
      .join("\n");

    const { output } = await generateText({
      model: ASSIST_MODEL,
      system: TRIAGE_SYSTEM,
      prompt: [
        `Trending search term: ${input.term}`,
        headlines ? `\nHeadlines matched to it:\n${headlines}` : "\nNo coverage was matched to this term.",
        `\nAvailable sections: ${input.sections.join(", ")}`,
      ].join("\n"),
      output: Output.object({ schema: trendTriageSchema }),
    });

    return { ok: true, triage: output };
  } catch (error) {
    console.error("[trends] triage failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Triage request failed",
    };
  }
}

export type TriageRunReport = {
  considered: number;
  newsworthy: number;
  rejected: number;
  failed: number;
  skippedNoAi: boolean;
};

/** Triages everything still pending, newest and highest-volume first. */
export async function triagePendingTrends(limit = 20): Promise<TriageRunReport> {
  const supabase = createAdminClient();
  const report: TriageRunReport = {
    considered: 0,
    newsworthy: 0,
    rejected: 0,
    failed: 0,
    skippedNoAi: false,
  };

  if (!aiIsConfigured()) {
    report.skippedNoAi = true;
    return report;
  }

  const [{ data: pending }, { data: categories }] = await Promise.all([
    supabase
      .from("trending_topics")
      .select("id, term, news_items")
      .eq("status", "pending")
      .order("traffic_rank", { ascending: false, nullsFirst: false })
      .limit(limit),
    supabase.from("categories").select("name").eq("is_active", true),
  ]);

  const sections = (categories ?? []).map((c) => c.name);

  for (const row of pending ?? []) {
    report.considered += 1;

    const result = await triageTrend({
      term: row.term,
      newsItems: (row.news_items as unknown as TrendNewsItem[]) ?? [],
      sections,
    });

    if (!result.ok) {
      report.failed += 1;
      // Left pending on purpose. A failed triage is not a rejection, and
      // marking it as one would silently lose the story.
      await supabase
        .from("trending_topics")
        .update({ triage_reason: `Triage failed: ${result.error}` })
        .eq("id", row.id);
      continue;
    }

    const { newsworthy, category, reason } = result.triage;
    if (newsworthy) report.newsworthy += 1;
    else report.rejected += 1;

    await supabase
      .from("trending_topics")
      .update({
        status: newsworthy ? "newsworthy" : "rejected",
        triage_category: category,
        triage_reason: reason,
      })
      .eq("id", row.id);
  }

  return report;
}

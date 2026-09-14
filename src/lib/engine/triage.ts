import "server-only";

import { Output, generateText } from "ai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { aiIsConfigured, runWithChain } from "@/lib/ai/config";
import type { Features } from "./score";
import { recordDecision, snapshotEvent } from "./decisions";

/**
 * Editorial judgement on the events the maths has surfaced.
 *
 * The score says how much is happening around a story: how sharply it
 * broke, how many independent outlets carry it, who led. It cannot say
 * whether it is news. A reality-television eviction and a ceasefire can post
 * the same numbers on the same evening. This is where the distinction is made,
 * once per event, with the evidence laid out — the headlines, the sources, the
 * signal readings — so the decision is made on what is actually known rather
 * than on the title alone.
 *
 * Only events above a score threshold are put to the model. Everything else
 * waits: if it is real, it will climb.
 */

export const eventTriageSchema = z.object({
  newsworthy: z
    .boolean()
    .describe(
      "True only if a serious general-interest publication would assign a reporter to this today.",
    ),
  category: z
    .enum([
      "news",
      "sport_result",
      "entertainment",
      "commerce",
      "astrology",
      "gambling",
      "unverifiable",
      "duplicate",
      "other",
    ])
    .describe("What kind of thing this is, whether or not it is newsworthy."),
  section: z
    .string()
    .describe("The section it belongs in, chosen from the list given. Empty if not newsworthy."),
  urgency: z
    .enum(["breaking", "developing", "standard"])
    .describe(
      "breaking: happening now and consequential. developing: ongoing with new information. standard: reportable but not urgent.",
    ),
  angle: z
    .string()
    .describe(
      "One sentence: what the story actually is, in plain terms, as a brief to a reporter. Empty if not newsworthy.",
    ),
  reason: z.string().describe("One sentence explaining the decision."),
});

export type EventTriage = z.infer<typeof eventTriageSchema>;

const SYSTEM = `
You are the news editor of a serious general-interest publication, deciding
which of the stories the desk's monitoring has surfaced deserve a reporter.

You are shown what the monitoring saw: the headlines from each source, how
sharply attention rose, how many independent outlets are carrying it, and
whether it is close to something already published.

Treat as NOT newsworthy:
- Reality television, celebrity relationships, appearance, gossip, awards chatter
- Fixture previews, betting, fantasy line-ups, ongoing scorelines
- Box-office totals, TV ratings, streaming charts, product marketing
- Share-price moves with no underlying event
- Astrology, numerology, religious calendars, quizzes, listicles
- Anniversaries and "on this day" pieces
- Anything the headlines shown do not actually support
- A story that appears to be the same as one already published (mark duplicate)

Treat as newsworthy:
- Events with consequences for people beyond those directly involved
- Government, policy, courts, elections, public safety, public health
- Conflict, disaster, protest, major accidents
- Significant business: results, insolvency, regulation, jobs, deals
- Science and technology with real-world consequence
- Sport beyond the result: governance, doping, finance, safety
- Artificial intelligence, covered deeply: new models and their capabilities,
  research results, safety and existential-risk warnings from researchers or
  the people running the labs, what Altman, Amodei, Hassabis, Musk, Huang and
  their peers say on the record, regulation, lab funding, and the effects on
  jobs. A model release from a major lab is news, not marketing.
- Startups: funding rounds from Series A up, unicorns, notable founders,
  accelerator cohorts, collapses and acquisitions.

Sections: put anything whose subject is artificial intelligence in AI, even
when a company or a government is the actor; funding rounds, founders and
new companies in Startups; the rest of technology in Technology.

A sharp rise in attention from several independent outlets is evidence of
something happening; it is not on its own evidence that it is news. Be strict.
A publication that chases every spike stops being a publication.

Two rules about your own knowledge:
- Your training predates today. Products, models, companies, office-holders
  and events you have never heard of are the normal case, not a sign of
  fiction. Never reject a story as unverifiable or fictional because it is
  new to you. Judge it by the sources: a lab's own announcement plus an
  established outlet is a real launch.
- What the leaders of the major AI and technology companies say on the
  record — about their products, their rivals, the industry, its risks, its
  timelines or its economics — is news for the AI section, including
  projections and warnings. "Marketing" is a press release nobody
  independent picked up, not a chief executive's public statement.
`.trim();

type CandidateMention = {
  source_kind: string;
  source_key: string;
  title: string;
  url: string | null;
  observed_at: string;
};


function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

function describeSignals(features: Partial<Features>, independent: number): string {
  const f = (key: keyof Features) => Number(features[key] ?? 0);
  return [
    `- burst: ${f("burst").toFixed(1)}/10 (how sharply attention rose against this subject's own baseline)`,
    `- corroboration: ${f("corroboration").toFixed(1)}/10 from ${independent.toFixed(1)} independent sources`,
    `- lead authority: ${f("lead_authority").toFixed(1)}/10 (how reliable the outlets that reported it first are)`,
    `- acceleration: ${f("acceleration").toFixed(1)}/10 (still climbing, or already fading)`,
    `- magnitude: ${f("magnitude").toFixed(1)}/10 (size on each source's own scale)`,
    `- relevance: ${f("relevance").toFixed(1)}/10 (home market share and reader demand)`,
    `- novelty: ${f("novelty").toFixed(1)}/10 (10 means nothing like it has been published; low means we have covered it)`,
  ].join("\n");
}

export async function triageEvent(input: {
  title: string;
  entities: string[];
  firstSeenAt: string;
  regionMix: Record<string, number>;
  features: Partial<Features>;
  independentSources: number;
  mentions: CandidateMention[];
  sections: string[];
  /** Headlines already live on the site, so a repeat can be called a repeat. */
  published?: string[];
}): Promise<
  { ok: true; triage: EventTriage; modelId: string; ms: number } | { ok: false; error: string }
> {
  if (!aiIsConfigured()) return { ok: false, error: "AI assist is not configured." };

  const byKind = new Map<string, CandidateMention[]>();
  for (const mention of input.mentions) {
    const list = byKind.get(mention.source_kind) ?? [];
    list.push(mention);
    byKind.set(mention.source_kind, list);
  }

  const evidence = [...byKind.entries()]
    .map(([kind, mentions]) => {
      const lines = mentions
        .slice(0, 8)
        .map((m) => `  - [${m.source_key}] ${m.title} (${minutesAgo(m.observed_at)} min ago)`)
        .join("\n");
      return `${kind}:\n${lines}`;
    })
    .join("\n");

  const regions = Object.entries(input.regionMix)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([region, share]) => `${region} ${(share * 100).toFixed(0)}%`)
    .join(", ");

  const prompt = [
    `Story as clustered: ${input.title}`,
    input.entities.length ? `Entities: ${input.entities.slice(0, 10).join(", ")}` : "",
    `First seen ${minutesAgo(input.firstSeenAt)} minutes ago.`,
    regions ? `Regions: ${regions}` : "",
    `\nWhat each source is saying:\n${evidence || "  (no headlines captured)"}`,
    `\nSignal readings:\n${describeSignals(input.features, input.independentSources)}`,
    input.published?.length
      ? `\nAlready published on our site in the last day (mark a repeat of any of these as duplicate):\n${input.published.map((h) => `  - ${h}`).join("\n")}`
      : "",
    `\nAvailable sections: ${input.sections.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const startedAt = Date.now();
    return await runWithChain("assist", async (model, entry) => {
      const { output } = await generateText({
        model,
        maxRetries: 0,
        system: SYSTEM,
        prompt,
        output: Output.object({ schema: eventTriageSchema }),
      });
      return { ok: true as const, triage: output, modelId: entry.modelId, ms: Date.now() - startedAt };
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Triage request failed" };
  }
}

export type TriageReport = {
  considered: number;
  newsworthy: number;
  rejected: number;
  failed: number;
  skippedNoAi: boolean;
  /** Which model answered each event, and how long it took. */
  timings: { title: string; modelId: string; ms: number; verdict: string }[];
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
 * Triages the strongest untriaged events, and re-examines rejected ones that
 * have since grown well past the score they were rejected at. The second case
 * is what turns "a minor incident, not news" into a story when it stops being
 * minor.
 */
export async function triageCandidates(
  limit = 6,
  deadline: number = Number.POSITIVE_INFINITY,
): Promise<TriageReport> {
  const supabase = createAdminClient();
  const report: TriageReport = {
    considered: 0,
    newsworthy: 0,
    rejected: 0,
    failed: 0,
    skippedNoAi: false,
    timings: [],
  };

  if (!aiIsConfigured()) {
    report.skippedNoAi = true;
    return report;
  }

  const threshold = await readSetting<number>("engine_triage_threshold", 25);
  const beatThreshold = await readSetting<number>("engine_beat_triage_threshold", 10);
  const windowHours = await readSetting<number>("engine_event_window_hours", 48);
  // Only what the desk could still write. Triaging a story that is already
  // too old to publish spends a model call on nothing.
  const maxAgeHours = await readSetting<number>("engine_max_story_age_hours", 8);
  const since = new Date(
    Date.now() - Math.min(windowHours, maxAgeHours > 0 ? maxAgeHours : windowHours) * 3600_000,
  ).toISOString();

  // The model's free allowance is a daily figure; spending it all before
  // lunch means no triage at all in the evening. Candidates above the budget
  // wait, and the strongest still go first when the hour turns.
  const budget = await readSetting<number>("engine_triage_hourly_budget", 40);
  const { count: usedThisHour } = await supabase
    .from("story_events")
    .select("id", { count: "exact", head: true })
    .gte("triaged_at", new Date(Date.now() - 3600_000).toISOString());
  const room = Math.max(budget - (usedThisHour ?? 0), 0);
  if (room === 0) return report;
  limit = Math.min(limit, room);

  // Standing beats are wanted in depth, so their events go to triage from a
  // lower score: a single TechCrunch report of a model release is worth the
  // model's opinion where a single report of a council meeting is not.
  const { data: beatMentions } = await supabase
    .from("signal_mentions")
    .select("event_id")
    .not("raw->beat", "is", null)
    .gte("observed_at", since)
    .limit(5000);
  const beatIds = [...new Set((beatMentions ?? []).map((m) => m.event_id).filter((id): id is string => Boolean(id)))];

  const { data: onBeat } = beatIds.length
    ? await supabase
        .from("story_events")
        .select(
          "id, title, entities, first_seen_at, region_mix, score, score_breakdown, independent_sources",
        )
        .eq("status", "candidate")
        .is("triaged_at", null)
        .gte("score", beatThreshold)
        .gte("first_seen_at", since)
        .in("id", beatIds.slice(0, 500))
        .order("score", { ascending: false })
        .limit(limit)
    : { data: [] };

  // The fast lane: events the earliness model expects to become big go to
  // triage at the beat threshold, whatever their beat.
  const fastLaneThreshold = await readSetting<number>("engine_fast_lane_threshold", 0.5);
  const { data: fastLane } = await supabase
    .from("story_events")
    .select(
      "id, title, entities, first_seen_at, region_mix, score, score_breakdown, independent_sources",
    )
    .eq("status", "candidate")
    .is("triaged_at", null)
    .gte("p_big", fastLaneThreshold)
    .gte("score", beatThreshold)
    .gte("first_seen_at", since)
    .order("p_big", { ascending: false })
    .limit(limit);

  const [{ data: fresh }, { data: grown }, { data: categories }] = await Promise.all([
    supabase
      .from("story_events")
      .select(
        "id, title, entities, first_seen_at, region_mix, score, score_breakdown, independent_sources",
      )
      .eq("status", "candidate")
      .is("triaged_at", null)
      .gte("score", threshold)
      .gte("first_seen_at", since)
      .order("score", { ascending: false })
      .limit(limit),
    supabase
      .from("story_events")
      .select(
        "id, title, entities, first_seen_at, region_mix, score, score_breakdown, independent_sources, triaged_score",
      )
      .eq("status", "rejected")
      .not("triaged_score", "is", null)
      .gte("score", threshold)
      .gte("first_seen_at", since)
      .order("score", { ascending: false })
      .limit(limit),
    supabase.from("categories").select("name").eq("is_active", true),
  ]);

  const sections = (categories ?? []).map((c) => c.name);

  const { data: recent } = await supabase
    .from("articles")
    .select("headline")
    .in("status", ["published", "scheduled"])
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(60);
  const published = (recent ?? []).map((r) => r.headline);

  // The desk's own exclusion list — horoscopes, betting, lottery draws —
  // curated on the trends page. A match is a verdict that needs no model.
  const { data: exclusions } = await supabase.from("trend_exclusions").select("pattern");
  const patterns = (exclusions ?? []).map((row) => row.pattern.toLowerCase()).filter(Boolean);

  const regrown = (grown ?? []).filter(
    (event) => Number(event.score) >= Number(event.triaged_score) * 1.5 + 5,
  );

  const seenIds = new Set<string>();
  const queue = [...(fastLane ?? []), ...(onBeat ?? []), ...(fresh ?? []), ...regrown]
    .filter((event) => (seenIds.has(event.id) ? false : (seenIds.add(event.id), true)))
    .slice(0, limit);

  for (const event of queue) {
    // A slow model must not eat the writer's share of the run. Whatever is
    // left untriaged is still there next time.
    if (Date.now() > deadline) break;
    report.considered += 1;

    const excludedBy = patterns.find((pattern) => event.title.toLowerCase().includes(pattern));
    if (excludedBy) {
      report.rejected += 1;
      await supabase
        .from("story_events")
        .update({
          status: "rejected",
          triage_category: "other",
          triage_reason: `Matched the exclusion "${excludedBy}".`,
          triaged_at: new Date().toISOString(),
          triaged_score: event.score,
        })
        .eq("id", event.id);
      await recordDecision(event.id, "triage_excluded", {
        score: Number(event.score),
        reason: `Matched the exclusion "${excludedBy}".`,
      });
      continue;
    }

    const { data: mentions } = await supabase
      .from("signal_mentions")
      .select("source_kind, source_key, title, url, observed_at")
      .eq("event_id", event.id)
      .order("observed_at", { ascending: true })
      .limit(40);

    const breakdown = (event.score_breakdown as { features?: Partial<Features> } | null) ?? {};

    // What the engine saw when it asked. The fit learns from this, not from
    // what the event looks like once a verdict exists.
    await snapshotEvent(event.id, "triage");

    const result = await triageEvent({
      title: event.title,
      entities: event.entities ?? [],
      firstSeenAt: event.first_seen_at,
      regionMix: (event.region_mix as Record<string, number> | null) ?? {},
      features: breakdown.features ?? {},
      independentSources: Number(event.independent_sources ?? 0),
      mentions: (mentions ?? []) as CandidateMention[],
      sections,
      published,
    });

    if (!result.ok) {
      report.failed += 1;
      // Left untriaged so the next run tries again. A model outage is not a
      // verdict on the story.
      await supabase
        .from("story_events")
        .update({ last_error: `Triage failed: ${result.error}` })
        .eq("id", event.id);
      await recordDecision(event.id, "triage_failed", { score: Number(event.score), reason: result.error });
      continue;
    }

    const { triage } = result;
    if (triage.newsworthy) report.newsworthy += 1;
    else report.rejected += 1;
    report.timings.push({
      title: event.title.slice(0, 60),
      modelId: result.modelId,
      ms: result.ms,
      verdict: triage.newsworthy ? "newsworthy" : triage.category,
    });

    await supabase
      .from("story_events")
      .update({
        status: triage.newsworthy ? "newsworthy" : "rejected",
        triage_category: triage.category,
        triage_reason: triage.reason,
        triage_section: triage.newsworthy ? triage.section || null : null,
        triage_angle: triage.newsworthy ? triage.angle || null : null,
        urgency: triage.urgency,
        triaged_at: new Date().toISOString(),
        triaged_score: event.score,
        last_error: null,
      })
      .eq("id", event.id);
    await recordDecision(event.id, triage.newsworthy ? "triage_accept" : "triage_reject", {
      score: Number(event.score),
      reason: triage.reason,
      details: {
        category: triage.category,
        section: triage.newsworthy ? triage.section || null : null,
        urgency: triage.urgency,
        modelId: result.modelId,
        ms: result.ms,
      },
    });
  }

  return report;
}

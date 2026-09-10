import "server-only";

import { Output, generateText } from "ai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { aiIsConfigured, modelChain } from "@/lib/ai/config";
import type { Features } from "./score";

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

A sharp rise in attention from several independent outlets is evidence of
something happening; it is not on its own evidence that it is news. Be strict.
A publication that chases every spike stops being a publication.
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
}): Promise<{ ok: true; triage: EventTriage } | { ok: false; error: string }> {
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
    `\nAvailable sections: ${input.sections.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  let lastError = "Triage model unavailable.";
  for (const model of modelChain("assist")) {
    try {
      const { output } = await generateText({
        model,
        maxRetries: 1,
        system: SYSTEM,
        prompt,
        output: Output.object({ schema: eventTriageSchema }),
      });
      return { ok: true, triage: output };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Triage request failed";
      console.warn("[engine] triage model failed, stepping down", lastError);
    }
  }

  return { ok: false, error: lastError };
}

export type TriageReport = {
  considered: number;
  newsworthy: number;
  rejected: number;
  failed: number;
  skippedNoAi: boolean;
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
  };

  if (!aiIsConfigured()) {
    report.skippedNoAi = true;
    return report;
  }

  const threshold = await readSetting<number>("engine_triage_threshold", 25);
  const windowHours = await readSetting<number>("engine_event_window_hours", 48);
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();

  const [{ data: fresh }, { data: grown }, { data: categories }] = await Promise.all([
    supabase
      .from("story_events")
      .select(
        "id, title, entities, first_seen_at, region_mix, score, score_breakdown, independent_sources",
      )
      .eq("status", "candidate")
      .is("triaged_at", null)
      .gte("score", threshold)
      .gte("last_seen_at", since)
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
      .gte("last_seen_at", since)
      .order("score", { ascending: false })
      .limit(limit),
    supabase.from("categories").select("name").eq("is_active", true),
  ]);

  const sections = (categories ?? []).map((c) => c.name);

  const regrown = (grown ?? []).filter(
    (event) => Number(event.score) >= Number(event.triaged_score) * 1.5 + 5,
  );

  const queue = [...(fresh ?? []), ...regrown].slice(0, limit);

  for (const event of queue) {
    // A slow model must not eat the writer's share of the run. Whatever is
    // left untriaged is still there next time.
    if (Date.now() > deadline) break;
    report.considered += 1;

    const { data: mentions } = await supabase
      .from("signal_mentions")
      .select("source_kind, source_key, title, url, observed_at")
      .eq("event_id", event.id)
      .order("observed_at", { ascending: true })
      .limit(40);

    const breakdown = (event.score_breakdown as { features?: Partial<Features> } | null) ?? {};

    const result = await triageEvent({
      title: event.title,
      entities: event.entities ?? [],
      firstSeenAt: event.first_seen_at,
      regionMix: (event.region_mix as Record<string, number> | null) ?? {},
      features: breakdown.features ?? {},
      independentSources: Number(event.independent_sources ?? 0),
      mentions: (mentions ?? []) as CandidateMention[],
      sections,
    });

    if (!result.ok) {
      report.failed += 1;
      // Left untriaged so the next run tries again. A model outage is not a
      // verdict on the story.
      await supabase
        .from("story_events")
        .update({ last_error: `Triage failed: ${result.error}` })
        .eq("id", event.id);
      continue;
    }

    const { triage } = result;
    if (triage.newsworthy) report.newsworthy += 1;
    else report.rejected += 1;

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
  }

  return report;
}

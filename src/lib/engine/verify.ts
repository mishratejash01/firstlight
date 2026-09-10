import "server-only";

import { Output, generateText } from "ai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { aiIsConfigured, modelChain } from "@/lib/ai/config";

/**
 * The verification gate: how sure do we need to be before we write?
 *
 * The answer depends on what is being claimed. "Arsenal won 2-1" needs one
 * source. "Forty people died" or "the minister took a bribe" needs several,
 * independent, and authoritative — because being wrong about the first is a
 * correction, and being wrong about the second is a libel action or a
 * retraction that the publication does not recover from.
 *
 * This is the speed-versus-accuracy trade made explicit. Rather than one
 * global threshold that is too slow for sport and too fast for deaths, the
 * threshold scales with the severity of the claims actually in the story.
 */

const claimsSchema = z.object({
  severity: z
    .enum(["low", "medium", "high"])
    .describe(
      "high: deaths, injuries, crimes, accusations against named people, market-moving figures. medium: policy, disputes, significant money, court cases. low: sport results, culture, routine announcements.",
    ),
  claims: z
    .array(
      z.object({
        text: z.string().describe("One factual claim, stated plainly."),
        severity: z.enum(["low", "medium", "high"]),
        supportedBy: z
          .array(z.number())
          .describe("Indices of the sources (1-based) that state this claim."),
        contradictedBy: z
          .array(z.number())
          .describe("Indices of sources that state something incompatible. Empty if none."),
      }),
    )
    .describe("The specific factual claims the sources make, at most twelve."),
  summary: z.string().describe("What the story is, in one sentence."),
});

export type Verification = z.infer<typeof claimsSchema> & {
  passed: boolean;
  reason: string;
  requiredSources: number;
  independentSources: number;
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
 * Decides whether an event may be written, and records why.
 *
 * `documents` are the source texts the writer will draft from. The claims are
 * extracted from them rather than from headlines, because a headline asserts
 * one thing and an article asserts thirty, and the thirty are what end up in
 * our copy.
 */
export async function verifyEvent(input: {
  eventId: string;
  title: string;
  independentSources: number;
  documents: { source: string; title: string | null; content: string }[];
}): Promise<Verification> {
  const supabase = createAdminClient();
  const minHigh = await readSetting<number>("engine_min_independent_sources_high", 3);
  const minMedium = await readSetting<number>("engine_min_independent_sources_medium", 2);

  const unavailable = (reason: string): Verification => ({
    severity: "high",
    claims: [],
    summary: input.title,
    passed: false,
    reason,
    requiredSources: minHigh,
    independentSources: input.independentSources,
  });

  if (!aiIsConfigured()) return unavailable("No model configured for verification.");
  if (!input.documents.length) return unavailable("No source text to verify against.");

  const sourceBlock = input.documents
    .map(
      (doc, index) =>
        `### Source ${index + 1} — ${doc.source}\n${doc.title ? `Headline: ${doc.title}\n` : ""}${doc.content.slice(0, 5000)}`,
    )
    .join("\n\n---\n\n");

  let extracted: z.infer<typeof claimsSchema> | null = null;

  for (const model of modelChain("assist")) {
    try {
      const { output } = await generateText({
        model,
        // No retries on one model: a rate-limited model stays rate-limited for
        // longer than a retry waits, and the next model in the chain is right there.
        maxRetries: 0,
        system: `You are a fact desk. Extract the specific factual claims these sources make
about the story, grade the severity of each, and note which sources support or
contradict it. Be literal: a claim is supported by a source only if that source
actually states it. Grade the story's overall severity by its most serious
supported claim.`,
        prompt: `Story: ${input.title}\n\n${sourceBlock}`,
        output: Output.object({ schema: claimsSchema }),
      });
      extracted = output;
      break;
    } catch (error) {
      console.warn("[verify] model failed, stepping down", error instanceof Error ? error.message : error);
    }
  }

  if (!extracted) return unavailable("Verification model unavailable.");

  const required =
    extracted.severity === "high" ? minHigh : extracted.severity === "medium" ? minMedium : 1;

  // Any high-severity claim that a source contradicts fails the gate outright,
  // regardless of how many sources support it. Disputed death tolls are
  // reported as disputed, not picked from.
  const contested = extracted.claims.filter(
    (claim) => claim.severity === "high" && claim.contradictedBy.length > 0,
  );

  let passed = input.independentSources >= required;
  let reason = passed
    ? `${extracted.severity} severity; ${input.independentSources.toFixed(1)} independent sources against ${required} required.`
    : `${extracted.severity} severity needs ${required} independent sources; have ${input.independentSources.toFixed(1)}.`;

  if (contested.length) {
    passed = false;
    reason = `${contested.length} high-severity claim(s) are contradicted between sources: "${contested[0].text.slice(0, 80)}".`;
  }

  const verification: Verification = {
    ...extracted,
    passed,
    reason,
    requiredSources: required,
    independentSources: input.independentSources,
  };

  await supabase
    .from("story_events")
    .update({
      severity: extracted.severity,
      verification: verification as never,
    })
    .eq("id", input.eventId);

  return verification;
}

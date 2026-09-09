import "server-only";

import { Output, generateText } from "ai";
import type { z } from "zod";

import { AI_UNAVAILABLE_MESSAGE, aiIsConfigured, modelChain } from "./config";
import {
  draftedArticleSchema,
  headlineSuggestionSchema,
  summarySchema,
  tagSuggestionSchema,
  type DraftedArticle,
} from "./schemas";

/**
 * Editorial AI assist.
 *
 * Everything here produces a draft. Nothing it returns is written to a
 * published article, and nothing it returns bypasses the review queue — that is
 * enforced by the articles RLS policy, not by this file being careful.
 *
 * On free-form drafting: asked for an article on a topic alone, a model has no
 * documents, no interviews and no way to check anything. It will produce fluent
 * prose containing specific-sounding names, figures and quotations that are
 * plausible rather than true. The system prompt therefore requires it to
 * enumerate every such claim in `unverifiedClaims`, and the editor UI shows
 * that list before anything else. That does not make the output verified; it
 * makes the verification work visible instead of invisible.
 */

const HOUSE_STYLE = `
Write like a good journalist who actually understands the story. Not like a
model summarising one.

Voice
- Clear and conversational. Say things the way a person would explain them out
  loud to someone who asked.
- Confident and informed, but human. You are telling someone what happened and
  why it matters.
- Proper grammar and normal punctuation throughout. Natural does not mean sloppy.

Rhythm
- Vary sentence length. Some short and direct. Others longer, where the context
  genuinely needs the room.
- Do not make every sentence technically perfect and evenly weighted. Prose
  where every line is the same length and shape reads as machine-made, because
  it usually is.

Structure
- Lead with the actual news. Not background, not a scene, not a general
  statement about the topic. The thing that happened goes first.
- Every paragraph should move the story forward and have one clear job. When the
  thought or the information changes, break.
- Keep paragraphs short enough to read on a phone, but do not chop everything
  into one-line fragments for effect. Let the breaks fall where the meaning
  changes.
- Add context where a reader would otherwise be lost. Do not explain what any
  reader already knows.

Specifics
- Use names, numbers, dates, places and direct quotes wherever you have them.
  They are what makes a piece worth reading.
- Do not pad a specific detail with wording that adds nothing around it.
- If something is uncertain or still developing, say so the way a reporter
  would — "it is not yet clear whether", "the company has not said" — rather
  than attaching a formal disclaimer.

Do not write like this
- Generic openings that could sit on top of any story.
- Context dumps before the news.
- Predictable transitions: "moreover", "furthermore", "in conclusion",
  "it is worth noting", "as the situation continues to develop".
- Words reached for because they sound professional: "delve", "landscape",
  "navigate", "testament", "crucial", "pivotal", "underscores", "highlights the
  importance of", "in an era of".
- A closing paragraph that restates what you just said.
- Both-sides padding where there is no genuine second side.
- Sentences built to be technically correct rather than to be read.

Attribute every claim to whoever made it. British spelling and punctuation,
sentence case headlines.

Before you finish: read it back as an editor about to publish it. Any sentence
that sounds robotic, over-formal, repetitive, or like something a model would
produce, rewrite until it reads like a person wrote it.
`.trim();

const HONESTY_RULE = `
You have no access to sources, documents, interviews or the live web. You cannot
verify anything.

Therefore:
- Do not present invented specifics as established fact in the prose. Where a
  real story would carry a name, figure or quotation you do not have, write the
  sentence so the gap is explicit — "officials have not said how many", "the
  figure has not been published" — rather than filling it with something
  plausible.
- List EVERY unverifiable specific in unverifiedClaims. Names, numbers, dates,
  quotations, institutional attributions. If you are not certain it is true and
  current, it belongs in that list.
- An honest draft with visible gaps is useful to an editor. A polished draft
  full of invented detail is worse than nothing, because the invention is
  indistinguishable from the reporting.
`.trim();

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Overload and rate limiting are worth stepping down a model for; nothing else is. */
function isCapacityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("resource_exhausted") ||
    message.includes("429") ||
    message.includes("503")
  );
}

/**
 * Generates structured output, stepping down the model chain on capacity
 * failures.
 *
 * Free-tier capacity is shared and genuinely does run out — "this model is
 * currently experiencing high demand" is an observed response, not a
 * hypothetical. An unattended scheduler that treats that as a hard failure
 * simply stops working for a while and reports nothing useful.
 *
 * Only capacity errors step down. A malformed schema or a bad prompt fails
 * identically on every model, so retrying it three times only makes the failure
 * slower to find.
 */
async function generateStructured<S extends z.ZodTypeAny>(
  kind: "drafting" | "assist",
  options: { system: string; prompt: string; schema: S },
): Promise<z.infer<S>> {
  const models = modelChain(kind);
  let lastError: unknown;

  for (const model of models) {
    try {
      const { output } = await generateText({
        model,
        system: options.system,
        prompt: options.prompt,
        output: Output.object({ schema: options.schema }),
        // One attempt per model. The SDK's default of three means a model that
        // is out of capacity is retried for close to a minute before the chain
        // moves on, which is the slow way to reach the same answer.
        maxRetries: 1,
      });
      return output as z.infer<S>;
    } catch (error) {
      lastError = error;
      if (!isCapacityError(error)) throw error;
      console.warn(
        "[ai] model at capacity, stepping down:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw lastError ?? new Error("Every model in the chain failed.");
}

async function guarded<T>(run: () => Promise<T>): Promise<AiResult<T>> {
  if (!aiIsConfigured()) return { ok: false, error: AI_UNAVAILABLE_MESSAGE };

  try {
    return { ok: true, data: await run() };
  } catch (error) {
    console.error("[ai] request failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? `The model could not complete that: ${error.message}`
          : "The model could not complete that request.",
    };
  }
}

/**
 * Drafts a full article from a topic.
 *
 * `sourceMaterial` is optional. When supplied — a press release, a transcript,
 * notes from a call — the model is told to work only from it, which is the only
 * mode where the output can actually be grounded.
 */
export async function draftArticle({
  topic,
  angle,
  sourceMaterial,
  sectionName,
}: {
  topic: string;
  angle?: string;
  sourceMaterial?: string;
  sectionName?: string;
}): Promise<AiResult<DraftedArticle>> {
  return guarded(async () => {
    const grounded = Boolean(sourceMaterial?.trim());

    const system = [
      HOUSE_STYLE,
      grounded
        ? `Work ONLY from the source material provided. Do not add facts that are not in it. Anything you infer rather than read belongs in unverifiedClaims.`
        : HONESTY_RULE,
    ].join("\n\n");

    const prompt = [
      `Topic: ${topic}`,
      angle ? `Angle the editor wants: ${angle}` : "",
      sectionName ? `Section: ${sectionName}` : "",
      grounded ? `\nSource material:\n"""\n${sourceMaterial!.trim()}\n"""` : "",
      `\nWrite the draft. Aim for 450–700 words of body copy.`,
    ]
      .filter(Boolean)
      .join("\n");

    return generateStructured("drafting", {
      system,
      prompt,
      schema: draftedArticleSchema,
    });
  });
}

/** Suggests topic tags for an existing draft. */
export async function suggestTags(input: {
  headline: string;
  body: string;
  existingTags: string[];
}): Promise<AiResult<string[]>> {
  return guarded(async () => {
    const output = await generateStructured("assist", {
      system:
        "Suggest topic tags for a news article. Prefer tags that already exist in the publication's list over inventing near-duplicates.",
      prompt: [
        `Headline: ${input.headline}`,
        `Body:\n${input.body.slice(0, 6000)}`,
        input.existingTags.length
          ? `Tags already in use on this publication: ${input.existingTags.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: tagSuggestionSchema,
    });

    return output.tags;
  });
}

/** Offers alternative headlines for an existing draft. */
export async function suggestHeadlines(input: {
  headline: string;
  body: string;
}): Promise<AiResult<string[]>> {
  return guarded(async () => {
    const output = await generateStructured("assist", {
      system: `${HOUSE_STYLE}\n\nSuggest headlines only. Every one must be supported by the body copy — do not promise anything the piece does not deliver.`,
      prompt: `Current headline: ${input.headline}\n\nBody:\n${input.body.slice(0, 6000)}`,
      schema: headlineSuggestionSchema,
    });

    return output.headlines;
  });
}

/** Writes the review-queue summary and a standfirst for an existing draft. */
export async function summariseForQueue(input: {
  headline: string;
  body: string;
}): Promise<AiResult<{ summary: string; standfirst: string }>> {
  return guarded(async () => {
    return generateStructured("assist", {
      system: `${HOUSE_STYLE}\n\nSummarise only what the body actually says. Add nothing.`,
      prompt: `Headline: ${input.headline}\n\nBody:\n${input.body.slice(0, 8000)}`,
      schema: summarySchema,
    });
  });
}

/**
 * Drafts an article about a trending story, from the coverage matched to it.
 *
 * This is the grounded path, and it is materially safer than drafting from a
 * topic alone: the model is given real headlines from named outlets published
 * today, and told to write about what is being reported rather than to report
 * itself. It cannot know more than those headlines contain, so it is instructed
 * to say so where they run out — and to attribute every claim to the outlet it
 * came from, inline, as a link.
 *
 * The result is an aggregation piece: our own synthesis of what several outlets
 * are reporting, credited to them. That is a legitimate form and a very
 * different thing from reproducing their copy.
 */
export async function draftFromTrend({
  term,
  newsItems,
  sectionName,
  angle,
}: {
  term: string;
  newsItems: { title: string; source: string; url: string }[];
  sectionName?: string;
  angle?: string;
}): Promise<AiResult<DraftedArticle>> {
  return guarded(async () => {
    const system = [
      HOUSE_STYLE,
      `
You are writing about a story currently being reported by other outlets. You
have their headlines and nothing more — not the articles themselves.

Rules, without exception:
- Attribute every factual claim to the outlet reporting it, in the prose, as a
  Markdown link: "according to [the BBC](url)".
- Write only what the supplied headlines support. Where an obvious question is
  unanswered by them, say that it is unanswered — do not fill it in.
- Invent no quotations. You have none.
- Invent no figures. If a headline carries a number, attribute it; if it does
  not, do not produce one.
- Open by stating what is being reported and by whom. Do not open with scene
  setting you cannot have witnessed.
- List in unverifiedClaims anything you inferred rather than read in a headline.

An honest short piece that credits its sources is the goal. A long one padded
with invention is a failure however well it reads.
      `.trim(),
    ].join("\n\n");

    const coverage = newsItems
      .map((item) => `- ${item.source}: "${item.title}"  ${item.url}`)
      .join("\n");

    const prompt = [
      `People are searching for: ${term}`,
      sectionName ? `Section: ${sectionName}` : "",
      angle ? `Angle: ${angle}` : "",
      `\nCoverage currently reported by other outlets:\n${coverage}`,
      `\nWrite the piece. 250–450 words is usually right for this — you have headlines, not documents.`,
    ]
      .filter(Boolean)
      .join("\n");

    return generateStructured("drafting", {
      system,
      prompt,
      schema: draftedArticleSchema,
    });
  });
}

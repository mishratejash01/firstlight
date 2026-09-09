import "server-only";

import { Output, generateText } from "ai";

import {
  AI_UNAVAILABLE_MESSAGE,
  ASSIST_MODEL,
  DRAFTING_MODEL,
  aiIsConfigured,
} from "./config";
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
You are drafting for a general-interest news publication.

House style:
- Sentence case headlines. No teasers, no questions, no colons splicing two ideas.
- The standfirst adds information; it never restates the headline.
- Plain language. No "delve", "landscape", "navigate", "testament", "crucial", "moreover".
- Attribute every claim in the prose to whoever made it.
- Structure the body with ## headings that mirror how a reader would phrase a
  search: what happened, who is involved, what happens next, key numbers.
- British spelling and punctuation.
- Never write a concluding paragraph that summarises what you just said.
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

    const { output } = await generateText({
      model: DRAFTING_MODEL,
      system,
      prompt,
      output: Output.object({ schema: draftedArticleSchema }),
    });

    return output;
  });
}

/** Suggests topic tags for an existing draft. */
export async function suggestTags(input: {
  headline: string;
  body: string;
  existingTags: string[];
}): Promise<AiResult<string[]>> {
  return guarded(async () => {
    const { output } = await generateText({
      model: ASSIST_MODEL,
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
      output: Output.object({ schema: tagSuggestionSchema }),
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
    const { output } = await generateText({
      model: ASSIST_MODEL,
      system: `${HOUSE_STYLE}\n\nSuggest headlines only. Every one must be supported by the body copy — do not promise anything the piece does not deliver.`,
      prompt: `Current headline: ${input.headline}\n\nBody:\n${input.body.slice(0, 6000)}`,
      output: Output.object({ schema: headlineSuggestionSchema }),
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
    const { output } = await generateText({
      model: ASSIST_MODEL,
      system: `${HOUSE_STYLE}\n\nSummarise only what the body actually says. Add nothing.`,
      prompt: `Headline: ${input.headline}\n\nBody:\n${input.body.slice(0, 8000)}`,
      output: Output.object({ schema: summarySchema }),
    });

    return output;
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

    const { output } = await generateText({
      model: DRAFTING_MODEL,
      system,
      prompt,
      output: Output.object({ schema: draftedArticleSchema }),
    });

    return output;
  });
}

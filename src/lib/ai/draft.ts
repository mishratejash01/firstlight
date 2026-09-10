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
/**
 * Undoes a layer of JSON escaping the model sometimes leaves inside its
 * strings.
 *
 * Structured output occasionally arrives double-escaped: the body carries a
 * literal backslash-n where a newline should be, and a literal \u2019 where
 * an apostrophe should be. Parsed, that is a valid string, so nothing
 * downstream objects, and the article renders with the escapes showing.
 * Unicode escapes are never intended in prose and are always decoded; the
 * newline and quote escapes are decoded only when the text has no real
 * newlines, which is the signature of the double-escaped case.
 */
function unescapeModelText(text: string): string {
  if (!text.includes("\\")) return text;

  let out = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  if (!out.includes("\n")) {
    out = out
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "")
      .replace(/\\"/g, "\"")
      .replace(/\\\//g, "/")
      .replace(/\\\\/g, "\\");
  }
  return out;
}

function unescapeDeep<T>(value: T): T {
  if (typeof value === "string") return unescapeModelText(value) as T;
  if (Array.isArray(value)) return value.map(unescapeDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, unescapeDeep(v)]),
    ) as T;
  }
  return value;
}

async function generateStructured<S extends z.ZodTypeAny>(
  kind: "drafting" | "assist",
  options: { system: string; prompt: string; schema: S },
): Promise<z.infer<S>> {
  const models = modelChain(kind);
  let lastError: unknown;

  for (const model of models) {
    try {
      const { output, finishReason } = await generateText({
        model,
        system: options.system,
        prompt: options.prompt,
        output: Output.object({ schema: options.schema }),
        // One attempt per model. The SDK's default of three means a model that
        // is out of capacity is retried for close to a minute before the chain
        // moves on, which is the slow way to reach the same answer.
        maxRetries: 1,
        // Generous, because reasoning tokens are drawn from the same budget as
        // the text. A long source article plus a model that thinks before it
        // writes will otherwise hit the ceiling mid-article.
        maxOutputTokens: 12_000,
      });

      // A response cut off at the token limit still parses, because the schema
      // fills in what it can — so it arrives looking like a valid article that
      // simply stops mid-sentence. Publishing that is worse than failing.
      if (finishReason === "length") {
        throw new Error("Model hit the output limit and returned a truncated article.");
      }

      return unescapeDeep(output) as z.infer<S>;
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
  documents,
  sectionName,
  angle,
}: {
  term: string;
  newsItems: { title: string; source: string; url: string }[];
  /**
   * Full text read from the linked articles, where it could be fetched. This is
   * what separates a real piece from a paragraph noting that other outlets are
   * covering something.
   */
  documents?: {
    url: string;
    source: string;
    title: string | null;
    byline: string | null;
    content: string;
  }[];
  sectionName?: string;
  angle?: string;
}): Promise<AiResult<DraftedArticle>> {
  return guarded(async () => {
    const sourced = documents?.filter((doc) => doc.content.trim().length > 0) ?? [];
    const hasFullText = sourced.length > 0;

    const groundingRule = hasFullText
      ? `
You have been given the full text of articles other outlets have published on
this story. Write our own piece from them.

Rules, without exception:
- Write original prose. Do not reproduce sentences or phrasing from the sources;
  say it in our own words. Reproducing their copy is not reporting, it is
  copying, and it is the one thing that will get this publication sued.
- Attribute every fact to the outlet that reported it, in the prose, as a
  Markdown link: "according to [the BBC](url)".
- You may quote a source directly where the wording matters, but keep it short,
  put it in quotation marks, and attribute it in the same sentence.
- Use the specifics the sources give you: names, numbers, dates, places. That is
  the whole point of having read them.
- Where the sources disagree, say so and attribute both.
- Where an obvious question is unanswered by all of them, say it is unanswered.
- List in unverifiedClaims anything you inferred rather than read.
        `.trim()
      : `
You have headlines only, not the articles behind them.

Rules, without exception:
- Attribute every claim to the outlet reporting it, as a Markdown link.
- Write only what the headlines support. Where an obvious question is
  unanswered, say so — do not fill it in.
- Invent no quotations and no figures. You have none.
- Keep it short. You do not have the material for a long piece, and padding one
  out is worse than filing three honest paragraphs.
- List in unverifiedClaims anything you inferred rather than read.
        `.trim();

    const system = [HOUSE_STYLE, groundingRule].join("\n\n");

    const coverage = newsItems
      .map((item) => `- ${item.source}: "${item.title}"  ${item.url}`)
      .join("\n");

    const fullText = sourced
      .map(
        (doc, index) =>
          [
            `### Source ${index + 1} — ${doc.source}`,
            doc.title ? `Headline: ${doc.title}` : "",
            doc.byline ? `Byline: ${doc.byline}` : "",
            `Link: ${doc.url}`,
            "",
            doc.content,
          ]
            .filter(Boolean)
            .join("\n"),
      )
      .join("\n\n---\n\n");

    const prompt = [
      `People are searching for: ${term}`,
      sectionName ? `Section: ${sectionName}` : "",
      angle ? `Angle: ${angle}` : "",
      coverage ? `\nHeadlines matched to this story:\n${coverage}` : "",
      hasFullText
        ? `\nFull text of what those outlets published:\n\n${fullText}`
        : "",
      hasFullText
        ? `\nWrite the piece. 400-650 words. You have real material — use the specifics.`
        : `\nWrite the piece. 200-350 words. You have headlines, not documents, so keep it short and honest.`,
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

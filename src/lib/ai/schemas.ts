import { z } from "zod";

/**
 * Shapes the AI is allowed to return.
 *
 * These schemas are not decoration — the model output is validated against them
 * before anything reaches the database, so a malformed or truncated response
 * fails loudly instead of writing half an article into a draft.
 */

export const draftedArticleSchema = z.object({
  headline: z.string().describe("Sentence case. Specific and concrete, never a teaser."),
  headlineAlternatives: z
    .array(z.string())
    .describe("Two further headline options for the editor to choose from."),
  standfirst: z.string().describe("One line under the headline. Adds information, does not repeat it."),
  summary: z.string().describe("Two or three sentences for the editor reading the review queue."),
  bodyMarkdown: z
    .string()
    .describe(
      "The article in Markdown. Use ## headings that mirror how readers phrase searches — what happened, who is involved, what happens next, key numbers.",
    ),
  suggestedTags: z.array(z.string()).describe("Topic tags, lower case, three to six."),
  keyFacts: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        attribution: z.string().describe("Where this figure comes from. If unknown, say so plainly."),
      }),
    )
    .describe("Specific figures mentioned in the piece."),
  entities: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum([
          "Person",
          "Organization",
          "Place",
          "Product",
          "Event",
          "CreativeWork",
          "GovernmentOrganization",
        ]),
        relation: z.enum(["about", "mentions"]),
        roleNote: z.string().describe("This entity's part in the story."),
      }),
    )
    .describe("People, organisations and places the piece names."),
  faqs: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .describe("Only for major or complex stories. Return an empty array otherwise."),

  /**
   * The field that makes this usable.
   *
   * Written without source material, a model produces confident prose whose
   * factual claims it cannot support. Forcing it to enumerate those claims turns
   * an invisible risk into a checklist an editor can work through before
   * publishing — and makes the shape of the risk obvious rather than buried.
   */
  unverifiedClaims: z
    .array(z.string())
    .describe(
      "Every specific claim in this draft that you cannot verify — names, figures, dates, quotations, attributions. Be exhaustive and honest. If you invented or estimated something, list it.",
    ),
});

export type DraftedArticle = z.infer<typeof draftedArticleSchema>;

export const tagSuggestionSchema = z.object({
  tags: z.array(z.string()).describe("Three to six topic tags, lower case."),
});

export const headlineSuggestionSchema = z.object({
  headlines: z.array(z.string()).describe("Four headline options, sentence case."),
});

export const summarySchema = z.object({
  summary: z.string().describe("Two or three sentences."),
  standfirst: z.string().describe("A single line to sit under the headline."),
});

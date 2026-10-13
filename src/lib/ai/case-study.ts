import "server-only";

import { z } from "zod";

import type { SearchResearch } from "@/lib/seo/search-research";

import { HOUSE_STYLE, generateStructured, guarded, researchBlock, type AiResult } from "./draft";
import { draftedArticleSchema } from "./schemas";

/**
 * Case studies: the engine's second format.
 *
 * A news story says what happened. A case study answers the question people
 * start asking when something happens — how does a heart attack happen, what
 * is actually in the air, how does an exam get cancelled — and is written to
 * still be right in a year. One page per question, kept current, so the same
 * page is refreshed when the subject flares again rather than written twice.
 *
 * Three model calls live here. `qualifyCaseCandidates` is the gate: it asks
 * six questions of every candidate the case desk gathered and says no unless
 * every one is a clear yes. `draftCaseStudy` writes one. `refreshCaseStudy`
 * brings an existing one up to date when its subject is in the news again.
 * `proposeCaseQuestions` fills the question bank the desk writes from when
 * nothing in the news qualifies.
 */

const check = z.object({
  yes: z.boolean(),
  note: z.string().describe("One sentence of evidence for the answer."),
});

export const caseVerdictSchema = z.object({
  index: z.number().describe("The candidate's number in the list."),
  question: z
    .string()
    .describe(
      "The question a case study would answer, in the words a reader would type: sentence case, ending with a question mark, under 90 characters. Empty if there is no question behind the candidate.",
    ),
  subject: z.string().describe("The subject's slug, from the list given."),
  checks: z.object({
    questionBehind: check.describe("Is there a question behind this, not just an event?"),
    askedNow: check.describe("Are people asking it now: rising searches, many sources, a growing story?"),
    enoughMaterial: check.describe(
      "Is there enough reliable, public material for the full shape: the mechanism, who it affects, what institutions and communities are doing, whether that works?",
    ),
    lasting: check.describe("Will the answer still matter in six months? If not, it is a story, not a case study."),
    safe: check.describe(
      "Can it be explained without harm: no medical, legal or financial advice to individuals, no private person's health or conduct, nothing that would identify a victim or a child?",
    ),
    travels: check.describe("Would a reader send it to a friend? Does the question itself make someone want the answer?"),
  }),
  duplicateOf: z
    .string()
    .describe("The slug of an existing case study that already answers this question, or an empty string."),
  worthUpdating: z
    .boolean()
    .describe("When duplicateOf is set: does this news change what that page should say, enough to refresh it?"),
  viralScore: z.number().describe("0 to 10: how far this would travel as a page, judged on the question, not the event."),
  angle: z.string().describe("In one or two sentences, what the case study would be about and what makes it worth reading."),
  searchQueries: z
    .array(z.string())
    .describe("Two to four news-search queries that would find the reporting needed to write it."),
});

export const caseVerdictsSchema = z.object({ verdicts: z.array(caseVerdictSchema) });
export type CaseVerdict = z.infer<typeof caseVerdictSchema>;

const glanceSchema = z.object({
  label: z.string(),
  value: z.string(),
  attribution: z.string().describe("Who published this figure, and when."),
});

/** What the model writes: the parts the page renders as boxes, steps and verdicts. */
export const caseStudyCoreSchema = z.object({
  shortAnswer: z
    .string()
    .describe(
      "The answer to the question in one paragraph of three to five sentences, plain and complete enough to stand alone. This is the part people quote.",
    ),
  atAGlance: z.array(glanceSchema).describe("Five or six facts with figures and dates, the most important first."),
  now: z
    .string()
    .describe(
      "Markdown, three to five paragraphs: what is happening now that makes this question matter — the event, the numbers, who said what — dated, so it still reads correctly later.",
    ),
  mechanism: z.object({
    title: z.string().describe("A heading for the steps, e.g. 'How a heart attack happens'."),
    steps: z
      .array(z.object({ title: z.string(), text: z.string() }))
      .describe("Four to seven numbered steps that explain how the thing works, each a title and two or three plain sentences."),
  }),
  affects: z
    .string()
    .describe("Markdown, two to four paragraphs: who this affects and how many, India first, with attributed figures."),
  responses: z
    .array(
      z.object({
        actor: z.string().describe("Who: a ministry, a court, a company, a city, a community group, a profession."),
        kind: z.enum(["institutional", "grassroots", "market", "individual"]),
        what: z.string().describe("What they are doing, in one or two sentences."),
        effect: z.enum(["working", "mixed", "too_early", "not_working", "unknown"]),
        evidence: z.string().describe("The evidence for that verdict, attributed."),
      }),
    )
    .describe("Three to six responses, institutional and grassroots, each with an honest verdict on its effect so far."),
  whatYouCanDo: z.array(z.string()).describe("Three to six concrete things a reader can do, each one sentence; general guidance, never individual advice."),
  openQuestions: z.array(z.string()).describe("Two to four things that are still unknown or disputed."),
  sources: z
    .array(
      z.object({
        title: z.string(),
        publisher: z.string(),
        url: z.string(),
        usedFor: z.string().describe("What this source supplied, in a few words."),
      }),
    )
    .describe("The sources actually used, from the material given; never invented."),
});

/** The block as stored on the article, with what accrues after writing. */
export const caseStudyBlockSchema = caseStudyCoreSchema.extend({
  updates: z
    .array(z.object({ at: z.string(), note: z.string(), href: z.string().nullable() }))
    .default([]),
  trigger: z.object({ title: z.string(), href: z.string().nullable() }).nullable().default(null),
});
export type CaseStudyBlock = z.infer<typeof caseStudyBlockSchema>;

const EFFECT_WORDS: Record<CaseStudyBlock["responses"][number]["effect"], string> = {
  working: "Working so far",
  mixed: "Mixed results",
  too_early: "Too early to say",
  not_working: "Not working",
  unknown: "Effect unclear",
};

/**
 * The case study as one Markdown text, assembled from its parts: what the
 * search index, the listen button, the feeds and the plain fallback page read.
 * The model writes the parts once; this is not a second draft.
 */
export function caseStudyMarkdown(block: Omit<CaseStudyBlock, "updates" | "trigger">): string {
  const section = (title: string, body: string) => (body.trim() ? `## ${title}\n\n${body.trim()}` : "");
  const list = (items: string[]) => items.map((item) => `- ${item.trim()}`).join("\n");
  return [
    block.shortAnswer.trim(),
    section("What's happening now", block.now),
    section(
      block.mechanism.title || "How it works",
      block.mechanism.steps.map((step, index) => `${index + 1}. **${step.title.trim()}** ${step.text.trim()}`).join("\n"),
    ),
    section("Who it affects", block.affects),
    section(
      "What's being done, and is it working",
      block.responses
        .map((response) => `**${response.actor.trim()}** (${EFFECT_WORDS[response.effect]}): ${response.what.trim()} ${response.evidence.trim()}`)
        .join("\n\n"),
    ),
    section("What you can do", list(block.whatYouCanDo)),
    section("What we still don't know", list(block.openQuestions)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The stored block, or nothing if the column holds something else. */
export function readCaseStudy(raw: unknown): CaseStudyBlock | null {
  const parsed = caseStudyBlockSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const caseStudyDraftSchema = caseStudyCoreSchema.extend({
  headline: z
    .string()
    .describe(
      "The question, as the headline: sentence case, the words a reader would type, ending with a question mark, under 90 characters, no date in it.",
    ),
  standfirst: z.string().describe("The answer in one sentence, under the headline."),
  summary: z.string().describe("Two or three sentences for lists and feeds."),
  ...draftedArticleSchema.pick({
    suggestedTags: true,
    searchKeywords: true,
    imageBrief: true,
    imageSearchTerms: true,
    entities: true,
    unverifiedClaims: true,
  }).shape,
  faqs: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .describe("Three to five questions readers ask about this, each answered in two or three sentences."),
});
export type CaseStudyDraft = z.infer<typeof caseStudyDraftSchema>;

export const caseQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().describe("Sentence case, ending with a question mark, under 90 characters."),
      subject: z.string().describe("The subject's slug, from the list given."),
      rationale: z.string().describe("Why people in India ask this, in one sentence."),
      demandScore: z.number().describe("0 to 10: how often it is asked, judged on search demand and how evergreen it is."),
    }),
  ),
});

export const caseRefreshSchema = z.object({
  now: z.string().describe("The replacement 'What's happening now' section, Markdown, two to four paragraphs, dated."),
  updateNote: z.string().describe("One sentence for the page's updates log saying what changed and when."),
  shortAnswer: z.string().describe("The short answer, revised only if the news changes it; otherwise returned unchanged."),
  atAGlanceChanges: z.array(glanceSchema).describe("Only the facts that changed or are new; an empty array if none."),
});

export const CASE_STUDY_RULE = `
This is a case study, not a news story: an explainer built around one question,
written to still be right in a year.

- The headline is the question, in the words a reader would type. The short
  answer comes first and is complete on its own; everything after it is the
  working.
- Date every figure ("as of October 2026", "in the 2024 survey"); never
  "yesterday", "today" or "this week". Use the latest attributed figure where
  sources disagree, and never print two conflicting figures side by side.
- India first: Indian figures, institutions, laws and examples, then the world
  for comparison.
- Plain language. Define each technical term once, where it first appears, in
  the sentence rather than in brackets.
- Health: explain the mechanism from authoritative guidance (ICMR, AIIMS, WHO,
  the Indian guidelines where they exist); say when a reader should see a
  doctor; give no diagnosis and no individual advice. Law: explain the law and
  the process; give no advice on anyone's case. Money: explain; recommend no
  investment, product or firm.
- Name public figures in their public roles only. A private person who
  appears in the coverage is described, never named: "a 34-year-old software
  engineer in Thiruvananthapuram", not their name. No victim, no child, no
  patient by name, whatever the source did.
- Judge each response honestly from evidence. "Too early to say" and "not
  working" are acceptable verdicts; a list of initiatives with no verdict is
  not a case study.
- Write only what the source material supports. List every inferred or
  unsupported specific in unverifiedClaims. No links in the prose; the
  sources list carries them.
- Nothing about who or what wrote this, no byline, no sign-off.
`.trim();

export type CaseSubject = { slug: string; name: string };
export type ExistingCaseStudy = { slug: string; headline: string; reviewedAt: string | null };

export type CaseCandidateInput = {
  index: number;
  kind: "hot" | "canon";
  title: string;
  summary: string | null;
  section: string | null;
  sourceCount: number | null;
  score: number | null;
  trendTraffic: string | null;
  firstSeenAt: string | null;
};

/** The gate: which of these candidates, if any, deserves a case study, and as what question. */
export async function qualifyCaseCandidates({
  candidates,
  subjects,
  existing,
}: {
  candidates: CaseCandidateInput[];
  subjects: CaseSubject[];
  existing: ExistingCaseStudy[];
}): Promise<AiResult<CaseVerdict[]>> {
  return guarded(async () => {
    const system = [
      "You are the case desk of The India Decade, an Indian news site. You decide which of the day's stories deserve a case study: an explainer built around the question readers are asking, written to still be right in a year.",
      "Most candidates fail. Say no unless all six checks are a clear yes. A story about an event is not a case study; a question with a durable answer is. Judge the question, not the event.",
      "Subjects (use the slug): " + subjects.map((s) => `${s.slug} (${s.name})`).join(", "),
      existing.length
        ? "Case studies already published, by slug — a candidate that these already answer is a duplicate, to be updated rather than written again:\n" +
          existing.map((e) => `- ${e.slug}: ${e.headline}`).join("\n")
        : "No case studies have been published yet.",
    ].join("\n\n");

    const list = candidates
      .map((c) =>
        [
          `${c.index}. ${c.title}`,
          c.summary ? `   ${c.summary.slice(0, 400)}` : "",
          `   section: ${c.section ?? "unknown"}; sources: ${c.sourceCount ?? "?"}; score: ${c.score ?? "?"}; trend traffic: ${c.trendTraffic ?? "none"}; first seen: ${c.firstSeenAt ?? "?"}; kind: ${c.kind}`,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n");

    const prompt = `Candidates:\n${list}\n\nReturn one verdict per candidate, in the same order, with every check answered and a note of evidence for each.`;
    const output = await generateStructured("assist", { system, prompt, schema: caseVerdictsSchema });
    return output.verdicts;
  });
}

/** Fills the question bank: questions worth a case study whether or not anything is in the news. */
export async function proposeCaseQuestions({
  subjects,
  existing,
  count,
}: {
  subjects: CaseSubject[];
  existing: string[];
  count: number;
}): Promise<AiResult<z.infer<typeof caseQuestionsSchema>["questions"]>> {
  return guarded(async () => {
    const system = [
      "You are the case desk of The India Decade, an Indian news site. Propose questions for case studies: explainers that answer what people in India keep asking — how something works, why it happens, what is being done about it — with answers that stay right for years.",
      "Spread them across the subjects given. Prefer questions with steady search demand and a mechanism to explain: how a heart attack happens, how the monsoon forms, how a board exam paper is set, how UPI moves money, how bail works.",
      "Do not repeat a question already asked. Subjects (use the slug): " + subjects.map((s) => `${s.slug} (${s.name})`).join(", "),
    ].join("\n\n");
    const prompt = [
      existing.length ? `Already asked:\n${existing.map((q) => `- ${q}`).join("\n")}` : "",
      `Propose ${count} new questions.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const output = await generateStructured("assist", { system, prompt, schema: caseQuestionsSchema });
    return output.questions;
  });
}

export type CaseStudyDocument = {
  url: string;
  source: string;
  title: string | null;
  content: string;
};

function fullText(documents: CaseStudyDocument[]): string {
  return documents
    .map((doc, index) =>
      [`### Source ${index + 1} — ${doc.source}`, doc.title ? `Headline: ${doc.title}` : "", `Link: ${doc.url}`, "", doc.content]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");
}

/** Writes a case study from the question, the angle and whatever could be read. */
export async function draftCaseStudy({
  question,
  subject,
  angle,
  trigger,
  documents,
  coverage,
  searchResearch,
  lengthWords = 1400,
}: {
  question: string;
  subject: CaseSubject;
  angle: string;
  /** The news that prompted it, if any. */
  trigger: { title: string; summary: string | null } | null;
  documents: CaseStudyDocument[];
  coverage: { title: string; source: string; url: string }[];
  searchResearch?: SearchResearch | null;
  lengthWords?: number;
}): Promise<AiResult<CaseStudyDraft>> {
  return guarded(async () => {
    const sourced = documents.filter((doc) => doc.content.trim().length > 0);
    const grounding = sourced.length
      ? "You have the full text of published reporting and reference material on this subject. Write original prose from it: never reproduce its sentences, attribute figures to whoever produced them rather than the outlet, and keep an outlet's name only for its own exclusive work."
      : "You have headlines and no full text. Explain the mechanism from well-established knowledge, state every figure as attributed and dated, write any gap so it is plain, and list every unsupported specific in unverifiedClaims.";
    const system = [HOUSE_STYLE, CASE_STUDY_RULE, grounding].join("\n\n");

    const prompt = [
      `The question: ${question}`,
      `Subject: ${subject.name} (${subject.slug})`,
      angle ? `The angle: ${angle}` : "",
      trigger ? `What prompted it: ${trigger.title}${trigger.summary ? ` — ${trigger.summary.slice(0, 500)}` : ""}` : "Nothing in the news prompted this; it is a standing question readers ask.",
      coverage.length ? `\nCoverage found:\n${coverage.map((item) => `- ${item.source}: "${item.title}"  ${item.url}`).join("\n")}` : "",
      sourced.length ? `\nFull text:\n\n${fullText(sourced)}` : "",
      researchBlock(searchResearch),
      `\nWrite the case study: every structured part, about ${Math.min(Math.max(Math.round(lengthWords), 800), 1600)} words in all across the short answer, what's happening now, the steps, who it affects and the responses. The page is assembled from these parts; there is no separate body to write.`,
    ]
      .filter(Boolean)
      .join("\n");

    return generateStructured("drafting", { system, prompt, schema: caseStudyDraftSchema });
  });
}

/** Brings an existing case study up to date with new coverage of its subject. */
export async function refreshCaseStudy({
  headline,
  block,
  trigger,
  documents,
}: {
  headline: string;
  block: CaseStudyBlock;
  trigger: { title: string; summary: string | null };
  documents: CaseStudyDocument[];
}): Promise<AiResult<z.infer<typeof caseRefreshSchema>>> {
  return guarded(async () => {
    const system = [HOUSE_STYLE, CASE_STUDY_RULE, "You are updating a published case study, not rewriting it. Change only what the new coverage changes; keep the voice and the structure."].join("\n\n");
    const prompt = [
      `The case study: ${headline}`,
      `Its short answer now: ${block.shortAnswer}`,
      `Its 'What's happening now' section now:\n${block.now}`,
      `At a glance now:\n${block.atAGlance.map((f) => `- ${f.label}: ${f.value} (${f.attribution})`).join("\n")}`,
      `\nWhat has happened since: ${trigger.title}${trigger.summary ? ` — ${trigger.summary.slice(0, 500)}` : ""}`,
      documents.length ? `\nFull text of the new coverage:\n\n${fullText(documents)}` : "",
      "\nReturn the replacement 'What's happening now' section, a one-line update note, the short answer (revised only if needed), and any facts that changed.",
    ]
      .filter(Boolean)
      .join("\n");
    return generateStructured("drafting", { system, prompt, schema: caseRefreshSchema });
  });
}

import "server-only";
import { z } from "zod";
import { generateStructured, HOUSE_STYLE } from "./draft";
import { draftedArticleSchema } from "./schemas";

/**
 * Writing for karostartup.com: the gate that picks what their readers need
 * and the drafter that writes it in their voice.
 *
 * Their readers are founders, operators and investors. The paper's own line
 * is "FT meets Inc42": founder-first, data-driven, sharp. That is what the
 * style block below asks for, on top of the house rules every story the
 * engine writes already follows.
 */

/** Their sections the engine may file into. Opinion, research and press releases are theirs alone. */
export const PARTNER_CATEGORIES = [
  "funding",
  "startups",
  "founders",
  "fintech",
  "saas",
  "d2c",
  "ai",
  "ev",
  "climate",
  "policy",
  "markets",
  "banking",
] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

/** The labels their cards show above a headline, as their desk writes them. */
export const PARTNER_KICKERS = [
  "FUNDING",
  "STARTUPS",
  "FOUNDERS",
  "FINTECH",
  "SAAS",
  "D2C",
  "AI",
  "EV & CLIMATE",
  "POLICY",
  "MARKETS",
  "BANKING",
  "DEALS",
  "IPO",
  "LAYOFFS",
  "GLOBAL",
  "BREAKING",
] as const;

export const KAROSTARTUP_STYLE = `
You are writing for Karostartup (karostartup.com), India's business-of-business
paper: founder-first, data-driven, sharp. Think the Financial Times meeting
Inc42. The readers are founders, operators and investors in India and the
people abroad who follow Indian and global startups. They are busy and well
informed; they want the facts, the numbers and what it means for them.

What every story carries
- The news first: who did what, with the number, in the first sentence.
- The numbers with their attribution: round size, valuation, investors (lead
  and others), revenue, growth, burn, headcount, price, market size. Indian
  figures in crore or lakh with the dollar figure beside them when a source
  gives it; foreign figures in dollars. Never convert a figure yourself.
- Why it matters, as its own short section: what this means for founders,
  operators or investors, concretely. Not "this is significant".
- Context: earlier rounds, competitors, the sector's trend, the regulator if
  one is involved. Only what a reader needs to judge the news.
- What happens next, where the sources say.
- Quotes only where a source quotes someone; at most two, short, attributed to
  the person.

Voice
- Confident, precise, plain. No hype: never "thrilled", "leading", "cutting
  edge", "game-changing", "revolutionary", "ecosystem" as filler, "space" for
  a sector, "unlock", "leverage", "scale" as a verb without an object.
- No press-release phrasing and no company-speak copied from an announcement.
- No exclamation marks. Sentence-case headline that names the company and the
  fact: "Zepto raises $350 million at $5 billion valuation", not a tease.
- Indian English spelling. "Rs" with crore and lakh; "$" for dollars.

Shape
- 700 to 1,000 words, built from every fact the sources give: the round, the
  investors, the use of funds, the business (products, stores, revenue, growth),
  earlier rounds, rivals, the sector. "##" headings in plain words. A Markdown table when
  several figures sit side by side (rounds over time, rival valuations).
- The kicker is one of the labels offered; "BREAKING" only when the news is
  hours old and still developing.
- The subtitle (standfirst) adds a fact the headline does not carry.
- The summary is two sentences for a card: the news and why it matters.
- Tags: three to six, lower case, the company, the sector, the round type.
- Category: the one section of theirs that fits best.

Do not
- Invent or round a figure, name an investor the sources do not, or present a
  claim from a company as a fact: attribute it.
- Mention this paper, the engine, AI, or the sources' outlets in the prose; the
  sources list at the end does that.
`.trim();

const GROUNDING_RULE = `
Work ONLY from the source material provided. Do not add facts that are not in
it. Anything you infer rather than read belongs in unverifiedClaims. If the
sources disagree on a figure, use the most recent one and say which it is.
`.trim();

export const partnerArticleSchema = draftedArticleSchema.extend({
  kicker: z.enum(PARTNER_KICKERS).describe("The label above the headline, from the list."),
  category: z.enum(PARTNER_CATEGORIES).describe("The section this belongs in, from the list."),
});
export type PartnerArticle = z.infer<typeof partnerArticleSchema>;

export type PartnerSource = {
  title: string;
  outlet: string;
  publishedAt: string | null;
  content: string;
};

function sourceBlock(sources: PartnerSource[], maxChars: number): string {
  return sources
    .map(
      (source, index) =>
        `--- Source ${index + 1}: ${source.title} (${source.outlet}${source.publishedAt ? `, ${source.publishedAt}` : ""}) ---\n${source.content.slice(0, maxChars)}`,
    )
    .join("\n\n");
}

export async function draftPartnerArticle(input: {
  topic: string;
  angle: string;
  sources: PartnerSource[];
  kicker: string;
  category: string;
  headlines: string[];
}): Promise<PartnerArticle> {
  const perSource = Math.max(2500, Math.floor(16_000 / Math.max(1, input.sources.length)));
  const system = [HOUSE_STYLE, KAROSTARTUP_STYLE, GROUNDING_RULE].join("\n\n");
  const prompt = [
    `Story: ${input.topic}`,
    input.angle ? `Angle: ${input.angle}` : "",
    `The desk's first thought for the kicker is ${input.kicker} and for the section ${input.category}; change either if the story is really something else.`,
    input.headlines.length ? `How other outlets headlined it (do not copy):\n${input.headlines.map((h) => `- ${h}`).join("\n")}` : "",
    `Source material:\n\n${sourceBlock(input.sources, perSource)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return generateStructured("drafting", { system, prompt, schema: partnerArticleSchema });
}

/** One candidate as the gate sees it. */
export type GateCandidate = {
  index: number;
  title: string;
  summary: string | null;
  outlets: string[];
  mentions: number;
  hoursOld: number;
  section: string | null;
};

export const gateVerdictSchema = z.object({
  index: z.number().int(),
  /** 0–10: is this a story Karostartup's founders and investors need, startups, venture, tech business, founders, the regulation and money around them. */
  fit: z.number().min(0).max(10),
  /** 0–10: how hot it is right now, the size of the news and how fast it is moving. */
  heat: z.number().min(0).max(10),
  breaking: z.boolean().describe("Hours old, still developing, and big enough that readers want it now."),
  repeatsRecent: z
    .boolean()
    .describe("True when one of the paper's recent headlines is the same news; a fresh development is not a repeat."),
  category: z.enum(PARTNER_CATEGORIES),
  kicker: z.enum(PARTNER_KICKERS),
  angle: z.string().describe("One line: what the story is really about for this paper's readers."),
  reason: z.string().describe("One line for the log."),
});

export const gateSchema = z.object({ verdicts: z.array(gateVerdictSchema) });
export type GateVerdict = z.infer<typeof gateVerdictSchema>;

const GATE_RULE = `
You are the news editor of Karostartup (karostartup.com), India's business-of-business
paper for founders, operators and investors: startups, venture capital, founders,
funding rounds, acquisitions, IPOs, fintech, SaaS, D2C, AI companies, EV and
climate ventures, the policy and the banking that shape them, in India first and
in the world where it matters to Indian readers. Judge each candidate story on
whether your readers need it today. Score every candidate; do not skip any.
A press release, a listicle, a how-to, a stock-tip, an opinion piece or a story
with no company or founder in it scores low on fit. The paper already ran the
recent headlines listed: a candidate that is the same news repeats them.
`.trim();

export async function gatePartnerCandidates(
  candidates: GateCandidate[],
  recentHeadlines: string[],
): Promise<GateVerdict[]> {
  const prompt = [
    `Recent headlines on the paper:\n${recentHeadlines.length ? recentHeadlines.map((h) => `- ${h}`).join("\n") : "- (none)"}`,
    `Candidates:\n${candidates
      .map(
        (c) =>
          `${c.index}. ${c.title}${c.summary ? ` — ${c.summary.slice(0, 220)}` : ""} [${c.outlets.slice(0, 6).join(", ") || "unknown outlets"}; ${c.mentions} mentions; first seen ${c.hoursOld.toFixed(1)} h ago${c.section ? `; our desk filed it under ${c.section}` : ""}]`,
      )
      .join("\n")}`,
  ].join("\n\n");
  const result = await generateStructured("assist", { system: GATE_RULE, prompt, schema: gateSchema });
  return result.verdicts;
}

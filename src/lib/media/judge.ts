import "server-only";

import { Output, generateText } from "ai";
import { z } from "zod";

import { runWithChain } from "@/lib/ai/config";

/**
 * The picture editor: a model that looks at the candidate pictures beside
 * the story and says which one, if any, a serious paper would run.
 *
 * Everything before this stage judges words — a picture's title against a
 * writer's brief. Titles lie by omission ("Integrated Terminal Exchange" was
 * a bus station) and stock libraries tag loosely, which is how a Punjab
 * shooting got a Milton Keynes pharmacy. The judge sees the pixels, with the
 * headline, the standfirst and what we believe each picture shows, and is
 * asked the questions a picture editor asks: does it show this subject or
 * this scene, could it mislead, is it a cliché, is it the right country, is
 * it good enough to run at the top of a page, and does it look synthetic.
 * It may, and often should, choose nothing.
 */

export type StoryKind = "statement" | "conflict" | "market" | "court" | "incident" | "general";

export type JudgeStory = {
  headline: string;
  standfirst: string | null;
  section: string;
  kind: StoryKind;
  subjects: { name: string; type: string }[];
  briefs: string[];
  /** Where the story is set, as far as the desk knows: "Mansa, Punjab", "Riyadh". */
  places: string[];
  abroad: boolean;
};

export type JudgeCandidate = {
  index: number;
  thumbUrl: string;
  source: string;
  title: string | null;
  /** What the desk believes the picture shows, and why it is a candidate. */
  claim: string;
};

export const verdictSchema = z.object({
  index: z.number(),
  relevance: z.number().describe("0 to 10: how well this picture shows the subject of the story or the scene it describes."),
  misleading: z.boolean().describe("Would a reader take it for the actual event, person or place of the story when it is not?"),
  cliche: z.boolean().describe("Generic stock: a gavel, a handshake, anonymous suits, server racks, a stranger with a tablet, a sunset."),
  setting: z.enum(["india", "elsewhere", "neutral"]).describe("Where the picture visibly is, judged from signage, streets, people, vehicles, architecture."),
  quality: z.number().describe("0 to 10: sharp, well lit, well composed, usable at 1600 by 900 at the top of a page."),
  textHeavy: z.boolean().describe("Dominated by text, a watermark, a chart screenshot or a collage."),
  synthetic: z.boolean().describe("Looks AI-generated, CGI or heavily manipulated."),
  note: z.string().describe("One short sentence: what the picture actually shows."),
});

export const judgementSchema = z.object({
  verdicts: z.array(verdictSchema),
  choice: z.number().describe("The index of the picture to run, or -1 if none should."),
  caption: z.string().describe("A factual caption for the chosen picture in under 20 words; say 'file image' when it is not of the event itself. Empty if none."),
  reason: z.string().describe("One sentence on why that one, or why none."),
});

export type Judgement = z.infer<typeof judgementSchema>;

const RUBRIC = `
You are the picture editor of The India Decade, a serious Indian news site.
You are shown a story and numbered candidate pictures. Choose the one a
careful paper would run at the top of the page, or none.

Judge the pixels, not the titles. Score every candidate on every field.

What is right:
- A verified portrait of the person the story is about, for a story about
  what that person said or did: relevance 9 or 10.
- The actual building of the court, ministry, bank or company, for that
  institution's own decision: 7 to 8.
- A scene that shows what the story describes, in the place the story is set
  (an Indian hospital for an Indian health story, a Delhi street for a Delhi
  protest): 6 to 8. The same scene visibly somewhere else: 3 at most.
- A company's logo only for a launch, results or a deal: 6. Never for a row,
  an accusation, a crash or a crisis.

What is wrong:
- A different person, a different disaster, a different city presented as
  the story's: misleading, whatever the score.
- Indian courts do not use gavels. Indian stock markets have no trading
  floor. A foreign trading floor, a gavel, a handshake, a man in a suit, a
  server rack for a story that is not about data centres: cliché.
- Anything that looks AI-generated, a collage, a chart screenshot, a
  watermark, a tiny or ancient scan: refuse.

Choose -1 when nothing clears the bar. No picture is better than a wrong
picture; a wrong picture is what tells readers a machine chose it.
`.trim();

const KIND_NOTES: Record<StoryKind, string> = {
  statement: "This story is about what a named person said or did; their own portrait is the right picture if one is offered.",
  conflict: "This story is a row, accusation or dispute. No party or company logo. A portrait of the main speaker, or the real place, or nothing.",
  market: "This is an Indian market story. Prefer the BSE building, Dalal Street, a Sensex board or an Indian broker's screen; refuse foreign trading floors.",
  court: "This is a court story. The court's own building, or the main party's portrait; never a gavel.",
  incident: "This is an incident in a specific place. A scene must visibly be that kind of place in that country; otherwise nothing, and a map will be used.",
  general: "",
};

/** The most time the judge may take in all, attempts and downloads included. */
const JUDGE_BUDGET_MS = 110_000;
const MAX_ATTEMPTS = 8;
/** One attempt may take this long; the next key or provider then gets its turn. */
const ATTEMPT_MS = 45_000;
const THUMB_MAX_BYTES = 600_000;

/** A thumbnail's bytes, fetched once so every attempt reuses them; null if it cannot be had quickly. */
async function fetchThumb(url: string): Promise<{ data: Buffer; mediaType: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "TheIndiaDecade picture desk (https://www.theindiadecade.com)" } });
    if (!response.ok) return null;
    const mediaType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!mediaType.startsWith("image/")) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > THUMB_MAX_BYTES) return null;
    return { data, mediaType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function judgePictures(
  story: JudgeStory,
  candidates: JudgeCandidate[],
): Promise<{ judgement: Judgement; modelId: string; seen: number[]; unseen: number[] }> {
  const started = Date.now();
  const thumbs = await Promise.all(candidates.map((candidate) => fetchThumb(candidate.thumbUrl)));
  // The pictures the model sees are numbered 1..n in the order shown; every
  // index in its answer is mapped back to the caller's numbering afterwards.
  const shown = candidates.map((candidate, i) => ({ candidate, thumb: thumbs[i] })).filter((entry): entry is { candidate: JudgeCandidate; thumb: NonNullable<(typeof thumbs)[number]> } => Boolean(entry.thumb));
  const unseen = candidates.filter((_, i) => !thumbs[i]).map((c) => c.index);
  if (!shown.length) throw new Error("No candidate thumbnail could be fetched.");
  const header = [
    RUBRIC,
    "",
    `Section: ${story.section}`,
    `Headline: ${story.headline}`,
    story.standfirst ? `Standfirst: ${story.standfirst}` : "",
    story.subjects.length ? `Subjects: ${story.subjects.map((s) => `${s.name} (${s.type})`).join("; ")}` : "",
    story.places.length ? `Where it is set: ${story.places.join(", ")}${story.abroad ? " (outside India)" : " (India)"}` : story.abroad ? "Set outside India." : "Set in India.",
    story.briefs.length ? `Scenes the writer suggested: ${story.briefs.join(" | ")}` : "",
    KIND_NOTES[story.kind],
    "",
    `${shown.length} candidates follow, each with what we believe it shows.`,
  ]
    .filter(Boolean)
    .join("\n");

  const content: ({ type: "text"; text: string } | { type: "file"; mediaType: string; data: Buffer })[] = [{ type: "text", text: header }];
  for (const [k, { candidate, thumb }] of shown.entries()) {
    content.push({
      type: "text",
      text: `Picture ${k + 1} — source: ${candidate.source}; title: ${candidate.title ?? "untitled"}; we believe: ${candidate.claim}`,
    });
    content.push({ type: "file", mediaType: thumb.mediaType, data: thumb.data });
  }
  const original = (k: number) => shown[k - 1]?.candidate.index ?? -1;
  const remap = (judgement: Judgement): Judgement => ({
    ...judgement,
    choice: judgement.choice >= 1 ? original(judgement.choice) : -1,
    verdicts: judgement.verdicts.filter((v) => v.index >= 1 && v.index <= shown.length).map((v) => ({ ...v, index: original(v.index) })),
  });

  const result = await runWithChain(
    "picture",
    async (model, entry) => {
      const abortSignal = AbortSignal.timeout(Math.min(ATTEMPT_MS, Math.max(10_000, JUDGE_BUDGET_MS - (Date.now() - started))));
      // Gemini takes a schema; the open models on OpenRouter are asked for
      // JSON in words and read back, which is what they reliably do.
      if (entry.provider === "google") {
        const { output, finishReason } = await generateText({
          model,
          messages: [{ role: "user", content }],
          output: Output.object({ schema: judgementSchema }),
          maxRetries: 0,
          maxOutputTokens: 3_000,
          abortSignal,
        });
        if (finishReason === "length") throw new Error("The judge ran out of room.");
        return { judgement: remap(output as Judgement), modelId: entry.modelId };
      }
      if (entry.provider === "openrouter") {
        // Spoken to directly: the SDK's reading of these replies fails on the
        // reasoning they carry, and the raw reply is plain to read.
        const text = await askOpenRouter(entry.apiKey, entry.modelId, [...content, { type: "text", text: JSON_INSTRUCTION }], abortSignal);
        return { judgement: remap(parseJudgement(text)), modelId: entry.modelId };
      }
      const { text, finishReason } = await generateText({
        model,
        messages: [{ role: "user", content: [...content, { type: "text", text: JSON_INSTRUCTION }] }],
        maxRetries: 0,
        maxOutputTokens: 3_000,
        abortSignal,
      });
      if (finishReason === "length") throw new Error("The judge ran out of room.");
      return { judgement: remap(parseJudgement(text)), modelId: entry.modelId };
    },
    { maxAttempts: MAX_ATTEMPTS, deadline: started + JUDGE_BUDGET_MS },
  );
  return { ...result, seen: shown.map((entry) => entry.candidate.index), unseen };
}

const JSON_INSTRUCTION = `
Reply with one JSON object and nothing else, of this shape:
{"verdicts":[{"index":1,"relevance":0,"misleading":false,"cliche":false,"setting":"india"|"elsewhere"|"neutral","quality":0,"textHeavy":false,"synthetic":false,"note":""}],"choice":-1,"caption":"","reason":""}
One verdict per picture, in order; "choice" is the index to run or -1; "caption" under 20 words, empty if none.
`.trim();

/** One non-streaming chat completion on OpenRouter, pictures inline, the reply's text. */
async function askOpenRouter(
  apiKey: string,
  modelId: string,
  parts: ({ type: "text"; text: string } | { type: "file"; mediaType: string; data: Buffer })[],
  abortSignal: AbortSignal,
): Promise<string> {
  const content = parts.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.data.toString("base64")}` } },
  );
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://www.theindiadecade.com",
      "X-Title": "The India Decade picture desk",
    },
    body: JSON.stringify({ model: modelId, max_tokens: 4_000, messages: [{ role: "user", content }] }),
    signal: abortSignal,
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${raw.slice(0, 160)}`);
  let data: { choices?: { message?: { content?: string | { text?: string }[] } }[]; error?: { message?: string } };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("OpenRouter did not answer in JSON.");
  }
  if (data.error?.message) throw new Error(data.error.message);
  const message = data.choices?.[0]?.message?.content;
  const text = typeof message === "string" ? message : (message ?? []).map((part) => part.text ?? "").join("");
  if (!text.trim()) throw new Error("OpenRouter returned no text.");
  return text;
}

/** The JSON object in a model's reply, whatever it wrapped it in, checked against the schema. */
function parseJudgement(text: string): Judgement {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The judge did not answer in JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new Error("The judge's JSON could not be read.");
  }
  const result = judgementSchema.safeParse(parsed);
  if (!result.success) throw new Error("The judge's answer did not fit the schema.");
  return result.data;
}

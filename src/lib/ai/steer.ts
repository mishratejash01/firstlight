import "server-only";

import { z } from "zod";

import { directiveRulesSchema, type ActiveDirective } from "@/lib/engine/directives";
import { formatDateTime } from "@/lib/format/datetime";
import { SITE_NAME } from "@/lib/site";

import { generateStructured, guarded, type AiResult } from "./draft";

/**
 * The dialogue in which an administrator's instruction is settled.
 *
 * An instruction typed in a hurry is ambiguous in ways the person typing it
 * cannot see: "focus on the Bihar election" could mean nothing else is
 * published, or that it gets most of the output, or that it gets a reliable
 * stream alongside the rest. The engine acting on the wrong reading for a
 * week would be worse than asking. So before an instruction takes effect the
 * engine reads it, asks about whatever is unclear — as one editor would ask
 * another, in a few multiple-choice questions a round — and only when it is
 * sure writes down what it will do. That written understanding, and the
 * rules that go with it, are what the desk then follows.
 *
 * The same dialogue settles a commissioned story: section, stance, facts,
 * pictures, when to publish.
 */

export const dialogueQuestionSchema = z.object({
  id: z.string().describe("A short stable key for the question: 'scope', 'share', 'keywords', 'tone', 'hero'."),
  text: z.string().describe("The question, in plain words, as one editor would put it to another."),
  why: z.string().describe("One short sentence: why the engine needs this before it can act."),
  type: z
    .enum(["single", "multiple", "text"])
    .describe("single: pick one option. multiple: pick any number. text: a free answer."),
  options: z
    .array(z.string())
    .describe("For single or multiple: 2 to 6 choices, each a complete answer in itself. Empty for text."),
});

export type DialogueQuestion = z.infer<typeof dialogueQuestionSchema>;

export type AdminAnswer = { questionId: string; question: string; answer: string };

export type TranscriptTurn =
  | {
      role: "engine";
      at: string;
      satisfied: boolean;
      questions: DialogueQuestion[];
      understanding: string;
    }
  | { role: "admin"; at: string; answers: AdminAnswer[]; note: string };

/** How many rounds of questions before the engine must settle on its best reading. */
export const MAX_ROUNDS = 6;

const satisfiedField = z
  .boolean()
  .describe(
    "True only when nothing that matters is still unclear. Being satisfied too early is the worst outcome, because the engine will act on a misreading; asking one round too many costs a minute.",
  );

const questionsField = z
  .array(dialogueQuestionSchema)
  .describe("What you still need to know: at most 4 questions, most important first. Empty when satisfied.");

export const steerTurnSchema = z.object({
  satisfied: satisfiedField,
  questions: questionsField,
  understanding: z
    .string()
    .describe(
      "When satisfied: 2 to 6 plain sentences beginning 'The engine will', stating exactly what it will do and every assumption, in words the editor can check. Empty when not satisfied.",
    ),
  rules: directiveRulesSchema.describe(
    "When satisfied: the instruction as rules, matching the understanding exactly. When not satisfied: mode 'style' with every list empty and every text empty.",
  ),
});

export type SteerTurn = z.infer<typeof steerTurnSchema>;

export const commissionBriefSchema = z.object({
  headlineHint: z
    .string()
    .describe("The headline the editor wants, or the gist of it. Empty if left to the writer."),
  section: z.string().describe("The section name, exactly as it appears in the list given."),
  tone: z.string().describe("How the piece should read, in the editor's own words."),
  stance: z
    .string()
    .describe("The line to take — whose side, what to argue or imply, how hard — exactly as the editor wants it. 'Straight news' if none."),
  lengthWords: z.number().describe("Target length of the body in words, between 250 and 1500."),
  facts: z
    .array(z.string())
    .describe("Facts the editor supplied, each as one complete statement, to be used as given and stated as fact."),
  mustInclude: z
    .array(z.string())
    .describe("Points, names, quotations or figures the story must carry, in the editor's words."),
  avoid: z.array(z.string()).describe("Anything the story must not say or do."),
  sources: z.array(z.string()).describe("Web addresses the editor gave to read, exactly as given."),
  research: z.boolean().describe("Whether the writer should also search published coverage and read it."),
  searchQuery: z
    .string()
    .describe("If research is true: the 3 to 8 word query to search the news with. Empty otherwise."),
  heroImageIndex: z
    .number()
    .describe("Which of the editor's pictures is the main picture, counting from 1. 0 if the writer should find a licensed picture instead."),
  imagePlacements: z
    .array(
      z.object({
        index: z.number().describe("Picture number, counting from 1."),
        caption: z.string().describe("The caption to print under it."),
        credit: z.string().describe("The credit line, e.g. 'Special arrangement'."),
      }),
    )
    .describe("Every one of the editor's pictures to use, with its caption and credit, the main picture included."),
  breaking: z.boolean().describe("Whether to flag the story as breaking news."),
  publish: z
    .enum(["now", "delay", "draft"])
    .describe("now: publish the moment it is written. delay: publish after the desk's usual delay. draft: write it and leave it for an editor to publish."),
  notes: z.string().describe("Anything else the writer must know. Empty if nothing."),
});

export type CommissionBrief = z.infer<typeof commissionBriefSchema>;

export const commissionTurnSchema = z.object({
  satisfied: satisfiedField,
  questions: questionsField,
  understanding: z
    .string()
    .describe(
      "When satisfied: 2 to 6 plain sentences beginning 'The engine will write', stating what the story is, its line, its length, its pictures and when it publishes. Empty when not satisfied.",
    ),
  brief: commissionBriefSchema.describe(
    "When satisfied: the settled brief, matching the understanding exactly. When not satisfied: empty strings, empty lists, 0 and false throughout.",
  ),
});

export type CommissionTurn = z.infer<typeof commissionTurnSchema>;

export type CommissionImage = {
  url: string;
  publicId: string;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
  credit: string;
};

function nowIst(): string {
  return formatDateTime(new Date().toISOString());
}

function transcriptBlock(transcript: TranscriptTurn[]): string {
  if (!transcript.length) return "";
  const lines: string[] = ["The conversation so far:"];
  let round = 0;
  for (const turn of transcript) {
    if (turn.role === "engine") {
      round += 1;
      if (turn.satisfied) {
        lines.push(`Round ${round} — the engine said it was satisfied and wrote: ${turn.understanding}`);
        continue;
      }
      lines.push(`Round ${round} — the engine asked:`);
      for (const q of turn.questions) {
        lines.push(`  [${q.id}] ${q.text}${q.options.length ? ` (options: ${q.options.join(" / ")})` : ""}`);
      }
    } else {
      lines.push(`Round ${round} — the editor answered:`);
      for (const a of turn.answers) lines.push(`  [${a.questionId}] ${a.answer}`);
      if (turn.note.trim()) lines.push(`  The editor added: ${turn.note.trim()}`);
    }
  }
  return lines.join("\n");
}

const CONVERSATION_RULES = `
Rules for the conversation:
- Ask at most 4 questions in a round, the most important first. Prefer single-choice and multiple-choice questions with complete, concrete options; use a free-text question only where any options would be guesses. The editor can always add a note of their own, so never add an "other" option.
- Never repeat a question the editor has answered, and never ask what the request already makes plain. Build on the answers you have.
- Where you can propose something — a keyword list, a search query, a caption — propose it and ask the editor to confirm or change it, rather than asking them to write it from nothing.
- If the request asks for something the engine cannot do, say so in a question and offer the nearest thing it can do.
- When satisfied, write the understanding in the second person about the engine ("The engine will…"), plainly, including every assumption you made, so the editor can see at once if you have it wrong.
`.trim();

/** One round of the steering dialogue: either questions, or the settled instruction. */
export async function steerDialogueTurn(input: {
  prompt: string;
  ttlLabel: string;
  transcript: TranscriptTurn[];
  sections: string[];
  active: ActiveDirective[];
}): Promise<AiResult<SteerTurn>> {
  const round = input.transcript.filter((t) => t.role === "engine").length + 1;
  const final = round >= MAX_ROUNDS;

  const system = `
You are the desk editor of ${SITE_NAME}'s automated newsroom, which the staff call the engine. An administrator is giving the engine a standing instruction about what to cover. Your job in this conversation is to make sure the engine understands the instruction exactly — by asking about anything unclear — and then to write down what the engine will do.

How the engine works, so you ask the right questions and promise only what it can do:
- It watches wire feeds, news feeds and search trends around the clock, clusters what it sees into story events, scores them, and every two minutes puts the strongest to triage, where a model decides whether each is news, which section it belongs in and whether it is breaking.
- Events that pass are written as 400–650 word stories from the published source articles, one or two every two minutes, and published automatically after a short delay. It balances its output across sections.
- It recognises a topic only by words in headlines and source text, so it needs concrete names and keywords.
- It cannot write about something no outlet has reported, cannot publish at an exact clock time, cannot change the site's design, and cannot contact anyone.
- A standing instruction can: restrict coverage to listed topics and nothing else; give listed topics a share of the output (say, seven stories in ten); forbid topics; prefer sections; set a tone or an angle, for the topics or for everything; change the breaking rule. The administrator has already chosen how long it holds: ${input.ttlLabel}.

What must be settled before you are satisfied, unless the request already makes it plain:
- Scope: only this (nothing else is published at all), mostly this (then: what share — about half, about seven in ten, nearly all?), or also this (a steady stream alongside the rest).
- What counts as the topic: propose the people, parties, places, abbreviations and likely headline words yourself and ask the editor to confirm or add.
- Sections; tone and angle, and whether the tone applies to everything or only to this topic.
- Breaking: as usual, always for this topic, or never.
- How it sits with the instructions already in force: replaces one, adds to it, or runs alongside.

${CONVERSATION_RULES}
- Current time: ${nowIst()}.
${final ? "\nFINAL ROUND: you have asked enough. Be satisfied now, choose the most sensible reading of anything still open, and state each such assumption in the understanding." : ""}
`.trim();

  const active = input.active.length
    ? input.active
        .map(
          (d, i) =>
            `  ${i + 1}. (${d.expiresAt ? `until ${formatDateTime(d.expiresAt)}` : "until removed"}) ${d.understanding}`,
        )
        .join("\n")
    : "  None.";

  const prompt = [
    `Sections available: ${input.sections.join(", ")}`,
    `Instructions already in force:\n${active}`,
    `\nThe administrator's request, verbatim:\n"""\n${input.prompt.trim()}\n"""`,
    `It should hold for: ${input.ttlLabel}.`,
    transcriptBlock(input.transcript),
    `\nRound ${round} of ${MAX_ROUNDS}. Ask what you still need, or confirm you are satisfied and write the understanding and the rules.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return guarded(async () => tidyTurn(await generateStructured("drafting", { system, prompt, schema: steerTurnSchema })));
}

/** One round of the commissioning dialogue: either questions, or the settled brief. */
export async function commissionDialogueTurn(input: {
  prompt: string;
  images: CommissionImage[];
  transcript: TranscriptTurn[];
  sections: string[];
  delayMinutes: number;
}): Promise<AiResult<CommissionTurn>> {
  const round = input.transcript.filter((t) => t.role === "engine").length + 1;
  const final = round >= MAX_ROUNDS;

  const system = `
You are the desk editor of ${SITE_NAME}'s automated newsroom, which the staff call the engine. An administrator is commissioning one story. Your job in this conversation is to settle the brief completely — by asking about anything unclear — and then to write it down for the writer.

What the writer can do: write a story of the length asked, in whatever tone and with whatever line the editor wants, from (a) facts and material the editor gives, (b) web pages the editor links, which it reads in full, and (c) published coverage it finds by searching the news for a query, which it also reads in full. It uses the editor's pictures, with their captions and credits, as the main picture and inside the story. It can publish the moment it is written, after the desk's usual delay of ${input.delayMinutes} minutes, or leave the story as a draft for an editor. It can flag the story as breaking.
What it cannot do: check facts the editor gives (it uses them as given), invent quotations or figures, copy text from other outlets, use pictures that were not uploaded here, or post anywhere but this site.

What must be settled before you are satisfied, unless the request already makes it plain:
- What the story is and its main point, and a headline if the editor has one in mind.
- The section, from the list. The tone, and the line to take — whose side, what to argue or imply, how hard — exactly as the editor wants it; if the request hints at a line, ask rather than assume neutrality.
- The facts the editor is supplying, each as one statement, and anything that must be included or avoided.
- Sources: links to read, and whether to also search published coverage; propose the search query.
- Pictures: which is the main picture, the caption and credit for each, and where in the story each belongs (placement can be left to the writer).
- Length; breaking or not; publish now, after the usual delay, or hold as a draft.

${CONVERSATION_RULES}
- Current time: ${nowIst()}.
${final ? "\nFINAL ROUND: you have asked enough. Be satisfied now, choose the most sensible reading of anything still open, and state each such assumption in the understanding." : ""}
`.trim();

  const pictures = input.images.length
    ? input.images
        .map(
          (image, i) =>
            `  Picture ${i + 1}: ${image.alt || "(no description)"}${image.caption ? ` — caption: ${image.caption}` : ""}${image.credit ? ` — credit: ${image.credit}` : ""}${image.width && image.height ? ` (${image.width}×${image.height})` : ""}`,
        )
        .join("\n")
    : "  None uploaded. The writer will find a licensed picture.";

  const prompt = [
    `Sections available: ${input.sections.join(", ")}`,
    `The editor's pictures:\n${pictures}`,
    `\nThe administrator's request, verbatim:\n"""\n${input.prompt.trim()}\n"""`,
    transcriptBlock(input.transcript),
    `\nRound ${round} of ${MAX_ROUNDS}. Ask what you still need, or confirm you are satisfied and write the understanding and the brief.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return guarded(async () =>
    tidyTurn(await generateStructured("drafting", { system, prompt, schema: commissionTurnSchema })),
  );
}

/**
 * Makes a turn safe to act on. A model that says it is satisfied but still
 * lists questions is taken at its word on the first and not the second; one
 * that is not satisfied but asks nothing is given one plain question to ask,
 * because an open dialogue with nothing to answer would never close.
 */
function tidyTurn<T extends { satisfied: boolean; questions: DialogueQuestion[]; understanding: string }>(turn: T): T {
  const seen = new Set<string>();
  const questions = turn.questions
    .map((q, i) => {
      const id = (q.id || `q${i + 1}`).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40) || `q${i + 1}`;
      const options = q.options.map((o) => o.trim()).filter(Boolean);
      return {
        ...q,
        id: seen.has(id) ? `${id}-${i + 1}` : id,
        options,
        type: q.type === "text" || options.length < 2 ? ("text" as const) : q.type,
      };
    })
    .filter((q) => q.text.trim())
    .map((q) => {
      seen.add(q.id);
      return q;
    })
    .slice(0, 4);

  if (turn.satisfied) return { ...turn, questions: [], understanding: turn.understanding.trim() };
  if (!questions.length) {
    return {
      ...turn,
      questions: [
        {
          id: "restate",
          text: "Put the instruction in your own words once more, as fully as you can — the engine could not work out what it still needed to ask.",
          why: "A round with no question would never close.",
          type: "text" as const,
          options: [],
        },
      ],
    };
  }
  return { ...turn, questions };
}

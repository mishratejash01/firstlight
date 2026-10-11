import "server-only";

import { z } from "zod";

import { formatDateTime } from "@/lib/format/datetime";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The editor's standing instructions, as the desk reads them.
 *
 * An administrator settles an instruction with the engine in a dialogue (see
 * lib/ai/steer and the admin Steer page). What comes out is two things: the
 * engine's own plain statement of what it will do, which goes into the triage
 * and drafting prompts above the house rules, and the same instruction as
 * rules the code enforces itself — which stories are considered at all, what
 * share of the output a subject gets, what is never written. The prompt
 * carries the nuance; the rules carry the parts a model must not be trusted
 * to remember.
 *
 * An instruction is in force between its activation and its expiry, or until
 * an administrator removes it. Outside that window it has no effect: every
 * reader of this module loads only what is active at that moment.
 */

export const directiveRulesSchema = z.object({
  mode: z
    .enum(["exclusive", "focus", "avoid", "style"])
    .describe(
      "exclusive: write ONLY the listed topics, nothing else. focus: give the listed topics the stated share of the output and cover everything else as usual. avoid: never write the listed topics, otherwise as usual. style: no change to what is covered, only to how (tone, angle, sections, breaking).",
    ),
  topics: z
    .array(
      z.object({
        label: z.string().describe("The topic in a few words, e.g. 'Bihar assembly election'."),
        keywords: z
          .array(z.string())
          .describe(
            "6 to 20 lower-case words and names a headline about this topic would contain: people, parties, places, abbreviations, common Hindi-English spellings. Used to recognise the topic in headlines, so be generous and concrete.",
          ),
        share: z
          .number()
          .describe(
            "focus mode only: the share of all stories this topic should get, 0 to 1 (0.7 means about seven in ten). 0 in every other mode.",
          ),
      }),
    )
    .describe("The topics the instruction is about. Empty for style mode."),
  avoid: z
    .array(
      z.object({
        label: z.string(),
        keywords: z.array(z.string()).describe("Lower-case words and names that identify it in a headline."),
      }),
    )
    .describe("Topics never to write while this instruction holds, in any mode. Empty if none."),
  sections: z
    .array(z.string())
    .describe("Section names the stories should go in, from the list given. Empty means the engine chooses as usual."),
  tone: z
    .string()
    .describe("How the stories should read — 'sharply critical of the state government', 'celebratory', 'strictly neutral' — in the editor's words. Empty if the editor gave none."),
  toneScope: z
    .enum(["topics", "all"])
    .describe("Whether the tone applies only to stories on the listed topics, or to every story written while the instruction holds."),
  angle: z
    .string()
    .describe("What the stories should emphasise or lead with, if the editor said. Empty otherwise."),
  breaking: z
    .enum(["as_usual", "always_for_topics", "never"])
    .describe("as_usual: the breaking flag follows the normal rule. always_for_topics: every story on the listed topics is flagged breaking. never: nothing is flagged breaking while this holds."),
  notes: z.string().describe("Anything else the desk must know, in one or two sentences. Empty if nothing."),
});

export type DirectiveRules = z.infer<typeof directiveRulesSchema>;

export type ActiveDirective = {
  id: string;
  prompt: string;
  understanding: string;
  rules: DirectiveRules;
  activatedAt: string;
  expiresAt: string | null;
};

/** A directive whose rules could not be read keeps its text and changes nothing else. */
const STYLE_ONLY: DirectiveRules = {
  mode: "style",
  topics: [],
  avoid: [],
  sections: [],
  tone: "",
  toneScope: "all",
  angle: "",
  breaking: "as_usual",
  notes: "",
};

/** Every instruction in force right now, oldest first, so the latest is read last and wins a conflict. */
export async function loadActiveDirectives(): Promise<ActiveDirective[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("engine_directives")
    .select("id, prompt, understanding, rules, activated_at, expires_at")
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("activated_at", { ascending: true });

  return (data ?? [])
    .filter((row) => row.activated_at)
    .map((row) => {
      const parsed = directiveRulesSchema.safeParse(row.rules);
      return {
        id: row.id,
        prompt: row.prompt,
        understanding: row.understanding ?? row.prompt,
        rules: parsed.success ? parsed.data : STYLE_ONLY,
        activatedAt: row.activated_at as string,
        expiresAt: row.expires_at,
      };
    });
}

/**
 * The instructions as a block of prompt text, for the triage and drafting
 * models. Empty when nothing is in force, so callers can append it blindly.
 */
export function directivesPromptBlock(directives: ActiveDirective[]): string {
  if (!directives.length) return "";

  const lines = [
    "EDITOR'S STANDING INSTRUCTIONS",
    "These come from the editor of this publication and take priority over everything above wherever they conflict. They never permit inventing facts, quotations or sources, and never permit copying another outlet's text.",
    "",
  ];

  directives.forEach((directive, index) => {
    const until = directive.expiresAt ? `until ${formatDateTime(directive.expiresAt)}` : "until the editor removes it";
    lines.push(`Instruction ${index + 1} (in force ${until}):`);
    lines.push(directive.understanding.trim());
    lines.push(`Enforced rules: ${describeRules(directive.rules)}`);
    lines.push("");
  });

  if (directives.length > 1) lines.push("If two instructions conflict, the one listed later wins.");
  return lines.join("\n").trim();
}

function describeRules(rules: DirectiveRules): string {
  const parts: string[] = [];
  const topics = rules.topics.map((t) => `${t.label} (${t.keywords.slice(0, 12).join(", ")})`).join("; ");
  switch (rules.mode) {
    case "exclusive":
      parts.push(`write ONLY stories on: ${topics || "the topics named above"}`);
      break;
    case "focus":
      parts.push(
        `give these topics ${Math.round(targetShareOf(rules) * 100)}% of the output: ${topics || "the topics named above"}; everything else as usual`,
      );
      break;
    case "avoid":
      break;
    case "style":
      parts.push("coverage unchanged");
      break;
  }
  if (rules.avoid.length) parts.push(`never write: ${rules.avoid.map((a) => a.label).join(", ")}`);
  if (rules.sections.length) parts.push(`sections: ${rules.sections.join(", ")}`);
  if (rules.tone) parts.push(`tone (${rules.toneScope === "all" ? "every story" : "these topics"}): ${rules.tone}`);
  if (rules.angle) parts.push(`angle: ${rules.angle}`);
  if (rules.breaking !== "as_usual") {
    parts.push(rules.breaking === "never" ? "flag nothing as breaking" : "flag every story on these topics as breaking");
  }
  if (rules.notes) parts.push(rules.notes);
  return parts.join("; ");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether any keyword appears in the text as a whole word (or phrase). */
export function keywordMatch(text: string, keywords: string[]): boolean {
  const haystack = text.toLowerCase();
  return keywords.some((keyword) => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return false;
    // Short tokens ("bjp", "ai") must stand alone or they match inside words.
    const pattern = needle.length <= 4 ? `(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)` : escapeRegExp(needle);
    return new RegExp(pattern, "i").test(haystack);
  });
}

export type DirectiveVerdict = {
  /** True when an exclusive instruction is in force: only matching stories may be written. */
  restricted: boolean;
  /** Matches a topic of an exclusive or focus instruction. */
  match: boolean;
  /** The label of the topic matched, for the record. */
  topic: string | null;
  /** Matches a topic the editor said never to write. */
  avoided: string | null;
};

/** What the rules alone make of a headline (and whatever else is known), without a model. */
export function classifyAgainstDirectives(text: string, directives: ActiveDirective[]): DirectiveVerdict {
  const verdict: DirectiveVerdict = { restricted: false, match: false, topic: null, avoided: null };
  for (const directive of directives) {
    const { rules } = directive;
    if (rules.mode === "exclusive") verdict.restricted = true;
    if (rules.mode === "exclusive" || rules.mode === "focus") {
      for (const topic of rules.topics) {
        if (!verdict.match && keywordMatch(text, topic.keywords)) {
          verdict.match = true;
          verdict.topic = topic.label;
        }
      }
    }
    for (const avoid of rules.avoid) {
      if (!verdict.avoided && keywordMatch(text, avoid.keywords)) verdict.avoided = avoid.label;
    }
  }
  return verdict;
}

export function isExclusive(directives: ActiveDirective[]): boolean {
  return directives.some((d) => d.rules.mode === "exclusive");
}

function targetShareOf(rules: DirectiveRules): number {
  const sum = rules.topics.reduce((acc, topic) => acc + (Number.isFinite(topic.share) ? topic.share : 0), 0);
  return Math.min(Math.max(sum, 0), 0.95);
}

/**
 * The share of the output the focused topics should get, 0 when no focus
 * instruction holds. Several focus instructions add up, to a ceiling that
 * leaves some room for everything else.
 */
export function targetShare(directives: ActiveDirective[]): number {
  const sum = directives
    .filter((d) => d.rules.mode === "focus")
    .reduce((acc, d) => acc + targetShareOf(d.rules), 0);
  return Math.min(sum, 0.95);
}

/** Every keyword from every topic in force, for widening the triage queue. */
export function directiveKeywords(directives: ActiveDirective[]): string[] {
  const out = new Set<string>();
  for (const directive of directives) {
    if (directive.rules.mode !== "exclusive" && directive.rules.mode !== "focus") continue;
    for (const topic of directive.rules.topics) {
      for (const keyword of topic.keywords) {
        const clean = keyword.toLowerCase().replace(/[^a-z0-9 '\-]/g, "").trim();
        if (clean.length >= 3) out.add(clean);
      }
    }
  }
  return [...out];
}

/** The breaking rule in force: the latest instruction that says anything about it. */
export function breakingRule(directives: ActiveDirective[]): DirectiveRules["breaking"] {
  let rule: DirectiveRules["breaking"] = "as_usual";
  for (const directive of directives) {
    if (directive.rules.breaking !== "as_usual") rule = directive.rules.breaking;
  }
  return rule;
}

/**
 * The sections the instructions prefer, as names, for a story on a matched
 * topic. Empty when they leave the choice to the engine.
 */
export function preferredSections(directives: ActiveDirective[]): string[] {
  const names = new Set<string>();
  for (const directive of directives) for (const name of directive.rules.sections) names.add(name);
  return [...names];
}

/**
 * The newest activation time, so a verdict stored on an event before the
 * latest instruction existed is known to be out of date.
 */
export function latestActivation(directives: ActiveDirective[]): number {
  return directives.reduce((latest, d) => Math.max(latest, new Date(d.activatedAt).getTime()), 0);
}

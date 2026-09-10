/**
 * Entity keys.
 *
 * A cheap, deterministic way to say what a mention is about, used as a guard
 * on the embedding clusterer: two mentions only merge if they are close in
 * embedding space AND share at least one entity. That guard is what stops
 * "gold prices fall in Delhi" and "gold prices fall in London" — near-identical
 * sentences about different events — collapsing into one.
 *
 * Deliberately not a model call. Mentions arrive every minute from a dozen
 * streams; running an LLM on each would cost more than the whole rest of the
 * pipeline. Proper-noun runs are a blunt instrument that works well enough on
 * headlines, and the LLM extracts real entities later, once per *event*, when
 * the event is actually worth triaging.
 */

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been", "it",
  "its", "this", "that", "these", "those", "vs", "v", "live", "today", "new",
  "news", "latest", "update", "updates", "how", "what", "why", "when", "who",
  "after", "before", "over", "under", "into", "amid", "says", "said", "will",
  "has", "have", "had", "not", "no", "yes", "may", "can", "could", "should",
  "would", "than", "then", "there", "their", "they", "them", "his", "her",
  "our", "your", "about", "against", "between", "during", "without",
]);

/** Lower-case, diacritics stripped, punctuation collapsed to single spaces. */
export function normaliseText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A canonical key for an entity name: 'Strait of Hormuz' -> 'strait-of-hormuz'. */
export function entityKey(name: string): string {
  return normaliseText(name)
    .split(" ")
    .filter((word) => word && !STOP.has(word))
    .join("-");
}

/**
 * Proper-noun runs from a headline, as entity keys.
 *
 * "Iran claims capture of US underwater drone in Strait of Hormuz" yields
 * iran, us, strait-of-hormuz. Lower-case words break a run, which is why
 * "Strait of Hormuz" survives (its connective is in the allow-list below) and
 * "capture of US" does not.
 */
const CONNECTIVES = new Set(["of", "de", "da", "del", "the", "and", "&"]);

export function extractEntityKeys(text: string, extra: string[] = []): string[] {
  const keys = new Set<string>();

  for (const name of extra) {
    const key = entityKey(name);
    if (key.length > 2) keys.add(key);
  }

  const tokens = text
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  let run: string[] = [];
  const flush = () => {
    // A run of one all-caps token ("US", "EU", "NHS") is an entity; a run of one
    // capitalised ordinary word at sentence start usually is not.
    const meaningful = run.filter((word) => !CONNECTIVES.has(word.toLowerCase()));
    if (meaningful.length >= 2 || (meaningful.length === 1 && /^[A-Z]{2,}$/.test(meaningful[0]))) {
      const key = entityKey(run.join(" "));
      if (key.length > 2) keys.add(key);
    }
    run = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const capitalised = /^[A-Z]/.test(token) || /^[\p{Lu}]/u.test(token);
    const connective = CONNECTIVES.has(token.toLowerCase());

    if (capitalised && !(i === 0 && STOP.has(token.toLowerCase()))) {
      run.push(token);
    } else if (connective && run.length) {
      run.push(token);
    } else {
      flush();
    }
  }
  flush();

  return [...keys];
}

/** Jaccard overlap of two key sets. 0 when either is empty. */
export function entityOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  let shared = 0;
  for (const key of b) if (setA.has(key)) shared += 1;
  return shared / new Set([...a, ...b]).size;
}

export function sharesEntity(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  return b.some((key) => setA.has(key));
}

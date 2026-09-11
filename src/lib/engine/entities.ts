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
  // Headline furniture. Capitalised, recurring, and never the subject.
  "watch", "video", "photos", "photo", "opinion", "exclusive", "breaking",
  "explained", "explainer", "highlights", "recap", "review", "preview",
  "week", "weekend", "tonight", "morning", "evening", "here", "read",
  // Dates. "September" is in forty events a day and identifies none of them.
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december", "jan", "feb", "mar", "apr",
  "jun", "jul", "aug", "sept", "sep", "oct", "nov", "dec", "monday",
  "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

/**
 * Outlets whose names turn up in headlines as bylines and suffixes —
 * "| Hindustan Times", "Reuters:" — and are not what the story is about.
 */
const OUTLETS = new Set([
  "hindustan-times", "times-india", "hindu", "ndtv", "bbc", "bbc-news", "cnn",
  "reuters", "guardian", "indian-express", "express", "news18", "mint",
  "livemint", "economic-times", "financial-express", "india-today", "zee-news",
  "abp-news", "abp", "firstpost", "scroll", "print", "theprint", "wire",
  "yahoo", "msn", "ap", "afp", "pti", "ani", "nyt", "york-times",
  "washington-post", "bloomberg", "al-jazeera", "sky-news", "fox-news", "npr",
  "cnbc", "moneycontrol", "deccan-herald", "telegraph", "independent", "mirror",
  "sun", "daily-mail", "et", "toi", "dna", "jagran", "aaj-tak", "republic",
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

/** A canonical key for an entity name: 'Strait of Hormuz' -> 'strait-hormuz'. */
export function entityKey(name: string): string {
  const words = normaliseText(
    // Possessives are grammar, not identity: "McTominay's" is McTominay.
    name.replace(/['’]s\b/g, "").replace(/['’]/g, ""),
  )
    .split(" ")
    .filter((word) => word && !STOP.has(word));

  // Dotted abbreviations lose their dots to normalisation: "U.S." arrives as
  // "u s" and would key as "u-s", a different entity from "US". Letters on
  // their own are an abbreviation; join them.
  if (words.length > 1 && words.every((word) => word.length === 1)) return words.join("");

  return words.join("-");
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

function isAllCaps(token: string): boolean {
  return /^[A-Z]{2,}$/.test(token.replace(/[^A-Za-z]/g, ""));
}

export function extractEntityKeys(text: string, extra: string[] = []): string[] {
  const keys = new Set<string>();

  for (const name of extra) {
    const key = entityKey(name);
    if (key.length >= 2) keys.add(key);
  }

  // Clause punctuation ends a name. "Reuters: Modi to visit" is two entities,
  // not one, and the colon is the only thing saying so.
  const tokens = text
    .replace(/[:;|\u2014\u2013,()\[\]"\u201c\u201d]/g, " | ")
    .replace(/[^\p{L}\p{N}\s'\u2019&|-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  // A capitalised word at the start of a headline is usually just the start of
  // a sentence — "Police", "Gold", "Officials". It only counts as an entity if
  // it is all-caps ("US") or turns up capitalised again later in the text,
  // which a genuine name tends to and a sentence-starter does not.
  const recurs = (word: string) =>
    tokens.filter((token, i) => i > 0 && token === word).length > 0;

  let run: { token: string; index: number }[] = [];
  const flush = () => {
    const meaningful = run.filter((entry) => !CONNECTIVES.has(entry.token.toLowerCase()));

    if (meaningful.length >= 2) {
      const key = entityKey(run.map((entry) => entry.token).join(" "));
      if (key.length >= 2) keys.add(key);
    } else if (meaningful.length === 1) {
      const { token, index } = meaningful[0];
      const bare = token.replace(/['\u2019]s$/, "");
      const acceptable =
        isAllCaps(bare) ||
        (index > 0 && bare.length >= 4) ||
        (index === 0 && bare.length >= 4 && recurs(token));
      if (acceptable) {
        const key = entityKey(bare);
        if (key.length >= 2) keys.add(key);
      }
    }
    run = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "|") {
      flush();
      continue;
    }
    const capitalised = /^[\p{Lu}]/u.test(token);
    const connective = CONNECTIVES.has(token.toLowerCase());

    if (capitalised && !STOP.has(token.toLowerCase())) {
      run.push({ token, index: i });
      // A possessive ends a name: "McTominay's Napoli" is McTominay and Napoli.
      if (/['\u2019]s$/.test(token)) flush();
    } else if (connective && run.length) {
      run.push({ token, index: i });
    } else {
      flush();
    }
  }
  flush();

  for (const key of keys) if (OUTLETS.has(key)) keys.delete(key);
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

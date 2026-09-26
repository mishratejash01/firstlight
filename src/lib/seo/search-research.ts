import "server-only";

import { normaliseText } from "@/lib/engine/entities";
import { SITE_HOST, SITE_NAME } from "@/lib/site";
import { searchGoogleNews, type NewsHit } from "@/lib/trends/google-news";
import { fetchTrends, type TrendingTerm } from "@/lib/trends/google-trends";

/**
 * Search research for a story, done at the moment it is written.
 *
 * A story is found in search when its headline and opening use the words
 * people type. For news those words can be read, at writing time, from two
 * public feeds. Google Trends lists the searches rising in India right now;
 * where one matches the story, it is the phrase readers are typing. Google
 * News, searched for the story, returns the headlines ranking for it at this
 * moment, and the names most of them share are how the story is being named.
 *
 * The drafter is given all three and chooses the wording (see SEARCH_RULE in
 * lib/ai/draft). No keyword tool and no model call: both feeds are free and
 * quick, and when either fails the story is written without that hint rather
 * than held up.
 */

export type SearchResearch = {
  /** Searches rising in India now that match the story, with Google's traffic band. */
  searches: { term: string; traffic: string | null }[];
  /** Headlines ranking in Google News for the story now, in Google's order. */
  ranking: { title: string; source: string }[];
  /** Names and phrases most of the story's headlines share, most shared first. */
  phrases: string[];
};

/** Longest the writer waits for the research before drafting without it. */
const RESEARCH_DEADLINE_MS = 8_000;

/** Trending searches are fetched once per ten minutes, not once per story. */
const TRENDS_TTL_MS = 10 * 60_000;

/** Words that carry no search intent of their own, headline furniture included. */
const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "of", "to", "in", "on", "for",
  "with", "at", "by", "from", "as", "into", "onto", "over", "under", "after",
  "before", "amid", "about", "against", "between", "during", "without",
  "within", "via", "per", "than", "then", "up", "out", "off", "down",
  "is", "are", "was", "were", "be", "been", "being", "am", "has", "have",
  "had", "do", "does", "did", "will", "would", "could", "should", "can",
  "may", "might", "must", "shall", "it", "its", "he", "she", "they", "we",
  "you", "i", "his", "her", "their", "our", "your", "him", "them", "us",
  "this", "that", "these", "those", "there", "here", "who", "what", "why",
  "how", "when", "where", "which", "not", "no", "yes", "all", "more", "most",
  "says", "said", "say", "report", "reports", "reported", "news", "latest",
  "live", "update", "updates", "today", "breaking", "watch", "video",
  "videos", "photos", "new", "check", "details", "know", "need", "explained",
  "exclusive", "full", "list", "top", "key", "big", "major",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "monday", "tuesday",
  "wednesday", "thursday", "friday", "saturday", "sunday",
]);

/**
 * Words that may sit inside a phrase but never begin or end one: "South Africa
 * vs Guinea" is a search, "South Africa vs" is not.
 */
const JOINERS = new Set(["vs", "v"]);

/** Longest phrase, in words, offered as a shared name: "South Africa vs Guinea". */
const MAX_PHRASE_WORDS = 4;

function words(text: string): string[] {
  // Possessives are grammar, not a different word: "India's" is India.
  return normaliseText(text.replace(/['’]s\b/g, "")).split(" ").filter(Boolean);
}

/** A word worth searching on: not furniture, and a number only if it is a year or an amount. */
function isKeyword(word: string): boolean {
  if (STOP.has(word)) return false;
  if (/^\d+$/.test(word)) return word.length >= 3;
  return word.length >= 2;
}

function keywordsOf(text: string): Set<string> {
  return new Set(words(text).filter(isKeyword));
}

/**
 * English headlines only. Coverage can include Hindi and other Indian
 * languages, whose words say nothing about how an English reader searches.
 */
function isLatinScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  const latin = letters.filter((letter) => /[a-z]/i.test(letter.normalize("NFKD")[0])).length;
  return latin / letters.length >= 0.8;
}

/**
 * The words most of the story's headlines share, most shared first: the
 * story's name as the outlets covering it use it. With too few headlines to
 * agree on anything, the title's own words in order.
 */
function storyTerms(title: string, headlines: string[]): string[] {
  const titleWords = [...keywordsOf(title)];
  const counts = new Map<string, number>();
  for (const text of [title, ...headlines]) {
    for (const word of keywordsOf(text)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const position = (word: string) => {
    const index = titleWords.indexOf(word);
    return index === -1 ? titleWords.length : index;
  };
  const shared = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || position(a[0]) - position(b[0]))
    .map(([word]) => word);
  return shared.length >= 3 ? shared : [...new Set([...shared, ...titleWords])];
}

/** Our own stories are not research into how others are ranking. */
function isOurs(hit: NewsHit): boolean {
  if (hit.source.trim().toLowerCase() === SITE_NAME.toLowerCase()) return true;
  try {
    return hit.sourceUrl ? new URL(hit.sourceUrl).host.replace(/^www\./, "") === SITE_HOST.replace(/^www\./, "") : false;
  } catch {
    return false;
  }
}

/**
 * What ranks in Google News (India, English, last two days) for the story. A
 * query of five terms first; if that finds too little, the three most shared.
 * A hit must carry two of the query's terms, one of them among the two most
 * shared (in practice the story's names), which keeps a story that merely
 * shares the furniture ("vs", "prediction") from being taken for this one.
 */
async function rankingFor(terms: string[]): Promise<NewsHit[]> {
  for (const size of [5, 3]) {
    const query = terms.slice(0, size);
    if (!query.length) return [];
    const hits = await searchGoogleNews(`${query.join(" ")} when:2d`, "IN", "en");
    const needed = Math.min(2, query.length);
    const relevant = hits.filter((hit) => {
      if (isOurs(hit) || !isLatinScript(hit.title)) return false;
      const hitWords = keywordsOf(hit.title);
      return (
        query.filter((word) => hitWords.has(word)).length >= needed &&
        query.slice(0, 2).some((word) => hitWords.has(word))
      );
    });
    if (relevant.length >= 3 || size === 3 || terms.length <= 3) return relevant;
  }
  return [];
}

let trendsCache: { at: number; terms: TrendingTerm[] } | null = null;

async function trendingInIndia(): Promise<TrendingTerm[]> {
  if (trendsCache && Date.now() - trendsCache.at < TRENDS_TTL_MS) return trendsCache.terms;
  try {
    const terms = await fetchTrends("IN");
    trendsCache = { at: Date.now(), terms };
    return terms;
  } catch {
    return trendsCache?.terms ?? [];
  }
}

/** Two headlines about the same thing: most of the shorter one's words are in the longer. */
function sameStory(a: Set<string>, b: Set<string>): boolean {
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared >= 3 && shared / Math.min(a.size, b.size) >= 0.6;
}

/**
 * Whether a rising search is about this story. Either every word of the
 * search is in the story's headlines (a one-word search, such as "gold", must
 * also be in at least half of them, or it would match far too much), or
 * Google has attached the search to a headline about the same story.
 */
function searchMatches(term: TrendingTerm, headlines: Set<string>[], storyWords: Set<string>): boolean {
  // Our stories are in English; a search typed in another script is not how
  // our readers will look for them.
  if (!isLatinScript(term.term)) return false;
  const termWords = [...keywordsOf(term.term)];
  if (!termWords.length) return false;

  if (termWords.every((word) => storyWords.has(word))) {
    if (termWords.length > 1) return true;
    const carrying = headlines.filter((headline) => headline.has(termWords[0])).length;
    return carrying >= Math.max(1, headlines.length / 2);
  }

  return term.newsItems.some((item) => {
    const itemWords = keywordsOf(item.title);
    return headlines.some((headline) => sameStory(itemWords, headline));
  });
}

/**
 * Names and phrases of up to four words that at least two of the headlines
 * (and a fifth of them, when there are many) share, never starting or ending
 * on a stop word or a joiner, and never a bare number. A phrase inside a
 * longer one that is nearly as common is dropped for the longer one: "repo
 * rate", not "repo" as well. Each is given in the capitalisation the headlines
 * use ("RBI", "Sanjay Malhotra").
 */
function sharedPhrases(headlines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const headline of headlines) {
    const tokens = words(headline);
    const seen = new Set<string>();
    for (let size = 1; size <= MAX_PHRASE_WORDS; size++) {
      for (let start = 0; start + size <= tokens.length; start++) {
        const gram = tokens.slice(start, start + size);
        const [first, last] = [gram[0], gram[size - 1]];
        if (!isKeyword(first) || !isKeyword(last) || JOINERS.has(first) || JOINERS.has(last)) continue;
        if (size === 1 && /^\d+$/.test(first)) continue;
        const phrase = gram.join(" ");
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
  }

  const minimum = Math.max(2, Math.ceil(headlines.length * 0.2));
  const candidates = [...counts.entries()].filter(([, count]) => count >= minimum);
  const length = (phrase: string) => phrase.split(" ").length;

  return candidates
    .filter(
      ([phrase, count]) =>
        !candidates.some(
          ([longer, longerCount]) =>
            length(longer) > length(phrase) &&
            ` ${longer} `.includes(` ${phrase} `) &&
            longerCount >= count * 0.8,
        ),
    )
    .sort((a, b) => b[1] - a[1] || length(b[0]) - length(a[0]))
    .slice(0, 8)
    .map(([phrase]) => displayForm(phrase, headlines));
}

/** The phrase as the headlines write it, capitals and all. */
function displayForm(phrase: string, headlines: string[]): string {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${phrase.split(" ").join("[^\\p{L}\\p{N}]+")}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  for (const headline of headlines) {
    const match = headline.match(pattern);
    if (match) return match[0];
  }
  return phrase;
}

async function research(title: string, coverage: string[]): Promise<SearchResearch | null> {
  const englishCoverage = coverage.filter((headline) => headline && isLatinScript(headline));
  // Nothing in English to research from: the story will be written from
  // sources in other languages, and their words are not our readers' searches.
  if (!englishCoverage.length && !isLatinScript(title)) return null;
  const terms = storyTerms(title, englishCoverage);

  const [ranked, trending] = await Promise.all([rankingFor(terms), trendingInIndia()]);

  const seen = new Set<string>();
  const ranking = ranked
    .filter((hit) => {
      const key = normaliseText(hit.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((hit) => ({ title: hit.title, source: hit.source }));

  // Each headline once, however many feeds carried it: the title is usually
  // one of the coverage headlines, and the same story often ranks too, and a
  // headline counted twice would pass off its own wording as shared.
  const counted = new Set<string>();
  const headlines = [title, ...englishCoverage, ...ranking.map((hit) => hit.title)].filter((headline) => {
    const key = normaliseText(headline);
    if (!key || counted.has(key)) return false;
    counted.add(key);
    return true;
  });
  const headlineWords = headlines.map(keywordsOf);
  const storyWords = new Set(headlineWords.flatMap((set) => [...set]));

  const searches = trending
    .filter((term) => searchMatches(term, headlineWords, storyWords))
    .sort((a, b) => (b.trafficRank ?? 0) - (a.trafficRank ?? 0))
    .slice(0, 5)
    .map((term) => ({ term: term.term, traffic: term.approxTraffic }));

  const phrases = sharedPhrases(headlines);

  if (!searches.length && !ranking.length && !phrases.length) return null;
  return { searches, ranking, phrases };
}

/**
 * Researches how a story is being searched for and named, from its title and
 * the headlines of the coverage it was built from. Resolves to null when there
 * is nothing useful, and never takes longer than a few seconds: the story is
 * written either way.
 */
export async function researchSearch({
  title,
  headlines,
}: {
  title: string;
  headlines: (string | null | undefined)[];
}): Promise<SearchResearch | null> {
  const coverage = headlines.filter((headline): headline is string => Boolean(headline?.trim()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RESEARCH_DEADLINE_MS);
  });
  try {
    return await Promise.race([research(title, coverage).catch(() => null), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

import "server-only";

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import { createAdminClient } from "@/lib/supabase/admin";
import { CRAWLER_USER_AGENT } from "@/lib/site";
import { checkRobots } from "./robots";

/**
 * Fetches a linked article and extracts its readable text.
 *
 * Mozilla's Readability is the same algorithm behind Firefox's Reader View —
 * worth using rather than writing heuristics, because news pages are a mess of
 * navigation, related-story rails, consent banners and newsletter prompts, and
 * telling those from the article is the entire problem.
 *
 * linkedom rather than jsdom: it implements enough DOM for Readability at a
 * fraction of the cold-start cost, which matters when this runs in a function
 * that spins up fresh every fifteen minutes.
 *
 * Everything extracted is held for the newsroom to read and summarise from,
 * with attribution. It is never published as-is.
 */

const USER_AGENT = CRAWLER_USER_AGENT;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
/** Roughly 3,000 words. Beyond that a summariser gains nothing and costs more. */
const MAX_CONTENT_CHARS = 18_000;
/** Below this there is no article — usually a paywall stub or a consent wall. */
const MIN_CONTENT_CHARS = 400;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type SourceDocument = {
  url: string;
  host: string;
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  content: string | null;
  wordCount: number | null;
  /** When the outlet says it published the piece, if the page says so. */
  publishedAt: string | null;
  status: "ok" | "blocked" | "failed" | "unextractable";
  error?: string;
};

/**
 * The publication date the page declares about itself.
 *
 * Feeds do not always carry one — Google Trends matches never do — and a
 * story dated by the moment we first saw it can be days old. The article
 * page usually knows: Open Graph and article meta tags, JSON-LD, or a
 * <time> element in the byline. First plausible date wins.
 */
function declaredPublishedAt(document: Document): string | null {
  const candidates: string[] = [];
  const meta = (selector: string) =>
    document.querySelector(selector)?.getAttribute("content") ?? null;
  for (const selector of [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publish-date"]',
    'meta[name="date"]',
    'meta[itemprop="datePublished"]',
    'meta[name="dc.date"]',
    'meta[name="DC.date.issued"]',
  ]) {
    const value = meta(selector);
    if (value) candidates.push(value);
  }
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 5)) {
    const match = /"datePublished"\s*:\s*"([^"]+)"/.exec(script.textContent ?? "");
    if (match) candidates.push(match[1]);
  }
  const time = document.querySelector("time[datetime]")?.getAttribute("datetime");
  if (time) candidates.push(time);

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getTime() < Date.now() + 86_400_000) {
      return parsed.toISOString();
    }
  }
  return null;
}

function tidy(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchAndExtract(url: string): Promise<SourceDocument> {
  const host = new URL(url).host;
  const base: SourceDocument = {
    url,
    host,
    title: null,
    byline: null,
    excerpt: null,
    content: null,
    wordCount: null,
    publishedAt: null,
    status: "failed",
  };

  const robots = await checkRobots(url);
  if (!robots.allowed) {
    return { ...base, status: "blocked", error: robots.reason ?? "Disallowed" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      return { ...base, error: `Responded ${response.status}` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return { ...base, status: "unextractable", error: `Not HTML (${contentType})` };
    }

    // Guard against a very large page before it is parsed, not after.
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared && declared > MAX_HTML_BYTES) {
      return { ...base, status: "unextractable", error: "Page too large" };
    }

    html = await response.text();
    if (html.length > MAX_HTML_BYTES) {
      return { ...base, status: "unextractable", error: "Page too large" };
    }
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "Fetch failed",
    };
  } finally {
    clearTimeout(timeout);
  }

  try {
    const { document } = parseHTML(html);
    // Readability wants to know where the document came from, to resolve
    // relative links while it works.
    const article = new Readability(document as never, {
      charThreshold: MIN_CONTENT_CHARS,
    }).parse();

    if (!article?.textContent) {
      return { ...base, status: "unextractable", error: "No article content found" };
    }

    const content = tidy(article.textContent);
    if (content.length < MIN_CONTENT_CHARS) {
      // Almost always a paywall stub or a consent interstitial rather than a
      // genuinely short story.
      return {
        ...base,
        status: "unextractable",
        error: `Only ${content.length} characters extracted — likely paywalled`,
      };
    }

    const truncated = content.slice(0, MAX_CONTENT_CHARS);
    const declared = declaredPublishedAt(document as unknown as Document);
    const readabilityDate = (article as { publishedTime?: string | null }).publishedTime;
    const fromReadability =
      readabilityDate && !Number.isNaN(new Date(readabilityDate).getTime())
        ? new Date(readabilityDate).toISOString()
        : null;

    return {
      url,
      host,
      title: article.title ? tidy(article.title) : null,
      byline: article.byline ? tidy(article.byline) : null,
      excerpt: article.excerpt ? tidy(article.excerpt) : null,
      content: truncated,
      wordCount: truncated.split(/\s+/).filter(Boolean).length,
      publishedAt: declared ?? fromReadability,
      status: "ok",
    };
  } catch (error) {
    return {
      ...base,
      status: "unextractable",
      error: error instanceof Error ? error.message : "Extraction failed",
    };
  }
}

/**
 * Returns the readable text for a URL, fetching it only if we do not already
 * have it.
 *
 * The same story trends for hours and surfaces under several terms. Re-fetching
 * a publisher's page every fifteen minutes to read an article we already read
 * is both wasteful and rude, so anything fetched in the last six hours is
 * reused — including failures, so a paywalled site is not retried on a loop.
 */
export async function getSourceDocument(url: string): Promise<SourceDocument> {
  const supabase = createAdminClient();

  const { data: cached } = await supabase
    .from("source_documents")
    .select("url, host, title, byline, excerpt, content, word_count, published_at, status, error, fetched_at")
    .eq("url", url)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return {
      url: cached.url,
      host: cached.host,
      title: cached.title,
      byline: cached.byline,
      excerpt: cached.excerpt,
      content: cached.content,
      wordCount: cached.word_count,
      publishedAt: cached.published_at,
      status: cached.status as SourceDocument["status"],
      error: cached.error ?? undefined,
    };
  }

  const document = await fetchAndExtract(url);

  await supabase.from("source_documents").upsert(
    {
      url: document.url,
      host: document.host,
      title: document.title,
      byline: document.byline,
      excerpt: document.excerpt,
      content: document.content,
      word_count: document.wordCount,
      published_at: document.publishedAt,
      status: document.status,
      error: document.error ?? null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "url" },
  );

  return document;
}

/**
 * Reads several sources for one story, one at a time.
 *
 * Sequential on purpose. Firing parallel requests at three publishers from one
 * function is how an IP gets blocked, and the whole pipeline runs on a
 * fifteen-minute schedule where a few extra seconds costs nothing.
 */
export async function getSourceDocuments(urls: string[]): Promise<SourceDocument[]> {
  const documents: SourceDocument[] = [];
  for (const url of urls) {
    documents.push(await getSourceDocument(url));
  }
  return documents;
}

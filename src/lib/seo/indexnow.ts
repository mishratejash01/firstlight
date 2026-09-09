import "server-only";

/**
 * IndexNow submission.
 *
 * Breaking-news search demand for one narrow detail spikes and decays within
 * hours, which is faster than ordinary crawl cadence will ever notice. IndexNow
 * is a push: one request tells participating engines (Bing, Yandex, Seznam,
 * Naver) that a URL changed now rather than eventually.
 *
 * Note on the Google Indexing API: it is documented as supporting JobPosting
 * and BroadcastEvent only. Using it for news articles is outside its stated
 * scope, so this codebase does not pretend to. For Google, the honest levers
 * are the Google News sitemap and genuinely fresh, well-structured pages.
 */

const ENDPOINT = "https://api.indexnow.org/IndexNow";

export async function submitToIndexNow(urls: string[]): Promise<
  { ok: true; submitted: number } | { ok: false; reason: string }
> {
  const key = process.env.INDEXNOW_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!key) return { ok: false, reason: "INDEXNOW_KEY is not configured" };
  if (!siteUrl) return { ok: false, reason: "NEXT_PUBLIC_SITE_URL is not configured" };
  if (!urls.length) return { ok: true, submitted: 0 };

  const host = new URL(siteUrl).host;

  // Submitting a URL on another host gets the whole key rejected, so filter
  // rather than trusting callers.
  const sameHost = urls.filter((url) => {
    try {
      return new URL(url).host === host;
    } catch {
      return false;
    }
  });

  if (!sameHost.length) return { ok: false, reason: "No URLs matched the site host" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${siteUrl}/${key}.txt`,
        urlList: sameHost,
      }),
    });

    if (!response.ok) {
      return { ok: false, reason: `IndexNow responded ${response.status}` };
    }
    return { ok: true, submitted: sameHost.length };
  } catch (error) {
    // Never let a failed ping block a publish. The story going live matters
    // more than the notification that it did.
    return { ok: false, reason: error instanceof Error ? error.message : "Request failed" };
  }
}

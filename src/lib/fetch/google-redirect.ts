import "server-only";

/**
 * Resolves a Google News redirect to the article it points at.
 *
 * Every link on a Google News feed is a news.google.com redirect that only a
 * browser can follow, which is why the writer could not read any of the
 * corroborating coverage the engine collected. The article page carries a
 * signature and timestamp; posted back to Google's own endpoint with the
 * article id, they return the real URL. Tested on live links before it was
 * relied on: three of three resolved in about a second each.
 *
 * Best effort. Anything that fails returns the original URL, and the fetch
 * layer treats that as unreadable, which is what it was already.
 */

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const cache = new Map<string, string>();

export function isGoogleNewsRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "news.google.com" && /\/articles\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function resolveGoogleNewsUrl(url: string): Promise<string> {
  if (!isGoogleNewsRedirect(url)) return url;
  const cached = cache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const articleId = url.match(/\/articles\/([^?/]+)/)?.[1];
    if (!articleId) return url;

    const page = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!page.ok) return url;
    const html = await page.text();

    const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!signature || !timestamp) return url;

    const request = JSON.stringify([
      "garturlreq",
      [
        ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
        "X",
        "X",
        1,
        [1, 1, 1],
        1,
        1,
        null,
        0,
        0,
        null,
        0,
      ],
      articleId,
      Number(timestamp),
      signature,
    ]);
    const body = new URLSearchParams({
      "f.req": JSON.stringify([[["Fbv4je", request, null, "generic"]]]),
    });

    const response = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
      cache: "no-store",
    });
    if (!response.ok) return url;

    const text = await response.text();
    const resolved =
      text.match(/\\"(https?:\/\/(?!news\.google\.com)[^\\"]+)\\"/)?.[1] ??
      text.match(/"(https?:\/\/(?!news\.google\.com)[^"]+)"/)?.[1];
    if (!resolved) return url;

    cache.set(url, resolved);
    return resolved;
  } catch {
    return url;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * One paper, one key.
 *
 * The engine identifies an outlet by the host of its article URLs, and counts
 * distinct hosts when it asks how many independent sources carry a story.
 * Some papers publish under more than one host — the BBC as bbc.co.uk and
 * bbc.com, Economic Times as its full host and a mobile one — and each of
 * those was counting as a separate source, so a single BBC story could clear
 * the two-source verification gate on its own. Every host passes through
 * here before it becomes a key.
 *
 * Only genuine article hosts belong in this table. Feed hosts (feeds.bbci.co.uk,
 * rss.nytimes.com) never become keys: wire mentions are keyed by the source's
 * homepage, not by where the feed happens to be served from.
 */
const HOST_ALIASES: Record<string, string> = {
  "bbc.com": "bbc.co.uk",
  "m.economictimes.com": "economictimes.indiatimes.com",
  "m.timesofindia.com": "timesofindia.indiatimes.com",
  "edition.cnn.com": "cnn.com",
  "amp.theguardian.com": "theguardian.com",
  "m.hindustantimes.com": "hindustantimes.com",
};

/** Lower-cases, strips a leading www., then collapses known aliases. */
export function canonicalHost(host: string): string {
  const bare = host.toLowerCase().replace(/^www\./, "");
  return HOST_ALIASES[bare] ?? bare;
}

/** The canonical host of a URL, or null when the string is not a URL. */
export function hostOfUrl(url: string): string | null {
  try {
    return canonicalHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

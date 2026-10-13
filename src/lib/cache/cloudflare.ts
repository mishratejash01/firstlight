import "server-only";

/**
 * Cloudflare's cache in front of the site.
 *
 * Pages are built once and served from Cloudflare's edge until their
 * Cache-Control time runs out, which is what keeps the server idle. The one
 * thing the edge cannot know is that a page changed early: the desk corrected
 * a story, a scheduled story went live, an editor pinned the front page. Each
 * of those rebuilds the page here (revalidatePath) and must also drop the
 * edge's copy, which this does. Without the zone and token it does nothing,
 * which is right wherever Cloudflare is not in front.
 *
 * A story page is purged by prefix rather than by its exact address: Next.js
 * fetches a page's data for in-site navigation at the same path with an
 * `_rsc` query string, and a prefix takes every such variant with it. The
 * front page and section fronts are purged by exact address: a prefix on "/"
 * would empty the whole cache, and those variants expire within minutes.
 *
 * Free-plan limits: 30 addresses or prefixes per request, and prefix purges
 * at five requests a minute with a burst of 25. One request per kind per
 * call keeps a busy desk pass inside that.
 */
const API = "https://api.cloudflare.com/client/v4";
const PER_REQUEST = 30;
const TIMEOUT_MS = 8_000;

type Config = { zone: string; token: string; origin: string; host: string };

function config(): Config | null {
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!zone || !token || !site) return null;
  const url = new URL(site);
  return { zone, token, origin: url.origin, host: url.host };
}

async function purge(cfg: Config, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${API}/zones/${cfg.zone}/purge_cache`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Cloudflare purge answered ${response.status}: ${text.slice(0, 200)}`);
  }
}

function batches<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += PER_REQUEST) out.push(items.slice(i, i + PER_REQUEST));
  return out;
}

/** Drops the edge's copy of these site paths. Never throws: a failed purge is logged, and the page expires on its own. */
export async function purgeEdge(paths: string[]): Promise<{ purged: number }> {
  const cfg = config();
  if (!cfg) return { purged: 0 };
  const unique = Array.from(new Set(paths.filter((path) => path.startsWith("/"))));
  const deep = (path: string) => path.split("/").filter(Boolean).length >= 2;
  const prefixes = unique.filter(deep).map((path) => `${cfg.host}${path}`);
  const files = unique.filter((path) => !deep(path)).map((path) => `${cfg.origin}${path}`);
  try {
    for (const batch of batches(files)) await purge(cfg, { files: batch });
    for (const batch of batches(prefixes)) await purge(cfg, { prefixes: batch });
  } catch (error) {
    console.error("[edge] purge failed", error);
  }
  return { purged: unique.length };
}

/** Drops everything the edge holds for the site: for a change that is on every page, such as the navigation. */
export async function purgeEdgeEverything(): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  try {
    await purge(cfg, { purge_everything: true });
  } catch (error) {
    console.error("[edge] purge everything failed", error);
  }
}

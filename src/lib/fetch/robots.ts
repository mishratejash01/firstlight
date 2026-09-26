import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CRAWLER_TOKEN, CRAWLER_USER_AGENT } from "@/lib/site";

/**
 * robots.txt, checked before anything is fetched.
 *
 * This is not optional politeness. We are an automated agent reading other
 * publishers' pages; robots.txt is how they say whether that is acceptable, and
 * ignoring it is the difference between a newsroom using a source and a bot
 * scraping one. A publisher who disallows us gets no request beyond the
 * robots.txt itself.
 *
 * Decisions are cached per host for a day. Re-fetching robots.txt before every
 * article would triple our request count against the same servers we are trying
 * not to burden.
 */

const USER_AGENT = CRAWLER_TOKEN;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

type Rule = { allow: boolean; path: string };

type RobotsPolicy = {
  rules: Rule[];
  crawlDelaySeconds: number | null;
  fetchFailed: boolean;
};

/**
 * Parses the groups that apply to us: our own user agent, then the wildcard.
 *
 * A specific group wins outright — that is what the standard says, and a
 * publisher who has written rules naming a bot means them to replace the
 * general ones rather than stack with them.
 */
function parseRobots(body: string): RobotsPolicy {
  const lines = body.split(/\r?\n/);

  const groups = new Map<string, Rule[]>();
  const delays = new Map<string, number>();
  let currentAgents: string[] = [];
  let lastWasAgent = false;

  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      // Consecutive user-agent lines share one group of rules.
      if (!lastWasAgent) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!currentAgents.length) continue;

    for (const agent of currentAgents) {
      if (field === "allow" || field === "disallow") {
        const rules = groups.get(agent) ?? [];
        rules.push({ allow: field === "allow", path: value });
        groups.set(agent, rules);
      } else if (field === "crawl-delay") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) delays.set(agent, parsed);
      }
    }
  }

  const ours = USER_AGENT.toLowerCase();
  const applicable = groups.has(ours) ? ours : groups.has("*") ? "*" : null;

  return {
    rules: applicable ? (groups.get(applicable) ?? []) : [],
    crawlDelaySeconds: applicable ? (delays.get(applicable) ?? null) : null,
    fetchFailed: false,
  };
}

/** Converts a robots path pattern, which supports * and $, into a regex. */
function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false;

  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  const anchored = escaped.endsWith("\\$")
    ? `^${escaped.slice(0, -2)}$`
    : `^${escaped}`;

  try {
    return new RegExp(anchored).test(path);
  } catch {
    return false;
  }
}

/**
 * Longest matching rule wins, and Allow beats Disallow at equal length — the
 * behaviour the standard specifies and that publishers write their files
 * expecting.
 */
function isAllowed(policy: RobotsPolicy, path: string): boolean {
  let best: { length: number; allow: boolean } | null = null;

  for (const rule of policy.rules) {
    if (!pathMatches(rule.path, path)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { length, allow: rule.allow };
    }
  }

  // No rule matched: the default is allowed, which is what robots.txt means.
  return best ? best.allow : true;
}

async function loadPolicy(host: string): Promise<RobotsPolicy> {
  const supabase = createAdminClient();

  const { data: cached } = await supabase
    .from("robots_cache")
    .select("rules, crawl_delay_seconds, fetched_at, fetch_failed")
    .eq("host", host)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return {
      rules: (cached.rules as unknown as Rule[]) ?? [],
      crawlDelaySeconds: cached.crawl_delay_seconds ? Number(cached.crawl_delay_seconds) : null,
      fetchFailed: cached.fetch_failed,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let policy: RobotsPolicy;
  try {
    const response = await fetch(`https://${host}/robots.txt`, {
      signal: controller.signal,
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      cache: "no-store",
    });

    if (response.status === 404) {
      // No robots.txt means no restrictions.
      policy = { rules: [], crawlDelaySeconds: null, fetchFailed: false };
    } else if (!response.ok) {
      policy = { rules: [], crawlDelaySeconds: null, fetchFailed: true };
    } else {
      policy = parseRobots(await response.text());
    }
  } catch {
    policy = { rules: [], crawlDelaySeconds: null, fetchFailed: true };
  } finally {
    clearTimeout(timeout);
  }

  await supabase.from("robots_cache").upsert(
    {
      host,
      rules: policy.rules as never,
      crawl_delay_seconds: policy.crawlDelaySeconds,
      fetched_at: new Date().toISOString(),
      fetch_failed: policy.fetchFailed,
    },
    { onConflict: "host" },
  );

  return policy;
}

export type RobotsDecision = {
  allowed: boolean;
  crawlDelaySeconds: number | null;
  reason?: string;
};

export async function checkRobots(url: string): Promise<RobotsDecision> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, crawlDelaySeconds: null, reason: "Malformed URL" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { allowed: false, crawlDelaySeconds: null, reason: "Unsupported protocol" };
  }

  const policy = await loadPolicy(parsed.host);

  // A robots.txt we could not read is treated as permission. Refusing on a
  // transient network failure would silently stop the pipeline for hours, and
  // an unreachable robots.txt is not a stated objection.
  if (policy.fetchFailed) {
    return { allowed: true, crawlDelaySeconds: null, reason: "robots.txt unreachable" };
  }

  const allowed = isAllowed(policy, parsed.pathname + parsed.search);
  return {
    allowed,
    crawlDelaySeconds: policy.crawlDelaySeconds,
    reason: allowed ? undefined : "Disallowed by robots.txt",
  };
}

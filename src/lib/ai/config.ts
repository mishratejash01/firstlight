import "server-only";

import { createHash } from "node:crypto";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import { SITE_NAME, SITE_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Model routing: a pool of keys per provider, walked in quality order, with
 * refusals shared between function instances.
 *
 * Every free tier is a per-key allowance, and one key was the whole
 * newsroom's ceiling. Now a job has a chain: the strongest model on every
 * key of its provider, then the next provider's, and so on. A key that is
 * refused — quota, rate limit, outage — is marked cooling in the database,
 * so the many instances Vercel runs at once all step past it rather than
 * each discovering the same dead key one refusal at a time.
 *
 * Keys arrive as comma-separated environment variables and never leave the
 * process; the health table knows a key only by its provider and a short
 * hash. Model ids are overridable by environment variable so a retired id
 * can be swapped without a deploy from this file.
 */

export type Provider = "google" | "groq" | "openrouter" | "anthropic" | "gateway";
export type Kind = "drafting" | "assist";

export type ChainEntry = {
  provider: Provider;
  modelId: string;
  keyId: string;
  label: string;
  model: LanguageModel;
};

const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  gateway: "Vercel AI Gateway",
};

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

/** The keys held for a provider, pool first, then the single legacy variable. */
function keysFor(provider: Provider): string[] {
  const keys = (() => {
    switch (provider) {
      case "google":
        return [...list("GOOGLE_GENERATIVE_AI_API_KEYS"), ...list("GOOGLE_GENERATIVE_AI_API_KEY")];
      case "groq":
        return [...list("GROQ_API_KEYS"), ...list("GROQ_API_KEY")];
      case "openrouter":
        return [...list("OPENROUTER_API_KEYS"), ...list("OPENROUTER_API_KEY")];
      case "anthropic":
        return list("ANTHROPIC_API_KEY");
      case "gateway":
        return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN ? ["gateway"] : [];
    }
  })();
  return [...new Set(keys)];
}

/**
 * Model ids per provider and job. Verified against each provider's live
 * model list on 2026-09-11: Groq had retired the Llama 3 ids and serves
 * gpt-oss and Qwen; OpenRouter's free tier lists Gemma 4 and Nemotron with
 * structured output support.
 */
const TIERS: Record<Kind, { provider: Provider; modelId: string }[]> = {
  drafting: [
    // 3.5 leads on observed availability, not age: 3.8 returned 503 "high
    // demand" on two of three attempts while 3.5 answered every time.
    { provider: "google", modelId: process.env.AI_DRAFTING_MODEL ?? "gemini-3.5-flash" },
    { provider: "groq", modelId: process.env.GROQ_DRAFTING_MODEL ?? "openai/gpt-oss-120b" },
    { provider: "google", modelId: "gemini-3.8-flash" },
    { provider: "anthropic", modelId: "claude-sonnet-5" },
    { provider: "gateway", modelId: "anthropic/claude-sonnet-5" },
  ],
  assist: [
    { provider: "google", modelId: process.env.AI_ASSIST_MODEL ?? "gemini-3.5-flash-lite" },
    { provider: "groq", modelId: process.env.GROQ_ASSIST_MODEL ?? "openai/gpt-oss-20b" },
    ...list("OPENROUTER_ASSIST_MODELS").map((modelId) => ({ provider: "openrouter" as const, modelId })),
    { provider: "openrouter", modelId: "google/gemma-4-26b-a4b-it:free" },
    { provider: "openrouter", modelId: "nex-agi/nex-n2.5-mini:free" },
    { provider: "google", modelId: "gemini-3.5-flash" },
    { provider: "groq", modelId: "openai/gpt-oss-120b" },
    { provider: "anthropic", modelId: "claude-haiku-4.5" },
    { provider: "gateway", modelId: "anthropic/claude-haiku-4.5" },
  ],
};

function keyId(provider: Provider, key: string): string {
  return `${provider}:${createHash("sha256").update(key).digest("hex").slice(0, 8)}`;
}

function build(provider: Provider, key: string, modelId: string): LanguageModel {
  switch (provider) {
    case "google":
      return createGoogleGenerativeAI({ apiKey: key })(modelId);
    case "groq":
      return createGroq({ apiKey: key })(modelId);
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: key,
        headers: {
          "HTTP-Referer": SITE_URL,
          "X-Title": SITE_NAME,
        },
      })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey: key })(modelId);
    default:
      // The gateway is the AI SDK's default provider, addressed by string.
      return modelId;
  }
}

// ---------------------------------------------------------------------------
// Health: which keys are cooling, shared through the database.
// ---------------------------------------------------------------------------

let coolingCache: { until: Map<string, number>; loadedAt: number } | null = null;
const COOLING_CACHE_MS = 20_000;

async function loadCooling(): Promise<Map<string, number>> {
  if (coolingCache && Date.now() - coolingCache.loadedAt < COOLING_CACHE_MS) return coolingCache.until;
  const until = new Map<string, number>();
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("ai_key_health")
      .select("key_id, cooling_until")
      .gt("cooling_until", new Date().toISOString());
    for (const row of data ?? []) {
      if (row.cooling_until) until.set(row.key_id, new Date(row.cooling_until).getTime());
    }
  } catch {
    // No health table reachable: treat every key as available.
  }
  coolingCache = { until, loadedAt: Date.now() };
  return until;
}

async function record(entry: ChainEntry, ok: boolean, error?: string, cooldownSeconds = 0) {
  if (!ok && cooldownSeconds > 0 && coolingCache) {
    coolingCache.until.set(entry.keyId, Date.now() + cooldownSeconds * 1000);
  }
  try {
    const supabase = createAdminClient();
    await supabase.rpc("ai_key_record", {
      p_key_id: entry.keyId,
      p_provider: entry.provider,
      p_label: entry.label,
      p_ok: ok,
      p_error: error ?? undefined,
      p_cooldown_seconds: cooldownSeconds,
    });
  } catch {
    // Health is advisory. A failed record must not fail the job.
  }
}

/**
 * How long to leave a key alone after a refusal.
 *
 * A daily quota does not come back for an hour at least; a per-minute
 * limit or an overloaded model comes back in minutes; a key the provider
 * rejects outright is dead until someone looks at it. Anything else — a
 * schema the model would not follow, a truncated answer — is the model's
 * fault, not the key's, and the next model simply gets a turn.
 */
function classify(error: unknown): { cooldownSeconds: number; message: string } {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  const text = message.toLowerCase();

  if (
    /api key not valid|invalid api key|invalid authentication|credentials|permission_denied|unauthorized|\b401\b|\b403\b/.test(text) ||
    /credit card|payment required|billing account|\b402\b/.test(text)
  ) {
    // A key the provider rejects, or an account that cannot pay, is dead
    // until someone looks at it. Trying it on every call cost a round trip
    // each time and never once succeeded.
    return { cooldownSeconds: 6 * 3600, message };
  }
  if (/per day|daily|requests per day|rpd|exceeded your current quota/.test(text)) {
    return { cooldownSeconds: 3600, message };
  }
  if (/\b429\b|quota|rate limit|too many requests|resource_exhausted/.test(text)) {
    return { cooldownSeconds: 600, message };
  }
  if (/\b50[0-4]\b|overloaded|high demand|unavailable|timeout|timed out|econnreset|fetch failed/.test(text)) {
    return { cooldownSeconds: 120, message };
  }
  return { cooldownSeconds: 0, message };
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

/** Advances on every call, so consecutive calls start on consecutive keys. */
let rotationCounter = 0;

/**
 * Every (model, key) pair for a job, in order: tier by tier, and within a
 * tier every key of that provider, starting one key further along on each
 * call. The previous version moved the start once a minute, so a desk run
 * that made six calls in that minute put all six on one key and hit its
 * per-minute limit while twelve others sat idle; one key ended the day with
 * twice the calls of any other. Per-call rotation spreads a minute's calls
 * across the pool. It cannot create quota — keys that share a Google
 * project share one daily allowance whatever the order — but it stops a
 * single key being the one that always breaks first.
 *
 * Cooling keys are left out unless nothing else is left.
 */
export async function chainFor(kind: Kind): Promise<ChainEntry[]> {
  const cooling = await loadCooling();
  rotationCounter = (rotationCounter + 1) % 1_000_000;
  const rotation = Math.floor(Date.now() / 60_000) + rotationCounter;
  const entries: ChainEntry[] = [];
  const seen = new Set<string>();

  for (const tier of TIERS[kind]) {
    const keys = keysFor(tier.provider);
    if (!keys.length) continue;
    const start = rotation % keys.length;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[(start + i) % keys.length];
      const id = keyId(tier.provider, key);
      const tag = `${id}|${tier.modelId}`;
      if (seen.has(tag)) continue;
      seen.add(tag);
      entries.push({
        provider: tier.provider,
        modelId: tier.modelId,
        keyId: id,
        label: `${PROVIDER_LABELS[tier.provider]} …${key === "gateway" ? "" : key.slice(-4)}`,
        model: build(tier.provider, key, tier.modelId),
      });
    }
  }

  const available = entries.filter((entry) => (cooling.get(entry.keyId) ?? 0) < Date.now());
  return available.length ? available : entries;
}

/**
 * Runs one job against the chain, stepping to the next (model, key) on any
 * failure and recording each outcome. Throws the last error only when the
 * whole chain has refused.
 */
export async function runWithChain<T>(
  kind: Kind,
  job: (model: LanguageModel, entry: ChainEntry) => Promise<T>,
): Promise<T> {
  const entries = await chainFor(kind);
  if (!entries.length) throw new Error(AI_UNAVAILABLE_MESSAGE);

  let lastError: unknown = null;
  for (const entry of entries) {
    try {
      const result = await job(entry.model, entry);
      await record(entry, true);
      return result;
    } catch (error) {
      lastError = error;
      const { cooldownSeconds, message } = classify(error);
      await record(entry, false, message, cooldownSeconds);
      console.warn(`[ai] ${entry.label} ${entry.modelId} failed (${cooldownSeconds ? `cooling ${cooldownSeconds}s` : "moving on"}):`, message.slice(0, 160));
    }
  }
  throw lastError ?? new Error("Every model in the chain failed.");
}

/** Recorded against generated articles so provenance survives a provider change. */
export function draftingModelId(): string {
  const tier = TIERS.drafting.find((t) => keysFor(t.provider).length > 0);
  return tier?.modelId ?? "unknown";
}

/** Kept for the provenance column on rows written before the pool. */
export const DRAFTING_MODEL = "anthropic/claude-sonnet-5";

/** Which pools are loaded, for the integration status panel. */
export function aiProviderName(): string | null {
  const parts = (["google", "groq", "openrouter", "anthropic", "gateway"] as Provider[])
    .map((provider) => ({ provider, count: keysFor(provider).length }))
    .filter((p) => p.count > 0)
    .map((p) => `${PROVIDER_LABELS[p.provider]} ×${p.count}`);
  return parts.length ? parts.join(", ") : null;
}

export function aiIsConfigured(): boolean {
  return (["google", "groq", "openrouter", "anthropic", "gateway"] as Provider[]).some(
    (provider) => keysFor(provider).length > 0,
  );
}

export const AI_UNAVAILABLE_MESSAGE =
  "AI assist is not configured. Set GOOGLE_GENERATIVE_AI_API_KEYS (free, no card, aistudio.google.com/apikey), GROQ_API_KEYS (console.groq.com/keys) or OPENROUTER_API_KEYS.";

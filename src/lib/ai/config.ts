import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

/**
 * AI provider selection.
 *
 * Four routes to a model, picked by whichever credential is present. The
 * newsroom should not be blocked because one vendor wants a card on file, so
 * the code treats the provider as a configuration detail rather than a
 * dependency.
 *
 * Precedence, highest first:
 *   1. GOOGLE_GENERATIVE_AI_API_KEY — Gemini. Free tier, no card, generous
 *      limits, and reliable structured output. The default recommendation.
 *   2. GROQ_API_KEY — Groq. Free tier, no card, extremely fast. Open models,
 *      weaker at long-form editorial prose than the other two.
 *   3. ANTHROPIC_API_KEY — Claude direct. Best drafting quality here; paid.
 *   4. AI_GATEWAY_API_KEY — Vercel AI Gateway. One credential for every
 *      provider, but it refuses to serve requests until a card is on file for
 *      the team, even to spend its own free credits.
 *
 * Model ids are overridable by environment variable so a deprecated one can be
 * swapped without a deploy from this file.
 */

type Provider = "google" | "groq" | "anthropic" | "gateway";

/**
 * Defaults per provider: a stronger model for writing, a cheap fast one for
 * triage, tags and summaries.
 */
const MODELS: Record<Provider, { drafting: string; assist: string; fallbacks: string[] }> = {
  google: {
    // Pinned rather than using the -latest aliases: an alias silently moving to
    // a new model changes how the paper writes, which is not something that
    // should happen without anyone choosing it.
    drafting: process.env.AI_DRAFTING_MODEL ?? "gemini-3.8-flash",
    assist: process.env.AI_ASSIST_MODEL ?? "gemini-3.5-flash-lite",
    // Free-tier capacity is shared and does go down: "This model is currently
    // experiencing high demand" is a real, observed response. An unattended
    // scheduler that treats that as a failure just stops working for a while,
    // so it steps down a generation instead.
    fallbacks: ["gemini-3.5-flash", "gemini-2.5-flash"],
  },
  groq: {
    drafting: process.env.AI_DRAFTING_MODEL ?? "llama-3.3-70b-versatile",
    assist: process.env.AI_ASSIST_MODEL ?? "llama-3.1-8b-instant",
    fallbacks: ["llama-3.1-8b-instant"],
  },
  anthropic: {
    drafting: process.env.AI_DRAFTING_MODEL ?? "claude-sonnet-5",
    assist: process.env.AI_ASSIST_MODEL ?? "claude-haiku-4.5",
    fallbacks: ["claude-haiku-4.5"],
  },
  gateway: {
    drafting: process.env.AI_DRAFTING_MODEL ?? "anthropic/claude-sonnet-5",
    assist: process.env.AI_ASSIST_MODEL ?? "anthropic/claude-haiku-4.5",
    fallbacks: ["anthropic/claude-haiku-4.5"],
  },
};

function activeProvider(): Provider | null {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) return "gateway";
  return null;
}

function build(provider: Provider, modelId: string): LanguageModel {
  switch (provider) {
    case "google":
      return createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      })(modelId);
    case "groq":
      return createGroq({ apiKey: process.env.GROQ_API_KEY })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(modelId);
    default:
      // The gateway is the AI SDK's default provider, addressed by string.
      return modelId;
  }
}

function resolve(kind: "drafting" | "assist"): LanguageModel {
  const provider = activeProvider();
  if (!provider) throw new Error(AI_UNAVAILABLE_MESSAGE);
  return build(provider, MODELS[provider][kind]);
}

export function draftingModel(): LanguageModel {
  return resolve("drafting");
}

export function assistModel(): LanguageModel {
  return resolve("assist");
}

/**
 * The models to try, in order, for one job.
 *
 * The caller walks this list on overload or rate limiting. Returning models
 * rather than retrying the same one matters: a model that is out of capacity
 * stays out of capacity for minutes, and retrying it is just waiting slowly.
 */
export function modelChain(kind: "drafting" | "assist"): LanguageModel[] {
  const provider = activeProvider();
  if (!provider) throw new Error(AI_UNAVAILABLE_MESSAGE);

  const config = MODELS[provider];
  const ids = [config[kind], ...config.fallbacks];
  // Deduplicate: assist and its first fallback are often the same model.
  return [...new Set(ids)].map((id) => build(provider, id));
}

/** Recorded against generated articles so provenance survives a provider change. */
export function draftingModelId(): string {
  const provider = activeProvider();
  return provider ? MODELS[provider].drafting : "unknown";
}

/** Kept for the provenance column on rows written before a provider switch. */
export const DRAFTING_MODEL = MODELS.gateway.drafting;

const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Google Gemini",
  groq: "Groq",
  anthropic: "Anthropic",
  gateway: "Vercel AI Gateway",
};

/** Which route is in use, for the integration status panel. */
export function aiProviderName(): string | null {
  const provider = activeProvider();
  return provider ? PROVIDER_LABELS[provider] : null;
}

export function aiIsConfigured(): boolean {
  return activeProvider() !== null;
}

export const AI_UNAVAILABLE_MESSAGE =
  "AI assist is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY (free, no card, aistudio.google.com/apikey) or GROQ_API_KEY (free, no card, console.groq.com/keys).";

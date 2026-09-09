import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/**
 * AI model configuration.
 *
 * Two routes to the same models, chosen by which credential is present:
 *
 *   1. A direct Anthropic key (ANTHROPIC_API_KEY), used in preference when set.
 *   2. The Vercel AI Gateway (AI_GATEWAY_API_KEY), addressed by plain
 *      "provider/model" strings.
 *
 * The gateway is the nicer default — one credential, provider switching by
 * string, usage visible in the Vercel dashboard. But it refuses to serve
 * requests until a card is on file, which is a hard stop that has nothing to do
 * with the code. Supporting both means a billing gate on one platform does not
 * block the newsroom.
 */

/** Long-form drafting. Quality matters more than latency here. */
const DRAFTING_MODEL_ID = "claude-sonnet-5";
/** Short structured jobs — tags, headlines, summaries, triage. Cheaper. */
const ASSIST_MODEL_ID = "claude-haiku-4.5";

/** Recorded against generated articles, so provenance survives a provider change. */
export const DRAFTING_MODEL = DRAFTING_MODEL_ID;

function usingDirectAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function resolve(modelId: string): LanguageModel {
  if (usingDirectAnthropic()) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(modelId);
  }
  // Gateway model strings are namespaced by provider.
  return `anthropic/${modelId}`;
}

export function draftingModel(): LanguageModel {
  return resolve(DRAFTING_MODEL_ID);
}

export function assistModel(): LanguageModel {
  return resolve(ASSIST_MODEL_ID);
}

/** Which route is actually in use, for the integration status panel. */
export function aiProviderName(): string | null {
  if (usingDirectAnthropic()) return "Anthropic (direct)";
  if (process.env.AI_GATEWAY_API_KEY) return "Vercel AI Gateway";
  if (process.env.VERCEL_OIDC_TOKEN) return "Vercel AI Gateway (OIDC)";
  return null;
}

export function aiIsConfigured(): boolean {
  return aiProviderName() !== null;
}

export const AI_UNAVAILABLE_MESSAGE =
  "AI assist is not configured. Set ANTHROPIC_API_KEY, or set AI_GATEWAY_API_KEY and add a card to the Vercel AI Gateway.";

import "server-only";

/**
 * AI model configuration.
 *
 * Models are addressed as plain "provider/model" strings through the Vercel AI
 * Gateway, so switching provider is a string change rather than a dependency
 * change. On Vercel the gateway authenticates with the deployment's OIDC token
 * automatically; locally it needs AI_GATEWAY_API_KEY.
 */

/** Long-form drafting. Quality matters more than latency here. */
export const DRAFTING_MODEL = "anthropic/claude-sonnet-5";

/** Short structured jobs — tags, headlines, summaries. Cheaper and faster. */
export const ASSIST_MODEL = "anthropic/claude-haiku-4.5";

/**
 * Whether AI features can run at all.
 *
 * VERCEL_OIDC_TOKEN is present in Vercel deployments and is what lets the
 * gateway work without a separate key. Locally, only the explicit key does.
 */
export function aiIsConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export const AI_UNAVAILABLE_MESSAGE =
  "AI assist is not configured. Set AI_GATEWAY_API_KEY (Vercel dashboard → AI Gateway → API keys) to enable it.";

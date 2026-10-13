import "server-only";

/**
 * Captions for candidate pictures from Cloudflare Workers AI's LLaVA, for
 * the judge's last resort: when no model that can see several pictures at
 * once is reachable, each picture is described in a sentence here and the
 * text models, which have capacity, judge the descriptions. Free: 10,000
 * neurons a day, a caption costing a few. Needs CLOUDFLARE_ACCOUNT_ID and a
 * CLOUDFLARE_API_TOKEN with Workers AI.
 */

const MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const CAPTION_MS = 25_000;

export function captionsConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

/** One sentence on what the picture shows, or null when the service cannot say in time. */
export async function captionImage(data: Buffer): Promise<string | null> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAPTION_MS);
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image: Array.from(data),
        prompt:
          "Describe this photograph in two sentences for a newspaper picture editor: what it shows, where it appears to be (country or city if there are clues such as signs, scripts, vehicles, uniforms, architecture), and whether it is a logo, a graphic, a screenshot or looks computer-generated.",
        max_tokens: 120,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { result?: { description?: string }; success?: boolean };
    const text = json.result?.description?.trim();
    return text && json.success !== false ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

import "server-only";

import type { IncomingMention } from "../cluster";

/**
 * YouTube's most-popular news videos, per home region.
 *
 * Video is where a large share of the audience now meets a story first, and
 * the "most popular" chart in the News & Politics category is a clean read of
 * what that audience is watching right now. View counts are the magnitude.
 *
 * Needs a Google Cloud API key with the YouTube Data API enabled — a
 * different credential from the Gemini key, which is issued by AI Studio and
 * does not carry YouTube scopes. Absent the key, the stream is simply not
 * polled.
 */

const NEWS_CATEGORY = "25";
const REGIONS = ["IN", "US", "GB"];

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export async function fetchYouTubeNews(): Promise<IncomingMention[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const mentions: IncomingMention[] = [];

  for (const region of REGIONS) {
    const url =
      "https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular" +
      `&videoCategoryId=${NEWS_CATEGORY}&regionCode=${region}&maxResults=25&key=${key}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        items?: {
          id: string;
          snippet: { title: string; channelTitle: string; publishedAt: string; description?: string };
          statistics?: { viewCount?: string };
        }[];
      };

      for (const item of data.items ?? []) {
        mentions.push({
          sourceKind: "youtube",
          sourceKey: `youtube:${item.snippet.channelTitle.toLowerCase().replace(/\s+/g, "-")}`,
          externalId: `yt:${item.id}`,
          title: item.snippet.title,
          body: item.snippet.description?.slice(0, 500) ?? null,
          url: `https://www.youtube.com/watch?v=${item.id}`,
          region,
          magnitude: Number(item.statistics?.viewCount ?? 0),
          observedAt: item.snippet.publishedAt,
          raw: { channel: item.snippet.channelTitle, region },
        });
      }
    } catch {
      // One region failing costs that region's videos, nothing more.
    } finally {
      clearTimeout(timeout);
    }
  }

  return mentions;
}

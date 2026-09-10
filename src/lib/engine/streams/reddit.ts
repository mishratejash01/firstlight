import "server-only";

import type { IncomingMention } from "../cluster";

/**
 * Reddit's news communities.
 *
 * r/news and r/worldnews are moderated to link only to actual reporting, and
 * r/india is the largest English-language forum for our home market. What
 * rises there rises because thousands of people decided it mattered, which
 * is a different kind of signal from an outlet's editorial choice. Upvotes
 * are the magnitude.
 *
 * Uses the official API with an app credential (client id and secret from
 * reddit.com/prefs/apps, "script" type), because the unauthenticated JSON
 * endpoints are throttled hard from cloud addresses. Absent the credential,
 * the stream is not polled.
 */

const SUBREDDITS = ["news", "worldnews", "india"];
const UA = "web:thefederalpost:1.0 (by /u/thefederalpost)";
const MIN_SCORE = 200;

export function redditConfigured(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

async function accessToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  try {
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function fetchRedditNews(): Promise<IncomingMention[]> {
  const token = await accessToken();
  if (!token) return [];

  const mentions: IncomingMention[] = [];

  for (const subreddit of SUBREDDITS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`https://oauth.reddit.com/r/${subreddit}/hot?limit=40`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
        cache: "no-store",
      });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        data?: {
          children: {
            data: {
              id: string;
              title: string;
              url: string;
              domain: string;
              score: number;
              created_utc: number;
              stickied: boolean;
              is_self: boolean;
            };
          }[];
        };
      };

      for (const { data: post } of data.data?.children ?? []) {
        if (post.stickied || post.is_self || post.score < MIN_SCORE) continue;
        mentions.push({
          sourceKind: "reddit",
          sourceKey: `reddit:r/${subreddit}`,
          externalId: `reddit:${post.id}`,
          title: post.title,
          url: post.url,
          region: subreddit === "india" ? "IN" : null,
          magnitude: post.score,
          observedAt: new Date(post.created_utc * 1000).toISOString(),
          raw: { subreddit, domain: post.domain, score: post.score },
        });
      }
    } catch {
      // One subreddit failing costs that subreddit's posts, nothing more.
    } finally {
      clearTimeout(timeout);
    }
  }

  return mentions;
}

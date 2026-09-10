import "server-only";

import type { IncomingMention } from "../cluster";

/**
 * Streams that report the world directly rather than what people are saying
 * about it.
 *
 * An earthquake feed is not an opinion. When USGS reports a magnitude 6.5 near
 * a city, that is an event, and it is news before any outlet has typed a word.
 * These streams exist to catch that class of story at the moment it happens,
 * and to anchor a cluster that the social and search signals then fill in.
 *
 * Prediction markets are included on a different logic: a market is a
 * continuous poll of people betting real money on an outcome. A sharp move in
 * the price is information, whatever the eventual result.
 */

const UA = "TheFederalPostBot/1.0 (+https://newswebsite-pi.vercel.app)";

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Significant earthquakes in the last day.
 *
 * The threshold is magnitude, not "significance": USGS's own significance
 * score already folds in population exposure and felt reports, which is a
 * better proxy for "does this matter to people" than magnitude alone. Both are
 * exposed to the scorer.
 */
export async function fetchEarthquakes(): Promise<IncomingMention[]> {
  const data = await getJson<{
    features?: {
      id: string;
      properties: {
        mag: number;
        place: string;
        time: number;
        title: string;
        sig: number;
        tsunami: number;
        url: string;
      };
    }[];
  }>("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson");

  return (data?.features ?? [])
    // Significance ≥ 600 is roughly "widely felt or damaging". Below that a
    // quake is a data point, not a story.
    .filter((quake) => (quake.properties.sig ?? 0) >= 600 || quake.properties.mag >= 6)
    .map((quake) => ({
      sourceKind: "usgs",
      sourceKey: "earthquake.usgs.gov",
      externalId: `usgs:${quake.id}`,
      title: `Magnitude ${quake.properties.mag.toFixed(1)} earthquake ${quake.properties.place}`,
      body:
        quake.properties.tsunami === 1
          ? "USGS has issued a tsunami flag for this event."
          : null,
      url: quake.properties.url,
      entityNames: [quake.properties.place.replace(/^\d+\s*km\s+\w+\s+of\s+/i, "")],
      magnitude: quake.properties.sig,
      observedAt: new Date(quake.properties.time).toISOString(),
      raw: {
        mag: quake.properties.mag,
        sig: quake.properties.sig,
        tsunami: quake.properties.tsunami,
      },
    }));
}

/**
 * Prediction markets with a large recent move.
 *
 * Volume alone would rank sports and crypto first, which is not what a news
 * desk wants from this stream. The filter is on question text — politics,
 * conflict, economy — and the signal is the size of the last-24h move, not
 * the price itself.
 */
const NEWSWORTHY_MARKET = /\b(election|president|minister|parliament|war|ceasefire|invasion|sanction|tariff|fed|rate|inflation|recession|strike|impeach|resign|indict|court|verdict|nuclear|missile|hostage|treaty|referendum|prime|chancellor|senate|congress|supreme)\b/i;

export async function fetchPredictionMarkets(): Promise<IncomingMention[]> {
  const data = await getJson<
    {
      id: string;
      question: string;
      slug: string;
      volume24hr?: number | string;
      outcomePrices?: string;
      oneDayPriceChange?: number;
      lastTradePrice?: number;
    }[]
  >("https://gamma-api.polymarket.com/markets?limit=60&active=true&closed=false&order=volume24hr&ascending=false");

  const dayKey = new Date().toISOString().slice(0, 10);

  return (data ?? [])
    .filter((market) => NEWSWORTHY_MARKET.test(market.question))
    .map((market) => {
      const move = Math.abs(Number(market.oneDayPriceChange ?? 0));
      const volume = Number(market.volume24hr ?? 0);
      return { market, move, volume };
    })
    // A ten-point move on a liquid market is a story; a two-point move is noise.
    .filter(({ move, volume }) => move >= 0.1 && volume >= 50_000)
    .slice(0, 15)
    .map(({ market, move, volume }) => ({
      sourceKind: "polymarket",
      sourceKey: "polymarket.com",
      externalId: `polymarket:${dayKey}:${market.id}`,
      title: market.question,
      body: `Market moved ${(move * 100).toFixed(0)} points in the last day on $${Math.round(volume).toLocaleString()} of volume.`,
      url: `https://polymarket.com/event/${market.slug}`,
      region: "US",
      magnitude: move * 100,
      raw: { move, volume, lastTradePrice: market.lastTradePrice },
    }));
}

import type { MetadataRoute } from "next";

import { createClient } from "@/lib/supabase/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Standard sitemap: every stable, indexable URL on the site.
 *
 * Breaking coverage is handled separately by /news-sitemap.xml, which carries
 * the Google News namespace and a 48-hour window. Search result pages and
 * newsroom dashboards are excluded — the first are infinite and thin, the
 * second are private.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [articles, categories, authors, tags, events] = await Promise.all([
    supabase
      .from("articles")
      .select("slug, updated_at, published_at, categories!inner ( slug )")
      .in("status", ["published", "scheduled"])
      .lte("published_at", now)
      .order("published_at", { ascending: false })
      .limit(5000),
    supabase.from("categories").select("slug, updated_at").eq("is_active", true),
    supabase.from("authors").select("slug, updated_at").eq("is_active", true),
    supabase.from("tags").select("slug, updated_at").eq("is_active", true),
    supabase
      .from("news_events")
      .select("slug, updated_at")
      .in("status", ["developing", "concluded"])
      .lte("published_at", now),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/masthead`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/editorial-standards`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/corrections`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  return [
    ...staticPages,
    ...(categories.data ?? []).map((c) => ({
      url: `${SITE_URL}/${c.slug}`,
      lastModified: c.updated_at,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...(events.data ?? []).map((e) => ({
      url: `${SITE_URL}/live/${e.slug}`,
      lastModified: e.updated_at,
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
    ...(articles.data ?? []).map((a) => ({
      url: `${SITE_URL}/${(a.categories as unknown as { slug: string }).slug}/${a.slug}`,
      lastModified: a.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...(authors.data ?? []).map((a) => ({
      url: `${SITE_URL}/author/${a.slug}`,
      lastModified: a.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...(tags.data ?? []).map((t) => ({
      url: `${SITE_URL}/topic/${t.slug}`,
      lastModified: t.updated_at,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}

import "server-only";
import { v2 as cloudinary } from "cloudinary";

/**
 * karostartup.com, a partner site the engine writes for.
 *
 * The partner's backend is its own Supabase project. The engine never computes
 * there: it reads a handful of rows (categories, the house byline, recent
 * headlines, whether a slug is taken) and inserts finished stories. Its
 * Cloudinary holds only the covers of the stories posted there, nothing else.
 *
 * Everything here is reached through the partner's REST API with their
 * service key, which bypasses their row security the way their own importers
 * do (scripts/fetch-newsreach.mjs in their repository).
 */

export const PARTNER = "karostartup";
export const PARTNER_NAME = "Karostartup";
export const PARTNER_SITE = "https://www.karostartup.com";
/** The byline their imported and desk stories carry: the paper itself. */
const HOUSE_USERNAME = "karostartup-news-engine";
/** Where their covers live in their Cloudinary. */
const COVER_FOLDER = "karostartup/engine";

type Backend = { url: string; key: string };
type Cloud = { cloud_name: string; api_key: string; api_secret: string };

function backend(): Backend | null {
  const url = process.env.KAROSTARTUP_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.KAROSTARTUP_SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

function cloud(): Cloud | null {
  const cloud_name = process.env.KAROSTARTUP_CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.KAROSTARTUP_CLOUDINARY_API_KEY;
  const api_secret = process.env.KAROSTARTUP_CLOUDINARY_API_SECRET;
  return cloud_name && api_key && api_secret ? { cloud_name, api_key, api_secret } : null;
}

export function karostartupConfigured(): boolean {
  return backend() !== null;
}

async function rest<T>(
  path: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<T> {
  const target = backend();
  if (!target) throw new Error("karostartup: backend not configured");
  const headers: Record<string, string> = {
    apikey: target.key,
    Authorization: `Bearer ${target.key}`,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.prefer) headers.Prefer = init.prefer;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${target.url}/rest/v1/${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`karostartup: ${init.method ?? "GET"} ${path.split("?")[0]} → ${response.status} ${text.slice(0, 200)}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export type PartnerCategory = { id: string; slug: string; name: string };

let categoriesCache: { at: number; rows: PartnerCategory[] } | null = null;

/** Their sections, as they are today; cached for an hour so a pass costs one read at most. */
export async function fetchCategories(): Promise<PartnerCategory[]> {
  if (categoriesCache && Date.now() - categoriesCache.at < 3600_000) return categoriesCache.rows;
  const rows = await rest<PartnerCategory[]>("categories?select=id,slug,name&order=order_index.asc");
  categoriesCache = { at: Date.now(), rows };
  return rows;
}

let authorCache: string | null = null;

/** The paper's own profile, which their imports are credited to. */
export async function houseAuthorId(): Promise<string | null> {
  if (authorCache) return authorCache;
  const rows = await rest<{ id: string }[]>(
    `profiles?select=id&username=eq.${encodeURIComponent(HOUSE_USERNAME)}&limit=1`,
  );
  authorCache = rows[0]?.id ?? process.env.KAROSTARTUP_AUTHOR_ID ?? null;
  return authorCache;
}

export type PartnerArticleSummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
};

/** One of their articles by slug, the fields the desk needs to revisit it. */
export async function fetchArticle(slug: string): Promise<PartnerArticleSummary | null> {
  const rows = await rest<PartnerArticleSummary[]>(
    `articles?select=id,slug,title,subtitle,summary,tags,cover_image_url&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  return rows[0] ?? null;
}

/** Changes fields on one of their articles: a cover found after posting, for instance. */
export async function updateArticle(id: string, patch: Partial<Pick<PartnerArticleRow, "cover_image_url" | "cover_caption" | "content">>): Promise<void> {
  await rest(`articles?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
}

export async function slugTaken(slug: string): Promise<boolean> {
  const rows = await rest<{ id: string }[]>(`articles?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  return rows.length > 0;
}

export type RecentTitle = { slug: string; title: string; published_at: string | null; source: string | null };

/** What they published lately, so the engine neither repeats them nor itself. */
export async function recentTitles(hours = 48, limit = 80): Promise<RecentTitle[]> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return rest<RecentTitle[]>(
    `articles?select=slug,title,published_at,source&status=eq.published&published_at=gte.${encodeURIComponent(since)}&order=published_at.desc&limit=${limit}`,
  );
}

/**
 * Copies a chosen cover into their Cloudinary, named after the story. Returns
 * null when their Cloudinary is not configured, in which case the story goes
 * out without a cover rather than hot-linking ours.
 */
/**
 * Copies a chosen picture into the partner's Cloudinary as the story's cover. The source is
 * what the picture desk fetched (a data URI, or a URL); a photograph is cropped to the shape
 * their cards expect, a logo is set in the middle of that shape on a plain ground.
 */
export async function uploadCover(source: string, slug: string, options: { pad?: boolean } = {}): Promise<string | null> {
  const target = cloud();
  if (!target) return null;
  const result = await cloudinary.uploader.upload(source, {
    ...target,
    folder: COVER_FOLDER,
    public_id: slug.slice(0, 120),
    // A later, better choice for the same story replaces the earlier one under the same name.
    overwrite: true,
    resource_type: "image",
    invalidate: true,
    quality: "auto",
    fetch_format: "auto",
    transformation: options.pad
      ? [
          { width: 760, height: 430, crop: "fit" },
          { width: 1600, height: 900, crop: "pad", background: "#F4F4F5" },
        ]
      : [{ width: 1600, height: 900, crop: "fill", gravity: "auto" }],
  });
  // Their pages hot-link with automatic format and quality, as their own importer does.
  return String(result.secure_url).replace("/image/upload/", "/image/upload/f_auto,q_auto/");
}

export type PartnerArticleRow = {
  slug: string;
  title: string;
  kicker: string;
  subtitle: string;
  summary: string;
  content: string;
  cover_image_url: string | null;
  cover_caption: string | null;
  category_id: string;
  author_id: string;
  tags: string[];
  is_breaking: boolean;
  published_at: string;
};

/** Inserts one story, live at once; returns their id and the slug as stored. */
export async function postArticle(row: PartnerArticleRow): Promise<{ id: string; slug: string }> {
  const rows = await rest<{ id: string; slug: string }[]>("articles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      ...row,
      status: "published",
      source: "engine",
      approved_for_public: true,
      is_featured: false,
      is_premium: false,
      is_exclusive: false,
      is_editors_choice: false,
      ai_summarized: false,
    },
  });
  const inserted = rows[0];
  if (!inserted?.id) throw new Error("karostartup: insert returned no row");
  return inserted;
}

export function articleUrl(slug: string): string {
  return `${PARTNER_SITE}/article/${slug}`;
}

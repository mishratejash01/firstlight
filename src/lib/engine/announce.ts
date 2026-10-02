import "server-only";

import { revalidatePath } from "next/cache";

import { submitToIndexNow } from "@/lib/seo/indexnow";
import { SITE_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stories that have just gone live: rebuild their pages and tell search
 * engines about them.
 *
 * A story written with the publish delay sits in the database as scheduled
 * and becomes visible when its time comes, with no event of its own. Anyone
 * who asked for its address before then (a crawler, a link shared early) was
 * served "not found", and story pages are cached for an hour, so that answer
 * could outlive the story's own going-live by most of an hour. This runs with
 * every desk pass, every two minutes: it rebuilds the page of each story that
 * went live in the last ten minutes, which clears any such answer within two
 * minutes, and announces the story to search engines once it can be read.
 *
 * Rebuilding is cheap and harmless to repeat, so the window is wide enough to
 * survive a skipped pass. Search engines are told only about stories that went
 * live in the last three minutes: one desk pass's worth with some slack, so
 * each story is announced once, or at most twice.
 */
const REBUILD_WINDOW_MS = 10 * 60_000;
const ANNOUNCE_WINDOW_MS = 3 * 60_000;

export async function announceNewlyLive(): Promise<{ rebuilt: number; announced: number }> {
  const supabase = createAdminClient();
  const now = Date.now();

  const { data } = await supabase
    .from("articles")
    .select("slug, published_at, categories!inner ( slug )")
    .in("status", ["published", "scheduled"])
    .gt("published_at", new Date(now - REBUILD_WINDOW_MS).toISOString())
    .lte("published_at", new Date(now).toISOString());

  const stories = (data ?? []).map((row) => ({
    slug: row.slug,
    section: (row.categories as unknown as { slug: string }).slug,
    publishedAt: Date.parse(row.published_at as string),
  }));
  if (!stories.length) return { rebuilt: 0, announced: 0 };

  for (const story of stories) revalidatePath(`/${story.section}/${story.slug}`);
  for (const section of new Set(stories.map((story) => story.section))) revalidatePath(`/${section}`);
  revalidatePath("/");

  const fresh = stories
    .filter((story) => story.publishedAt > now - ANNOUNCE_WINDOW_MS)
    .map((story) => `${SITE_URL}/${story.section}/${story.slug}`);
  if (fresh.length && SITE_URL) await submitToIndexNow(fresh);

  return { rebuilt: stories.length, announced: fresh.length };
}

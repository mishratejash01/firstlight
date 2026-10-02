import { revalidatePath } from "next/cache";

/**
 * Rebuild cached pages now: POST { "paths": ["/section/slug", "/"] } with the
 * CRON_SECRET bearer.
 *
 * Story pages are cached for an hour and refresh at once when the desk edits
 * them (revalidateStory). This is the same refresh for a change made outside
 * the desk, such as a correction applied straight to the database, so it
 * reaches readers on the next request rather than within the hour.
 */
export const dynamic = "force-dynamic";

const MAX_PATHS = 20;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = Array.isArray(body?.paths)
    ? body.paths.filter((path): path is string => typeof path === "string" && /^\/[^\s]*$/.test(path)).slice(0, MAX_PATHS)
    : [];
  if (!paths.length) return Response.json({ error: "No paths given" }, { status: 400 });

  for (const path of paths) revalidatePath(path);
  return Response.json({ ok: true, revalidated: paths });
}

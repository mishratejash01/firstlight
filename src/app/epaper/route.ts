import { latestEditionDate } from "@/lib/epaper/edition";

/**
 * /epaper: the newest edition, wherever the reader came from.
 *
 * Which edition is newest changes at 05:00 IST every day, so this answers
 * afresh each time and is never cached, at the edge or anywhere else. The
 * editions themselves have fixed contents and are cached like story pages.
 * The redirect is relative: behind Caddy the request's own URL names the
 * internal address, not the site's.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, {
    status: 307,
    headers: {
      Location: `/epaper/${latestEditionDate()}`,
      "Cache-Control": "no-store",
    },
  });
}

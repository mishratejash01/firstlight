import { fitSelectionWeights } from "@/lib/engine/fit";
import { fitEarlinessModel, scoreEarliness } from "@/lib/engine/earliness";

/**
 * The daily fit.
 *
 * Refits the selection weights on the last thirty days of labels and promotes
 * them only if they beat the live weights on the held-out day; then refits
 * the earliness model on the free labels the mention table provides, and
 * rescores live events with it. Called once a night by pg_cron, gated by
 * CRON_SECRET, and by the Learning page's "Run the fit now" button through a
 * server action.
 *
 * ?model=selection or ?model=earliness runs one of the two.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const model = new URL(request.url).searchParams.get("model");
  const startedAt = Date.now();

  const selection = model === "earliness" ? null : await fitSelectionWeights();
  const earliness = model === "selection" ? null : await fitEarlinessModel();
  const rescored = model === "selection" ? null : await scoreEarliness();

  return Response.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    selection,
    earliness,
    rescored,
  });
}

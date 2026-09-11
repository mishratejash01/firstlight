import { generateText } from "ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { runWithChain } from "@/lib/ai/config";
import { commonsLogo, findWikidataItem } from "@/lib/engine/wikidata";
import { triageCandidates } from "@/lib/engine/triage";
import { redraftEvent, reillustrateCards, writeEvents } from "@/lib/engine/write";

/**
 * The engine's desk: triage what the scoring surfaced, then write the best of
 * what passed.
 *
 * Separate from the pulse because writing is slow — reading sources, the
 * verification pass, drafting, illustrating — and the pulse has to finish
 * inside a minute. Called every few minutes by pg_cron, gated by CRON_SECRET.
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

  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 2), 1), 4);

  // What the identity lookup makes of a name, for checking a bad picture.
  const identity = params.get("identity");
  if (identity) {
    const item = await findWikidataItem(identity, params.get("type") ?? "Organization");
    const logo = item ? await commonsLogo(item.qid) : null;
    return Response.json({ ok: true, identity, type: params.get("type") ?? "Organization", item, logo: logo?.title ?? null });
  }

  // One trivial call through the chain, reporting which key answered.
  if (params.get("probe")) {
    const startedAt = Date.now();
    try {
      const answer = await runWithChain(params.get("probe") === "drafting" ? "drafting" : "assist", async (model, entry) => {
        const { text } = await generateText({ model, maxRetries: 0, prompt: "Reply with the single word OK." });
        return { text: text.trim().slice(0, 20), key: entry.label, model: entry.modelId };
      });
      return Response.json({ ok: true, probe: { ...answer, ms: Date.now() - startedAt } });
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "probe failed" }, { status: 502 });
    }
  }

  // Give card-illustrated stories another go at a photograph, and return.
  const reillustrate = params.get("reillustrate");
  if (reillustrate) {
    const scope = params.get("scope") === "all" ? "all" : "cards";
    const slug = params.get("slug") ?? undefined;
    const outcome = await reillustrateCards(Math.min(Math.max(Number(reillustrate), 1), 30), scope, slug);
    return Response.json({ ok: true, reillustrate: outcome });
  }

  // Rewrite one written story under the current house rules and return.
  const redraft = params.get("redraft");
  if (redraft) {
    const outcome = await redraftEvent(redraft);
    return Response.json({ ok: outcome.ok, redraft: outcome }, { status: outcome.ok ? 200 : 422 });
  }

  const supabase = createAdminClient();
  const { data: leased } = await supabase.rpc("engine_try_lock", {
    p_name: "desk",
    p_ttl_seconds: 320,
  });
  if (!leased) return Response.json({ ok: true, skipped: true });

  try {
    // Two minutes for triage, the rest for writing one story.
    const triage = await triageCandidates(6, Date.now() + 120_000);
    const write = await writeEvents(limit);
    // Cards from earlier runs get another look while the sources are fresh.
    const reillustrated = await reillustrateCards(2);
    return Response.json({ ok: true, triage, write, reillustrated });
  } catch (error) {
    console.error("[engine-write] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Engine write failed" },
      { status: 500 },
    );
  } finally {
    await supabase.rpc("engine_release_lock", { p_name: "desk" });
  }
}

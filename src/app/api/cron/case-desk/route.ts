import { CASE_SECTION_SLUG, loadSubjects, runCaseDesk, topUpQuestionBank, writeCaseStudy } from "@/lib/engine/case-desk";
import { metered } from "@/lib/engine/metered";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The case desk's pass (see lib/engine/case-desk), called by the scheduler
 * every two hours. Also, for an administrator with the secret:
 *   ?question=…&subject=health   write this question now, past the gate
 *   ?propose=1                   top the question bank up
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const supabase = createAdminClient();
  const { data: leased } = await supabase.rpc("engine_try_lock", { p_name: "case-desk", p_ttl_seconds: 300 });
  if (!leased) return Response.json({ ok: true, skipped: "another pass holds the case desk" });

  try {
    if (params.get("propose")) {
      const subjects = await loadSubjects(supabase);
      const added = await topUpQuestionBank(supabase, subjects, true);
      return Response.json({ ok: true, proposed: added });
    }

    const question = params.get("question")?.trim();
    if (question) {
      const subjects = await loadSubjects(supabase);
      const subject = subjects.find((s) => s.slug === params.get("subject")) ?? subjects.find((s) => s.slug === "society");
      if (!subject) return Response.json({ ok: false, error: "No such subject" }, { status: 400 });
      const outcome = await writeCaseStudy(supabase, {
        question,
        subject,
        angle: params.get("angle") ?? "",
        searchQueries: [question],
        trigger: null,
        kind: "admin",
      });
      await supabase.from("case_candidates").insert({
        kind: "admin",
        title: question,
        question,
        subject_slug: subject.slug,
        verdict: outcome.ok ? "written" : "failed",
        reasons: { from: "request" },
        article_id: outcome.ok ? outcome.id : null,
        error: outcome.ok ? null : outcome.reason,
      });
      return Response.json(
        outcome.ok ? { ok: true, wrote: { slug: outcome.slug, status: outcome.status, href: `/${CASE_SECTION_SLUG}/${outcome.slug}` } } : { ok: false, error: outcome.reason },
        { status: outcome.ok ? 200 : 422 },
      );
    }

    const report = await runCaseDesk({ deadline: Date.now() + 280_000 });
    return Response.json({ ok: true, ...report });
  } catch (error) {
    console.error("[case-desk] failed", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "failed" }, { status: 500 });
  } finally {
    await supabase.rpc("engine_release_lock", { p_name: "case-desk" });
  }
}

export const GET = metered(handle);
export const POST = metered(handle);

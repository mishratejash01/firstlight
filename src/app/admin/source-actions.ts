"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/roles";
import { slugify } from "@/lib/format/slug";
import { ingestAllWireSources } from "@/lib/wire/ingest";

/**
 * Wire source administration.
 *
 * A source and its licence are written together. Splitting them across two
 * screens would make it possible to configure a feed with no recorded terms,
 * and "we ingest from them but nobody wrote down what we may publish" is the
 * exact state this table exists to prevent.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("admin")) return null;
  return user;
}

export async function createWireSource(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const name = String(formData.get("name") ?? "").trim();
  const feedUrl = String(formData.get("feed_url") ?? "").trim();
  const homepageUrl = String(formData.get("homepage_url") ?? "").trim();
  const licenceHolder = String(formData.get("licence_holder") ?? "").trim();
  const licenceTerms = String(formData.get("licence_terms") ?? "").trim();
  const allowFullText = String(formData.get("allow_full_text") ?? "") === "true";

  if (!name) return { error: "Give the source a name." };
  if (!feedUrl) return { error: "A wire source needs a feed URL." };

  // Validate the URL here rather than discovering it is malformed at 3am when
  // the worker runs.
  try {
    const parsed = new URL(feedUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { error: "The feed URL must be http or https." };
    }
  } catch {
    return { error: "That is not a valid feed URL." };
  }

  const supabase = await createClient();
  const slug = slugify(name);
  if (!slug) return { error: "That name cannot be turned into a URL slug." };

  const { data: source, error } = await supabase
    .from("sources")
    .insert({
      slug,
      name,
      origin: "wire",
      homepage_url: homepageUrl || null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A source with that name already exists."
          : error.message,
    };
  }

  const { error: licenceError } = await supabase.from("source_licences").insert({
    source_id: source.id,
    feed_url: feedUrl,
    feed_format: "rss",
    licence_holder: licenceHolder || null,
    licence_terms: licenceTerms || null,
    allow_full_text: allowFullText,
  });

  if (licenceError) {
    // Roll the source back by hand. Leaving a source with no licence row would
    // be exactly the half-configured state this function is written to avoid.
    await supabase.from("sources").delete().eq("id", source.id);
    return { error: licenceError.message };
  }

  revalidatePath("/admin/sources");
  return { ok: true };
}

export async function setFullTextPermission(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const sourceId = String(formData.get("source_id") ?? "");
  const allow = String(formData.get("allow_full_text") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("source_licences")
    .update({ allow_full_text: allow })
    .eq("source_id", sourceId);

  if (error) return { error: error.message };

  revalidatePath("/admin/sources");
  return { ok: true };
}

export async function setSourceActive(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const sourceId = String(formData.get("source_id") ?? "");
  const active = String(formData.get("is_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("sources")
    .update({ is_active: active })
    .eq("id", sourceId);

  if (error) return { error: error.message };

  revalidatePath("/admin/sources");
  return { ok: true };
}

/**
 * Runs ingestion immediately.
 *
 * Waiting half an hour for the cron to prove a newly added feed works is a poor
 * way to find out the URL was wrong.
 */
export async function runIngestionNow(): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  try {
    const reports = await ingestAllWireSources();

    if (!reports.length) {
      return { ok: true, note: "No active wire sources with a feed configured." };
    }

    const inserted = reports.reduce((sum, r) => sum + r.inserted, 0);
    const updated = reports.reduce((sum, r) => sum + r.updated, 0);
    const failures = reports.filter((r) => r.error);

    revalidatePath("/admin/sources");
    revalidatePath("/desk/wire");

    const note = [
      `${inserted} new, ${updated} updated.`,
      failures.length
        ? `Failed: ${failures.map((f) => `${f.sourceSlug} (${f.error})`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    return { ok: true, note };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Ingestion failed.",
    };
  }
}

import { createClient } from "@/lib/supabase/server";

export type NavCategory = {
  slug: string;
  name: string;
  /** How the section's block presents itself; see the category_layout migration. */
  layout: "standard" | "opinion";
  /** Small mark shown beside the section name; null where none is set. */
  icon_url: string | null;
};

/**
 * The site's navigation, read from the database.
 *
 * There is no hardcoded array of sections anywhere in this codebase. Adding a
 * row to `categories` with show_in_nav = true puts a section in the header;
 * reordering by sort_order reorders the header. Neither requires a deploy.
 *
 * `layout` and `icon_url` arrive in later migrations than the code that reads
 * them, and a deploy and a migration are never simultaneous. Asking for a
 * column the database does not have yet fails the whole select — which would
 * empty the navigation and, with it, every section block on the front page. So
 * the presentation columns are requested separately from the two that have
 * always existed: if that half fails, the sections still render, just without
 * their marks and with the standard block. The site degrades instead of
 * emptying, in whichever order the two land.
 */
/**
 * Every section in circulation, in running order.
 *
 * The header shows the first handful of these and puts the remainder behind a
 * drawer, so this returns the lot and lets the caller decide where the line
 * falls. Sections kept out of the header entirely (show_in_nav = false) are
 * included: out of the bar is not the same as out of the paper, and the drawer
 * is exactly where a reader goes looking for them.
 */
export async function getAllSections(): Promise<NavCategory[]> {
  const supabase = await createClient();

  const withPresentation = await supabase
    .from("categories")
    .select("slug, name, layout, icon_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!withPresentation.error) {
    return (withPresentation.data ?? []).map((row) => ({
      slug: row.slug,
      name: row.name,
      layout:
        row.layout === "opinion" ? ("opinion" as const) : ("standard" as const),
      icon_url: row.icon_url,
    }));
  }

  const base = await supabase
    .from("categories")
    .select("slug, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (base.error) return [];
  return (base.data ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    layout: "standard" as const,
    icon_url: null,
  }));
}

export async function getNavCategories(): Promise<NavCategory[]> {
  const supabase = await createClient();

  const withPresentation = await supabase
    .from("categories")
    .select("slug, name, layout, icon_url")
    .eq("is_active", true)
    .eq("show_in_nav", true)
    .order("sort_order", { ascending: true });

  if (!withPresentation.error) {
    return (withPresentation.data ?? []).map((row) => ({
      slug: row.slug,
      name: row.name,
      // The database constrains `layout` to two values, but the generated types
      // widen it to string. Narrow it here, at the boundary, rather than
      // casting — a section set to something this build does not know about
      // falls back to the ordinary block instead of rendering nothing.
      layout:
        row.layout === "opinion" ? ("opinion" as const) : ("standard" as const),
      icon_url: row.icon_url,
    }));
  }

  const base = await supabase
    .from("categories")
    .select("slug, name")
    .eq("is_active", true)
    .eq("show_in_nav", true)
    .order("sort_order", { ascending: true });

  // Navigation failing outright is not a reason to fail the whole page: the
  // reader can still read the article they came for.
  if (base.error) return [];

  return (base.data ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    layout: "standard" as const,
    icon_url: null,
  }));
}

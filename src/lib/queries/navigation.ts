import { createClient } from "@/lib/supabase/server";

export type NavCategory = {
  slug: string;
  name: string;
};

/**
 * The site's navigation, read from the database.
 *
 * There is no hardcoded array of sections anywhere in this codebase. Adding a
 * row to `categories` with show_in_nav = true puts a section in the header;
 * reordering by sort_order reorders the header. Neither requires a deploy.
 */
export async function getNavCategories(): Promise<NavCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("slug, name")
    .eq("is_active", true)
    .eq("show_in_nav", true)
    .order("sort_order", { ascending: true });

  // Navigation failing is not a reason to fail the whole page: the reader can
  // still read the article they came for. Render what we have and move on.
  if (error) return [];
  return data ?? [];
}

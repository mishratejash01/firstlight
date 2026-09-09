import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/roles";

/**
 * Whether the signed-in reader already follows something.
 *
 * Returns a signed-out marker rather than throwing, so a page can render the
 * same control for everyone and let the button decide between "follow" and
 * "sign in to follow".
 */
export async function getFollowState(
  targetType: "tag" | "author" | "category" | "event",
  targetId: string,
): Promise<{ isSignedIn: boolean; following: boolean; followId?: string }> {
  const user = await getSessionUser();
  if (!user) return { isSignedIn: false, following: false };

  const supabase = await createClient();
  const { data } = await supabase
    .from("follows")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  return { isSignedIn: true, following: Boolean(data), followId: data?.id };
}

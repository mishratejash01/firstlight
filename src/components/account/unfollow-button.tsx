"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Removes a follow.
 *
 * Deletes directly rather than through a server action: the RLS delete policy
 * already restricts a reader to their own rows, so routing it through the
 * server would add a hop without adding a check.
 */
export function UnfollowButton({ followId }: { followId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function unfollow() {
    setPending(true);
    const supabase = createClient();
    await supabase.from("follows").delete().eq("id", followId);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={unfollow}
      disabled={pending}
      className="shrink-0 rounded-control border border-hairline px-3 py-1.5 text-meta text-ink hover:border-muted disabled:text-muted"
    >
      {pending ? "Removing…" : "Unfollow"}
    </button>
  );
}

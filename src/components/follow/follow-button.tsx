"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Follow or unfollow a topic, writer or section.
 *
 * Writes straight to the follows table: the RLS policies already restrict a
 * reader to rows carrying their own user_id, so a server action would add a
 * round trip without adding a check.
 *
 * A signed-out reader gets a link to sign in that returns them here, rather
 * than a button that silently does nothing.
 */
export function FollowButton({
  targetType,
  targetId,
  label,
  isSignedIn,
  initiallyFollowing,
  followId,
  returnTo,
}: {
  targetType: "tag" | "author" | "category" | "event";
  targetId: string;
  label: string;
  isSignedIn: boolean;
  initiallyFollowing: boolean;
  followId?: string;
  returnTo: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [currentId, setCurrentId] = useState(followId);
  const [pending, setPending] = useState(false);

  if (!isSignedIn) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(returnTo)}`}
        className="rounded-control border border-hairline px-3.5 py-1.5 text-meta text-ink hover:border-muted"
      >
        Sign in to follow
      </a>
    );
  }

  async function toggle() {
    setPending(true);
    // The database library is loaded on the click, not with the page.
    let supabase;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      supabase = createClient();
    } catch {
      setPending(false);
      return;
    }

    if (following && currentId) {
      await supabase.from("follows").delete().eq("id", currentId);
      setFollowing(false);
      setCurrentId(undefined);
    } else {
      const { data } = await supabase
        .from("follows")
        .insert({ target_type: targetType, target_id: targetId })
        .select("id")
        .single();
      if (data) {
        setFollowing(true);
        setCurrentId(data.id);
      }
    }

    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      className={
        following
          ? "rounded-control border border-hairline px-3.5 py-1.5 text-meta text-muted hover:border-muted disabled:opacity-60"
          : "rounded-control border border-accent bg-accent px-3.5 py-1.5 text-meta text-paper hover:opacity-90 disabled:opacity-60"
      }
    >
      {pending ? "…" : following ? `Following ${label}` : `Follow ${label}`}
    </button>
  );
}

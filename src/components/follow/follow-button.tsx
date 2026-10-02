"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Follow or unfollow a topic, writer or section.
 *
 * Writes straight to the follows table: the RLS policies already restrict a
 * reader to rows carrying their own user_id, so a server action would add a
 * round trip without adding a check.
 *
 * Works out who is reading in the browser rather than on the server. The page
 * it sits on is cached and served the same to everyone; asking on the server
 * meant building every topic page afresh for every visitor, crawlers
 * included, on a hosting plan with a monthly allowance of server time. Most
 * readers have never signed in, and for them the answer is known from the
 * absence of a session cookie without loading the database library at all.
 *
 * A signed-out reader gets a button that takes them to sign in and back here,
 * rather than one that silently does nothing. A button rather than a link: the
 * sign-in page is closed to crawlers, and a link to it from every topic page
 * was reported as a page blocked from search a thousand times over.
 */

type State =
  | { kind: "unknown" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; following: boolean; followId?: string };

function hasSessionCookie(): boolean {
  return document.cookie
    .split("; ")
    .some((row) => /^sb-[^=]+-auth-token(?:\.\d+)?=/.test(row));
}

export function FollowButton({
  targetType,
  targetId,
  label,
  returnTo,
}: {
  targetType: "tag" | "author" | "category" | "event";
  targetId: string;
  label: string;
  returnTo: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "unknown" });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolve() {
      if (!hasSessionCookie()) {
        if (active) setState({ kind: "signed-out" });
        return;
      }
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getClaims();
        if (!auth?.claims?.sub) {
          if (active) setState({ kind: "signed-out" });
          return;
        }
        const { data } = await supabase
          .from("follows")
          .select("id")
          .eq("target_type", targetType)
          .eq("target_id", targetId)
          .maybeSingle();
        if (active) setState({ kind: "signed-in", following: Boolean(data), followId: data?.id });
      } catch {
        if (active) setState({ kind: "signed-out" });
      }
    }

    void resolve();
    return () => {
      active = false;
    };
  }, [targetType, targetId]);

  // Holds the button's place until the answer is in, so nothing below it moves.
  if (state.kind === "unknown") {
    return <span className="inline-block h-[2.125rem]" aria-hidden="true" />;
  }

  if (state.kind === "signed-out") {
    return (
      <button
        type="button"
        onClick={() => router.push(`/login?next=${encodeURIComponent(returnTo)}`)}
        className="rounded-control border border-hairline px-3.5 py-1.5 text-meta text-ink hover:border-muted"
      >
        Sign in to follow
      </button>
    );
  }

  const { following, followId } = state;

  async function toggle() {
    setPending(true);
    // The database library is already loaded: a signed-in reader's state was
    // read with it when the page opened.
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    if (following && followId) {
      await supabase.from("follows").delete().eq("id", followId);
      setState({ kind: "signed-in", following: false });
    } else {
      const { data } = await supabase
        .from("follows")
        .insert({ target_type: targetType, target_id: targetId })
        .select("id")
        .single();
      if (data) setState({ kind: "signed-in", following: true, followId: data.id });
    }

    setPending(false);
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

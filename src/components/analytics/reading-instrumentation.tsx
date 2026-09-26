"use client";

import { useEffect, useRef } from "react";

import {
  ANON_ID_KEY,
  SESSION_ID_KEY,
  measurementAllowed,
  readTrackingMode,
} from "@/lib/analytics/consent";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Client-side reading depth instrumentation.
 *
 * Adds the detail the server cannot see: how far down the page a reader got,
 * whether they finished, and what they clicked on the way out. Together with
 * the server-side page view this produces the drop-off curve editors use to
 * find where a piece loses people.
 *
 * Nothing here runs unless measurement is allowed: the reader agreed, or reads
 * from India while measurement is on by default there (lib/analytics/consent).
 * The anonymous identifier is generated only then; assigning one first and
 * "not using it yet" would be the tracking the reader declined, performed in
 * advance.
 */

/** Dwell required before a full-scroll counts as actually reading it. */
const COMPLETE_DWELL_MS = 20_000;

function getOrCreate(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  storage.setItem(key, created);
  return created;
}

export function ReadingInstrumentation({ articleId }: { articleId: string }) {
  // Milestones must fire once each. A reader scrolling up and down past a
  // boundary is one reader, not five.
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!measurementAllowed(readTrackingMode())) return;

    let anonId: string;
    let sessionId: string;
    try {
      anonId = getOrCreate(window.localStorage, ANON_ID_KEY);
      sessionId = getOrCreate(window.sessionStorage, SESSION_ID_KEY);
    } catch {
      // Storage blocked entirely: skip rather than inventing an identifier that
      // would be regenerated on every page and inflate the reader count.
      return;
    }

    // The database client is fetched here, once measurement is known to be
    // allowed, rather than shipped in every page's first download: it is the
    // largest library on the site, and most readers never send an event.
    const client = import("@/lib/supabase/client")
      .then(({ createClient }) => createClient())
      .catch(() => null);
    const arrivedAt = Date.now();

    const send = (eventType: string, extra: Record<string, Json> = {}) => {
      if (fired.current.has(eventType)) return;
      fired.current.add(eventType);

      // Awaited, not just called: a Supabase query is only sent when something
      // awaits it, and an insert that is never awaited is never made.
      void client.then(async (supabase) => {
        await supabase?.from("analytics_events").insert({
          event_type: eventType,
          article_id: articleId,
          anonymous_id: anonId,
          session_id: sessionId,
          path: window.location.pathname,
          properties: extra,
          is_server_side: false,
        });
      });
    };

    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const pct = (window.scrollY / scrollable) * 100;

      if (pct >= 25) send("scroll_25");
      if (pct >= 50) send("scroll_50");
      if (pct >= 75) send("scroll_75");
      if (pct >= 98) {
        send("scroll_100");
        // Reaching the bottom in three seconds is a scroll, not a read.
        if (Date.now() - arrivedAt >= COMPLETE_DWELL_MS) send("article_complete");
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest("[data-track]");
      if (!target) return;
      const eventType = target.getAttribute("data-track");
      if (eventType) send(eventType, { href: target.getAttribute("href") });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick);
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick);
    };
  }, [articleId]);

  return null;
}

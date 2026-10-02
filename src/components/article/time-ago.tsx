"use client";

import { useSyncExternalStore } from "react";

import { formatDate, formatTimeAgo } from "@/lib/format/datetime";

/**
 * "12 min ago", worked out by the reader's browser.
 *
 * Written into the cached page, a relative time made the page different every
 * minute it was rebuilt, and the hosting plan pays for every changed page it
 * stores. The page carries the date instead, which never changes, and the
 * browser turns it into a relative time for stories from the last day.
 */

const subscribe = () => () => {};

export function TimeAgo({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    subscribe,
    () => formatTimeAgo(iso),
    () => formatDate(iso),
  );

  return <time dateTime={iso}>{label}</time>;
}

"use client";

import { useEffect } from "react";

/**
 * Reports that this page was shown, for the actorless page count.
 *
 * The page is served from the edge cache, so the server does not see the view
 * itself; this tells it, once per page shown. It sends only what the server
 * used to read from the request: the page and the referring page. The server
 * keeps the referrer's host and nothing more (app/api/page-view).
 *
 * Within the site, pages change without a full load, and document.referrer
 * keeps naming wherever the reader first came from. So after the first page,
 * the referrer is the page shown before this one, which is what the server
 * saw when it rendered every page itself.
 */
let previousPage: string | null = null;

export function PageViewBeacon({
  articleId,
  categoryId,
}: {
  articleId?: string;
  categoryId?: string;
}) {
  useEffect(() => {
    const referrer = previousPage ?? document.referrer;
    previousPage = window.location.href;

    const body = JSON.stringify({
      path: window.location.pathname,
      articleId,
      categoryId,
      referrer: referrer || null,
    });

    // A beacon is still delivered if the reader leaves at once; a plain
    // request is the fallback where the browser has no beacon or refuses it.
    const queued =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/page-view", new Blob([body], { type: "application/json" }));
    if (!queued) {
      void fetch("/api/page-view", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  }, [articleId, categoryId]);

  return null;
}

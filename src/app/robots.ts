import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

/**
 * robots.txt.
 *
 * Every crawler is welcome everywhere a reader can go, search engines and AI
 * answer engines alike: being read and cited is the point of publishing. What
 * is closed is only what is not journalism: the newsroom's own tools, account
 * and sign-in flows, the API, and search result pages, which are infinite in
 * number and thin in substance and would otherwise compete in search with the
 * stories they list.
 *
 * The same file is served on every hostname. On the hosting provider's
 * addresses the pages themselves say noindex and point to the canonical
 * domain, and a crawler can only read that if it is allowed to fetch them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/desk",
          "/review",
          "/contribute",
          "/account",
          "/auth/",
          "/login",
          "/search",
          "/api/",
        ],
      },
    ],
    sitemap: [absoluteUrl("/sitemap.xml"), absoluteUrl("/news-sitemap.xml")],
  };
}

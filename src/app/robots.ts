import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Newsroom surfaces and auth flows are not content. /search is excluded
        // because result pages are infinite in number and thin in substance;
        // letting them into the index means competing with the articles they
        // link to.
        disallow: ["/admin", "/desk", "/contribute", "/account", "/auth/", "/login", "/search"],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_URL,
  };
}

import "server-only";

import { SHARE_IMAGE_SHAPE, cloudinaryCrop } from "@/lib/media/transform";
import { articlePath, type SyndicatedArticle } from "@/lib/queries/syndication";
import type { FeedItem } from "@/lib/seo/rss";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

/** One published story as a feed item: headline, link, standfirst, picture. */
export function toFeedItem(article: SyndicatedArticle): FeedItem {
  const cropped = cloudinaryCrop(
    article.hero_image_url,
    SHARE_IMAGE_SHAPE.width,
    SHARE_IMAGE_SHAPE.height,
  );

  return {
    title: article.headline,
    url: absoluteUrl(articlePath(article)),
    description: article.standfirst ?? article.summary,
    publishedAt: article.published_at,
    section: article.categories.name,
    // A story with no named writer is the newsroom's.
    author: article.authors?.display_name ?? SITE_NAME,
    image: cropped
      ? {
          url: cropped,
          width: SHARE_IMAGE_SHAPE.width,
          height: SHARE_IMAGE_SHAPE.height,
          alt: article.hero_image_alt,
        }
      : null,
  };
}

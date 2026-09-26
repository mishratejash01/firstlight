import {
  MIN_INDEXABLE_TOPIC_STORIES,
  getSections,
  getTopicCounts,
} from "@/lib/queries/syndication";
import { renderUrlset, sitemapResponse } from "@/lib/seo/sitemap-xml";
import { absoluteUrl } from "@/lib/site";

/**
 * Topic pages worth a search engine's time: those with enough stories to be a
 * real collection, and not a duplicate of a section front of the same name.
 * The same two rules decide whether a topic page carries noindex, so this
 * list and the pages never disagree.
 */
export const revalidate = 3600;

export async function GET() {
  const [topics, sections] = await Promise.all([getTopicCounts(), getSections()]);
  const sectionSlugs = new Set(sections.map((section) => section.slug));

  const urls = topics
    .filter(
      (topic) =>
        topic.stories >= MIN_INDEXABLE_TOPIC_STORIES && !sectionSlugs.has(topic.slug),
    )
    .map((topic) => ({
      loc: absoluteUrl(`/topic/${topic.slug}`),
      lastmod: topic.lastPublished,
    }));

  return sitemapResponse(renderUrlset(urls));
}

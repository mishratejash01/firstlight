import { SITE_NAME } from "@/lib/site";
import type { ArticleDetail } from "@/lib/queries/article-detail";

/**
 * Structured data builders.
 *
 * The entity markup is the part that matters for the deep-event problem. A
 * search for a narrow detail — a named official, a specific figure — can only
 * match our page if that detail is expressed as structured data rather than
 * buried in a paragraph as a proper noun the crawler has to guess at.
 *
 * `about` carries the primary subjects, `mentions` everything else the piece
 * names. Marking everything as `about` would flatten that distinction and tell
 * a search engine nothing.
 */

const PUBLISHER = {
  "@type": "NewsMediaOrganization",
  name: SITE_NAME,
} as const;

export type EntityLink = {
  relation: "about" | "mentions";
  entity: { name: string; entity_type: string; same_as: string[] };
};

function entityNode(entity: EntityLink["entity"]) {
  return {
    "@type": entity.entity_type,
    name: entity.name,
    // sameAs is how a crawler resolves an ambiguous name to a specific
    // real-world thing. Omitted rather than emitted empty when we have no
    // authority URL, because an empty sameAs asserts nothing.
    ...(entity.same_as?.length ? { sameAs: entity.same_as } : {}),
  };
}

export function newsArticleJsonLd({
  article,
  url,
  entities,
  keyFacts,
}: {
  article: ArticleDetail;
  url: string;
  entities: EntityLink[];
  keyFacts: { label: string; value: string }[];
}) {
  const about = entities.filter((e) => e.relation === "about").map((e) => entityNode(e.entity));
  const mentions = entities.filter((e) => e.relation === "mentions").map((e) => entityNode(e.entity));

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: article.headline,
    description: article.meta_description ?? article.standfirst ?? article.summary ?? undefined,
    articleSection: article.categories.name,
    datePublished: article.published_at ?? undefined,
    dateModified: article.updated_at,
    isAccessibleForFree: true,
    publisher: PUBLISHER,
    ...(article.hero_image_url ? { image: [article.hero_image_url] } : {}),
    ...(article.authors
      ? {
          author: {
            "@type": "Person",
            name: article.authors.display_name,
            ...(article.authors.title ? { jobTitle: article.authors.title } : {}),
          },
        }
      : { author: PUBLISHER }),
    ...(about.length ? { about } : {}),
    ...(mentions.length ? { mentions } : {}),
    // Sourced figures, exposed as structured statistics so a narrow numeric
    // query has something precise to match.
    ...(keyFacts.length
      ? {
          citation: keyFacts.map((fact) => ({
            "@type": "Statement",
            name: fact.label,
            text: `${fact.label}: ${fact.value}`,
          })),
        }
      : {}),
  };
}

/**
 * FAQPage. Emitted only when an article actually carries questions.
 *
 * Attaching this to every article — the templated approach — is what earns a
 * structured-data manual action, so the caller is expected to pass an empty
 * array for routine stories and this returns null.
 */
export function faqJsonLd(faqs: { question: string; answer: string }[]) {
  if (!faqs.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/**
 * LiveBlogPosting for an event hub.
 *
 * coverageEndTime is required by the type and is genuinely load-bearing: an
 * open-ended live blog invites a crawler to keep returning indefinitely. Where
 * coverage has not ended we publish a horizon rather than omitting the field.
 */
export function liveBlogJsonLd({
  url,
  title,
  summary,
  coverageStart,
  coverageEnd,
  updates,
}: {
  url: string;
  title: string;
  summary: string | null;
  coverageStart: string;
  coverageEnd: string | null;
  updates: {
    anchor: string;
    headline: string;
    body: string;
    published_at: string;
  }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LiveBlogPosting",
    "@id": url,
    url,
    headline: title,
    ...(summary ? { description: summary } : {}),
    coverageStartTime: coverageStart,
    coverageEndTime:
      coverageEnd ??
      // 48 hours out: honest about the fact that coverage is still open, without
      // claiming it runs forever.
      new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    publisher: PUBLISHER,
    liveBlogUpdate: updates.map((update) => ({
      "@type": "BlogPosting",
      "@id": `${url}#${update.anchor}`,
      url: `${url}#${update.anchor}`,
      headline: update.headline,
      articleBody: update.body,
      datePublished: update.published_at,
    })),
  };
}

export function breadcrumbJsonLd(
  items: { name: string; url: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

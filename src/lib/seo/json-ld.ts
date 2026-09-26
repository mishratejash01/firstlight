import { toIstIso } from "@/lib/format/datetime";
import { ARTICLE_IMAGE_SHAPES, cloudinaryCrop } from "@/lib/media/transform";
import {
  PUBLISHER,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  SOCIAL_LINKS,
  absoluteUrl,
} from "@/lib/site";

/**
 * Structured data builders.
 *
 * Two jobs. The first is identity: every page says the same thing about who
 * publishes it, with stable @id values, so search engines and AI systems build
 * one consistent picture of the paper (its name, logo, standards pages and
 * corrections policy) instead of guessing from page chrome. The second is the
 * story itself: dates that are true, pictures in the shapes Google asks for,
 * and the people, places and organisations it is about, marked as entities
 * rather than left as proper nouns a crawler has to guess at.
 *
 * `about` carries a story's primary subjects and `mentions` everything else
 * it names. Marking everything as `about` would flatten that distinction and
 * tell a search engine nothing.
 */

export const ORGANIZATION_ID = absoluteUrl("/#organization");
export const WEBSITE_ID = absoluteUrl("/#website");
const LOGO_ID = absoluteUrl("/#logo");

/** The square nameplate, generated at /brand/logo.png. */
function logoNode() {
  return {
    "@type": "ImageObject",
    "@id": LOGO_ID,
    url: absoluteUrl("/brand/logo.png"),
    contentUrl: absoluteUrl("/brand/logo.png"),
    width: 512,
    height: 512,
    caption: SITE_NAME,
  };
}

/**
 * The paper in compact form, for use as publisher inside other nodes. It is
 * repeated in full rather than referenced by @id alone because search engines
 * resolve @id only within the page they are reading.
 */
export function publisherNode() {
  return {
    "@type": "NewsMediaOrganization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: logoNode(),
  };
}

/**
 * The organisation and the website, as one graph. Rendered once on every page
 * from the root layout.
 *
 * The policy properties are the ones schema.org defines for news
 * organisations, which the Trust Project's indicators map onto; each points at
 * a page that states that policy. The owner-supplied facts (legal name,
 * address, contact, founding year) appear only once they are set in
 * PUBLISHER, and sameAs lists only social accounts that exist.
 */
export function siteGraphJsonLd() {
  const sameAs = SOCIAL_LINKS.map((link) => link.href).filter(Boolean);
  const contact = PUBLISHER.email || PUBLISHER.phone;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        ...publisherNode(),
        alternateName: SITE_NAME.replace(/^the\s+/i, ""),
        description: SITE_DESCRIPTION,
        image: { "@id": LOGO_ID },
        knowsLanguage: SITE_LANGUAGE,
        publishingPrinciples: absoluteUrl("/editorial-standards"),
        ethicsPolicy: absoluteUrl("/editorial-standards"),
        verificationFactCheckingPolicy: absoluteUrl("/editorial-standards#verification"),
        noBylinesPolicy: absoluteUrl("/editorial-standards#bylines"),
        correctionsPolicy: absoluteUrl("/corrections"),
        actionableFeedbackPolicy: absoluteUrl("/corrections"),
        missionCoveragePrioritiesPolicy: absoluteUrl("/about"),
        masthead: absoluteUrl("/masthead"),
        ...(PUBLISHER.legalName
          ? { legalName: PUBLISHER.legalName, ownershipFundingInfo: absoluteUrl("/about") }
          : {}),
        ...(PUBLISHER.foundingYear ? { foundingDate: PUBLISHER.foundingYear } : {}),
        ...(PUBLISHER.address
          ? {
              address: {
                "@type": "PostalAddress",
                streetAddress: PUBLISHER.address,
                addressCountry: "IN",
              },
            }
          : {}),
        ...(contact
          ? {
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "newsroom",
                ...(PUBLISHER.email ? { email: PUBLISHER.email } : {}),
                ...(PUBLISHER.phone ? { telephone: PUBLISHER.phone } : {}),
                areaServed: "IN",
                availableLanguage: "en",
              },
            }
          : {}),
        ...(sameAs.length ? { sameAs } : {}),
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: absoluteUrl("/"),
        name: SITE_NAME,
        alternateName: SITE_NAME.replace(/^the\s+/i, ""),
        description: SITE_DESCRIPTION,
        inLanguage: SITE_LANGUAGE,
        publisher: { "@id": ORGANIZATION_ID },
      },
    ],
  };
}

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

/**
 * A story's lead picture in the three shapes Google asks for (16:9, 4:3 and
 * 1:1, each 1200 pixels wide), cropped by Cloudinary around the subject. A
 * picture hosted anywhere else is passed through once, as it is.
 */
export function articleImageNodes(
  url: string | null,
  caption: string | null,
  credit: string | null,
) {
  if (!url) return [];
  const extra = {
    ...(caption ? { caption } : {}),
    ...(credit ? { creditText: credit } : {}),
  };

  const crops = ARTICLE_IMAGE_SHAPES.map((shape) => {
    const cropped = cloudinaryCrop(url, shape.width, shape.height);
    return cropped
      ? { "@type": "ImageObject", url: cropped, contentUrl: cropped, width: shape.width, height: shape.height, ...extra }
      : null;
  }).filter((node) => node !== null);

  return crops.length ? crops : [{ "@type": "ImageObject", url, contentUrl: url, ...extra }];
}

export type ArticleForJsonLd = {
  headline: string;
  standfirst: string | null;
  summary: string | null;
  meta_description: string | null;
  body: string | null;
  published_at: string | null;
  dateModified: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  hero_image_credit: string | null;
  categories: { slug: string; name: string };
  authors: { slug: string; display_name: string; title: string | null } | null;
};

export function wordCount(markdown: string | null): number {
  if (!markdown) return 0;
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function newsArticleJsonLd({
  article,
  url,
  entities,
  keyFacts,
  tags,
}: {
  article: ArticleForJsonLd;
  url: string;
  entities: EntityLink[];
  keyFacts: { label: string; value: string }[];
  tags: { name: string }[];
}) {
  const about = entities.filter((e) => e.relation === "about").map((e) => entityNode(e.entity));
  const mentions = entities.filter((e) => e.relation === "mentions").map((e) => entityNode(e.entity));
  const images = articleImageNodes(article.hero_image_url, article.hero_image_alt, article.hero_image_credit);
  const words = wordCount(article.body);
  const published = toIstIso(article.published_at);

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
      url,
      name: article.headline,
      isPartOf: { "@id": WEBSITE_ID },
      inLanguage: SITE_LANGUAGE,
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    url,
    headline: article.headline,
    description:
      article.meta_description ?? article.standfirst ?? article.summary ?? undefined,
    articleSection: article.categories.name,
    inLanguage: SITE_LANGUAGE,
    datePublished: published,
    dateModified: toIstIso(article.dateModified) ?? published,
    isAccessibleForFree: true,
    isPartOf: { "@id": WEBSITE_ID },
    publisher: publisherNode(),
    copyrightHolder: { "@id": ORGANIZATION_ID },
    ...(article.published_at ? { copyrightYear: new Date(article.published_at).getUTCFullYear() } : {}),
    ...(images.length ? { image: images, thumbnailUrl: images[0].url } : {}),
    // A story with no named writer is the paper's own work, credited to the
    // paper rather than to an invented person.
    author: article.authors
      ? {
          "@type": "Person",
          name: article.authors.display_name,
          url: absoluteUrl(`/author/${article.authors.slug}`),
          ...(article.authors.title ? { jobTitle: article.authors.title } : {}),
        }
      : { "@type": "NewsMediaOrganization", "@id": ORGANIZATION_ID, name: SITE_NAME, url: absoluteUrl("/") },
    ...(tags.length ? { keywords: tags.map((tag) => tag.name).join(", ") } : {}),
    ...(words ? { wordCount: words } : {}),
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
  imageUrl,
  updates,
}: {
  url: string;
  title: string;
  summary: string | null;
  coverageStart: string;
  coverageEnd: string | null;
  imageUrl?: string | null;
  updates: {
    anchor: string;
    headline: string;
    body: string;
    published_at: string;
  }[];
}) {
  const images = articleImageNodes(imageUrl ?? null, null, null);
  const latest = updates.reduce<string | null>(
    (newest, update) => (!newest || update.published_at > newest ? update.published_at : newest),
    null,
  );
  // Where coverage has no stated end, the horizon runs 48 hours past the most
  // recent update rather than past the moment of the request, so a hub that
  // stopped updating stops claiming to be live.
  const horizon = new Date(
    (latest ? Date.parse(latest) : Date.now()) + 48 * 60 * 60 * 1000,
  ).toISOString();

  return {
    "@context": "https://schema.org",
    "@type": "LiveBlogPosting",
    "@id": url,
    url,
    headline: title,
    ...(summary ? { description: summary } : {}),
    inLanguage: SITE_LANGUAGE,
    coverageStartTime: toIstIso(coverageStart),
    coverageEndTime: toIstIso(coverageEnd ?? horizon),
    datePublished: toIstIso(coverageStart),
    ...(latest ? { dateModified: toIstIso(latest) } : {}),
    ...(images.length ? { image: images } : {}),
    isPartOf: { "@id": WEBSITE_ID },
    publisher: publisherNode(),
    author: { "@type": "NewsMediaOrganization", "@id": ORGANIZATION_ID, name: SITE_NAME, url: absoluteUrl("/") },
    liveBlogUpdate: updates.map((update) => ({
      "@type": "BlogPosting",
      "@id": `${url}#${update.anchor}`,
      url: `${url}#${update.anchor}`,
      headline: update.headline,
      articleBody: update.body,
      datePublished: toIstIso(update.published_at),
    })),
  };
}

export function breadcrumbJsonLd(
  items: { name: string; url: string }[],
  id?: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    ...(id ? { "@id": id } : {}),
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * A page that lists stories: a section front, a topic page, the front page.
 * The list is the stories actually shown, in the order shown.
 */
export function collectionPageJsonLd({
  url,
  name,
  description,
  items,
  about,
}: {
  url: string;
  name: string;
  description: string | null;
  items: { url: string; name: string }[];
  about?: { name: string } | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    url,
    name,
    ...(description ? { description } : {}),
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": WEBSITE_ID },
    publisher: publisherNode(),
    ...(about ? { about: { "@type": "Thing", name: about.name } } : {}),
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: item.url,
        name: item.name,
      })),
    },
  };
}

/** A writer's page: who they are, and that the paper is where they work. */
export function profilePageJsonLd({
  url,
  name,
  jobTitle,
  description,
  image,
  sameAs,
}: {
  url: string;
  name: string;
  jobTitle: string | null;
  description: string | null;
  image: string | null;
  sameAs: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": url,
    url,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#person`,
      name,
      url,
      ...(jobTitle ? { jobTitle } : {}),
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
      ...(sameAs.length ? { sameAs } : {}),
      worksFor: { "@id": ORGANIZATION_ID },
    },
  };
}

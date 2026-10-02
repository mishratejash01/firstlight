import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { profilePageJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

import { ArticleCard } from "@/components/article/article-card";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getArticlesByAuthor } from "@/lib/queries/articles";
import { FollowButton } from "@/components/follow/follow-button";
import { createAnonymousClient } from "@/lib/supabase/anonymous";

/**
 * Cached like any other public page, rebuilt at most once an hour; the follow
 * button finds out who is reading in the browser.
 */
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}


async function getAuthor(slug: string) {
  const supabase = createAnonymousClient();
  const { data } = await supabase
    .from("authors")
    .select("id, slug, display_name, title, bio, avatar_url, links")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

export async function generateMetadata(
  props: PageProps<"/author/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const author = await getAuthor(slug);
  if (!author) return { title: "Not found" };
  const published = await getArticlesByAuthor(slug, 1);

  return pageMetadata({
    title: author.display_name,
    description:
      author.bio ??
      `${author.display_name}${author.title ? `, ${author.title}` : ""}: stories for ${SITE_NAME}.`,
    path: `/author/${author.slug}`,
    // A writer with nothing published has an empty page; it stays reachable
    // but is not offered to search engines until there is work on it.
    noindex: published.length === 0,
  });
}

/** Profile links stored on the author, as a flat list of URLs for sameAs. */
function profileLinks(links: unknown): string[] {
  if (!links || typeof links !== "object") return [];
  return Object.values(links as Record<string, unknown>).filter(
    (value): value is string => typeof value === "string" && /^https?:\/\//.test(value),
  );
}

export default async function AuthorPage(props: PageProps<"/author/[slug]">) {
  const { slug } = await props.params;
  const author = await getAuthor(slug);
  if (!author) notFound();

  const articles = await getArticlesByAuthor(slug, 40);

  return (
    <>
      <SiteHeader />

      {/* A Person node with a real bio and a body of work is what lets a search
          engine treat a byline as an author entity rather than a string. */}
      <JsonLd
        data={profilePageJsonLd({
          url: absoluteUrl(`/author/${author.slug}`),
          name: author.display_name,
          jobTitle: author.title,
          description: author.bio,
          image: author.avatar_url,
          sameAs: profileLinks(author.links),
        })}
      />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <h1 className="text-hero text-ink">{author.display_name}</h1>
          {author.title ? (
            <p className="mt-1 text-lead text-muted">{author.title}</p>
          ) : null}
          {author.bio ? (
            <p className="mt-4 max-w-measure text-body leading-relaxed text-ink">
              {author.bio}
            </p>
          ) : null}
          <div className="mt-4">
            <FollowButton
              targetType="author"
              targetId={author.id}
              label={author.display_name}
              returnTo={`/author/${author.slug}`}
            />
          </div>
        </div>

        {articles.length ? (
          <div className="story-grid py-10">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <p className="py-16 text-lead text-muted">
            No published work from this writer yet.
          </p>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ArticleCard } from "@/components/article/article-card";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getArticlesByAuthor } from "@/lib/queries/articles";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function getAuthor(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("authors")
    .select("slug, display_name, title, bio, avatar_url, links")
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

  return {
    title: `${author.display_name} — Newswebsite`,
    description: author.bio ?? `Articles by ${author.display_name}.`,
    alternates: { canonical: `/author/${author.slug}` },
  };
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
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: {
            "@type": "Person",
            name: author.display_name,
            ...(author.title ? { jobTitle: author.title } : {}),
            ...(author.bio ? { description: author.bio } : {}),
            url: `${SITE_URL}/author/${author.slug}`,
          },
        }}
      />

      <main className="route-enter mx-auto max-w-6xl px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <h1 className="font-serif text-hero text-ink">{author.display_name}</h1>
          {author.title ? (
            <p className="mt-1 text-lead text-muted">{author.title}</p>
          ) : null}
          {author.bio ? (
            <p className="mt-4 max-w-measure text-body leading-relaxed text-ink">
              {author.bio}
            </p>
          ) : null}
        </div>

        {articles.length ? (
          <div className="grid gap-x-6 gap-y-10 py-10 sm:grid-cols-2 lg:grid-cols-3">
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

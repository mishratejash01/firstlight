import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

import { ArticleCard } from "@/components/article/article-card";
import { HeroStory } from "@/components/article/hero-story";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getArticlesByCategory } from "@/lib/queries/articles";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 120;

async function getCategory(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("slug, name, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

export async function generateMetadata(
  props: PageProps<"/[category]">,
): Promise<Metadata> {
  const { category: slug } = await props.params;
  const category = await getCategory(slug);
  if (!category) return { title: "Not found" };
  const [latest] = await getArticlesByCategory(slug, 1);

  return pageMetadata({
    title: `${category.name} news`,
    description:
      category.description ??
      `The latest ${category.name.toLowerCase()} news and reporting from ${SITE_NAME}.`,
    path: `/${category.slug}`,
    rss: {
      url: absoluteUrl(`/${category.slug}/feed.xml`),
      title: `${category.name} - ${SITE_NAME}`,
    },
    // A section with nothing in it yet is an empty page to a search engine.
    noindex: !latest,
  });
}

export default async function CategoryPage(props: PageProps<"/[category]">) {
  const { category: slug } = await props.params;
  const category = await getCategory(slug);
  if (!category) notFound();

  const articles = await getArticlesByCategory(slug, 31);
  const [lead, ...rest] = articles;

  const url = absoluteUrl(`/${category.slug}`);

  return (
    <>
      <SiteHeader activeSlug={category.slug} />

      <JsonLd
        data={collectionPageJsonLd({
          url,
          name: `${category.name} news`,
          description: category.description,
          items: articles.map((article) => ({
            url: absoluteUrl(`/${article.categories.slug}/${article.slug}`),
            name: article.headline,
          })),
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/") },
          { name: category.name, url },
        ])}
      />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <h1 className="text-hero font-bold tracking-[-0.02em] text-ink">
            {category.name}
          </h1>
          {category.description ? (
            <p className="mt-2 max-w-measure text-lead text-muted">
              {category.description}
            </p>
          ) : null}
        </div>

        {lead ? (
          <div className="py-10">
            <HeroStory article={lead} />
          </div>
        ) : (
          <p className="py-16 text-lead text-muted">
            Nothing published in this section yet.
          </p>
        )}

        {rest.length ? (
          <div className="story-grid border-t border-hairline py-10">
            {rest.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                showEyebrow={false}
              />
            ))}
          </div>
        ) : null}
      </main>

      <SiteFooter />
    </>
  );
}

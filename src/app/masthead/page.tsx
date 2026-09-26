import Link from "next/link";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import { StaticPage } from "@/components/site/static-page";
import { getPublishingAuthors } from "@/lib/queries/syndication";
import { pageMetadata } from "@/lib/seo/metadata";
import { PUBLISHER, SITE_NAME } from "@/lib/site";
import { createAnonymousClient } from "@/lib/supabase/anonymous";

export const revalidate = 600;

/**
 * Writers with published work, from the authors table. A byline with nothing
 * under it is not staff a reader can judge, so only writers who have
 * published appear here.
 */
async function getWriters() {
  const publishing = await getPublishingAuthors();
  if (!publishing.length) return [];

  const supabase = createAnonymousClient();
  const { data } = await supabase
    .from("authors")
    .select("slug, display_name, title, bio")
    .eq("is_active", true)
    .in("slug", publishing.map((author) => author.slug))
    .order("display_name", { ascending: true });
  return data ?? [];
}

export async function generateMetadata(): Promise<Metadata> {
  const writers = await getWriters();
  const hasContent = Boolean(PUBLISHER.editor.name || PUBLISHER.legalName || writers.length);

  return pageMetadata({
    title: "Masthead",
    description: `The people responsible for ${SITE_NAME}.`,
    path: "/masthead",
    // Until there is someone to list, the page stays out of search.
    noindex: !hasContent,
  });
}

export default async function MastheadPage() {
  const writers = await getWriters();

  return (
    <StaticPage
      title="Masthead"
      standfirst={`The people responsible for ${SITE_NAME}.`}
    >
      <div className="space-y-4 text-body leading-relaxed text-ink">
        {PUBLISHER.editor.name ? (
          <div className="border-t border-hairline pt-5">
            <h2 className="text-[1.15rem] text-ink">{PUBLISHER.editor.name}</h2>
            <p className="mt-0.5 text-meta text-muted">
              {PUBLISHER.editor.title || "Editor"}
            </p>
          </div>
        ) : null}

        {writers.length ? (
          <ul className="divide-y divide-hairline border-t border-hairline">
            {writers.map((author) => (
              <li key={author.slug} className="py-5">
                <h2 className="text-[1.15rem] text-ink">
                  <Link href={`/author/${author.slug}`} className="hover:text-accent">
                    {author.display_name}
                  </Link>
                </h2>
                {author.title ? (
                  <p className="mt-0.5 text-meta text-muted">{author.title}</p>
                ) : null}
                {author.bio ? (
                  <p className="mt-2 text-body leading-relaxed text-muted">{author.bio}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {PUBLISHER.legalName ? (
          <p className="border-t border-hairline pt-5 text-meta text-muted">
            {SITE_NAME} is published by {PUBLISHER.legalName}
            {PUBLISHER.address ? `, ${PUBLISHER.address}` : ""}.
          </p>
        ) : null}

        <p className="text-meta text-muted">
          Stories without a named writer are the work of our newsroom and are
          published under the paper&rsquo;s name. Our{" "}
          <Link href="/editorial-standards" className="text-accent underline underline-offset-4">
            editorial standards
          </Link>{" "}
          set out how they are sourced and checked.
        </p>

        {PUBLISHER.editor.email ? (
          <p className="text-meta text-muted">
            Write to the editor at <EmailLink address={PUBLISHER.editor.email} />.
            Every other way to reach us is on the{" "}
            <Link href="/contact" className="text-accent underline underline-offset-4">
              contact page
            </Link>
            .
          </p>
        ) : null}
      </div>
    </StaticPage>
  );
}

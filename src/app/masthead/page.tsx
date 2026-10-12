import Link from "next/link";
import { Fragment } from "react";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import {
  DOCUMENTS_UPDATED,
  LegalDocument,
  clauseLink as link,
} from "@/components/site/legal-document";
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
  const editor = PUBLISHER.editor;

  return (
    <LegalDocument
      title="Masthead"
      standfirst={`The people responsible for ${SITE_NAME}.`}
      lastUpdated={DOCUMENTS_UPDATED}
      sections={[
        {
          id: "editor",
          title: "Editor",
          items: [
            editor.name ? (
              <>
                <span className="font-semibold">{editor.name}</span>,{" "}
                {editor.title || "Editor"}, is responsible for what {SITE_NAME}{" "}
                publishes.
              </>
            ) : null,
          ],
        },
        {
          id: "writers",
          title: "Writers",
          items: writers.map((author) => (
            <Fragment key={author.slug}>
              <Link
                href={`/author/${author.slug}`}
                className="font-semibold text-ink underline-offset-4 hover:underline"
              >
                {author.display_name}
              </Link>
              {author.title ? <span className="text-muted">, {author.title}</span> : null}
              {author.bio ? <span className="mt-1 block text-muted">{author.bio}</span> : null}
            </Fragment>
          )),
        },
        {
          id: "newsroom",
          title: "The newsroom",
          items: [
            <>
              Stories without a named writer are the work of our newsroom and
              are published under the paper&rsquo;s name. Our{" "}
              <Link href="/editorial-standards" className={link}>
                editorial standards
              </Link>{" "}
              set out how they are sourced and checked.
            </>,
          ],
        },
        {
          id: "publisher",
          title: "Publisher",
          items: [
            PUBLISHER.legalName ? (
              <>
                {SITE_NAME} is published by {PUBLISHER.legalName}
                {PUBLISHER.address ? `, ${PUBLISHER.address}` : ""}.
              </>
            ) : null,
          ],
        },
        {
          id: "write-to-us",
          title: "Writing to us",
          items: [
            editor.email ? (
              <>
                Write to the editor at <EmailLink address={editor.email} />.
                Every other way to reach us is on the{" "}
                <Link href="/contact" className={link}>
                  contact page
                </Link>
                .
              </>
            ) : null,
          ],
        },
      ]}
    />
  );
}

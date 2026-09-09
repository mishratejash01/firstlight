import Link from "next/link";
import type { Metadata } from "next";

import { EditorialNotice } from "@/components/site/editorial-notice";
import { StaticPage } from "@/components/site/static-page";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Masthead — Newswebsite",
  description: "The people who report and edit this publication.",
  alternates: { canonical: "/masthead" },
};

export const revalidate = 600;

export default async function MastheadPage() {
  // Read from the authors table, not a list in this file. Adding a journalist
  // to the newsroom puts them on the masthead; nobody has to remember to edit
  // a page.
  const supabase = await createClient();
  const { data: authors } = await supabase
    .from("authors")
    .select("slug, display_name, title, bio")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  return (
    <StaticPage
      title="Masthead"
      standfirst="The people who report and edit this publication."
    >
      <EditorialNotice>
        Job titles are drawn from the newsroom database. Confirm each is
        accurate, and add the senior editorial and corporate roles that do not
        carry a byline, before launch.
      </EditorialNotice>

      {authors?.length ? (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {authors.map((author) => (
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
      ) : (
        <p className="text-body text-muted">No bylines recorded yet.</p>
      )}
    </StaticPage>
  );
}

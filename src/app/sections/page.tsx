import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo/metadata";
import Image from "next/image";
import Link from "next/link";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getAllSections } from "@/lib/queries/navigation";

export const metadata: Metadata = pageMetadata({
  title: "All sections",
  description: "Every section of The India Decade, from politics and business to science, sport and culture.",
  path: "/sections",
});

/**
 * The full index of sections, as a page.
 *
 * This is where "More" goes on a phone. A side panel is a desktop idea: it
 * works because there is page left over beside it to stay oriented by. On a
 * phone it covers the entire screen, which makes it a page already — just one
 * that is not in the history, cannot be linked to or shared, and leaves the
 * reader with nothing but a small close button to get out of. A real page
 * behaves the way a reader already expects: the back gesture returns them.
 *
 * Every section, not only the ones the header could not carry. A reader who
 * asks to see the sections is asking for the paper's contents, and an index
 * that silently omits the eleven already in the bar above is a strange kind of
 * index.
 *
 * Alphabetical rather than the running order, for the same reason the panel
 * uses it: someone opening this is looking for a section by name, and
 * alphabetical is the only order you can search by eye.
 */
export default async function SectionsPage() {
  const sections = await getAllSections();
  const byName = [...sections].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <SiteHeader />
      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="py-10">
          <h1 className="text-hero leading-tight text-ink">All sections</h1>
          <p className="mt-3 text-lead leading-relaxed text-muted">
            Every section of the paper.
          </p>

          {byName.length ? (
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {byName.map((section) => (
                <li key={section.slug}>
                  <Link
                    href={`/${section.slug}`}
                    className="flex h-full flex-col items-center gap-2.5 rounded-panel bg-wash p-6 text-center hover:text-accent"
                  >
                    {/* The slot is kept whether or not there is a mark, so a
                        section without artwork keeps its place in the row
                        rather than riding up and breaking the line. */}
                    <span className="flex h-10 items-end">
                      {section.icon_url ? (
                        <Image
                          src={section.icon_url}
                          alt=""
                          aria-hidden="true"
                          width={80}
                          height={80}
                          className="h-10 w-10 object-contain"
                        />
                      ) : null}
                    </span>
                    <span className="font-label text-body font-semibold text-ink">
                      {section.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-body text-muted">
              No sections are in circulation yet.
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

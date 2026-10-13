import Link from "next/link";

import type { CaseStudyCardData } from "@/lib/queries/case-studies";

import { CaseStudyCard } from "./case-study-card";

export type Subject = { slug: string; name: string };

/**
 * The Case studies front: a library rather than a news river.
 *
 * The newest case study leads at full width, then the rest are shelved by
 * subject in the sections' own order, so a reader looking for health finds
 * every health case study together. Older pages are a plain grid, for the
 * reader going through the archive and for crawlers walking it.
 */
export function CaseStudyLibrary({
  items,
  subjects,
  page,
  hasOlder,
  pageHref,
}: {
  items: CaseStudyCardData[];
  subjects: Subject[];
  page: number;
  hasOlder: boolean;
  pageHref: (page: number) => string;
}) {
  const nameOf = new Map(subjects.map((s) => [s.slug, s.name]));
  const subjectName = (item: CaseStudyCardData) => (item.subject_slug ? (nameOf.get(item.subject_slug) ?? null) : null);

  const lead = page === 1 ? items[0] : undefined;
  const rest = page === 1 ? items.slice(1) : items;

  // Shelves in the sections' order; a subject with nothing on it is not shown.
  const shelves = subjects
    .map((subject) => ({ subject, items: rest.filter((item) => item.subject_slug === subject.slug) }))
    .filter((shelf) => shelf.items.length > 0);
  const unfiled = rest.filter((item) => !item.subject_slug || !nameOf.has(item.subject_slug));

  return (
    <>
      {page === 1 ? (
        <header className="border-b border-hairline pt-8 pb-6">
          <h1 className="font-headline text-[2rem] leading-[1.1] text-ink sm:text-[2.5rem]">Case studies</h1>
          <p className="mt-3 max-w-measure text-lead text-muted">
            The question behind the news, answered in full: how it works, who it affects, what is being done, and
            whether that works. Each one is kept current and says when it was last reviewed.
          </p>
        </header>
      ) : (
        <h1 className="sr-only">Case studies · page {page}</h1>
      )}

      {lead ? (
        <div className="py-10">
          <CaseStudyCard item={lead} subjectName={subjectName(lead)} variant="lead" />
        </div>
      ) : page === 1 ? (
        <p className="py-16 text-lead text-muted">The first case studies are being written.</p>
      ) : null}

      {page === 1 ? (
        <>
          {shelves.map(({ subject, items: shelfItems }) => (
            <section key={subject.slug} aria-labelledby={`cs-${subject.slug}`} className="border-t border-hairline py-10">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id={`cs-${subject.slug}`} className="font-label text-section font-semibold text-ink">
                  <Link href={`/${subject.slug}`} className="hover:text-accent">
                    {subject.name}
                  </Link>
                </h2>
                <span className="font-label text-meta text-muted">
                  {shelfItems.length} {shelfItems.length === 1 ? "case study" : "case studies"}
                </span>
              </div>
              <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {shelfItems.slice(0, 4).map((item) => (
                  <CaseStudyCard key={item.id} item={item} subjectName={null} />
                ))}
              </div>
              {shelfItems.length > 4 ? (
                <ul className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
                  {shelfItems.slice(4).map((item) => (
                    <li key={item.id}>
                      <CaseStudyCard item={item} subjectName={null} variant="row" />
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
          {unfiled.length ? (
            <section className="border-t border-hairline py-10">
              <h2 className="font-label text-section font-semibold text-ink">More case studies</h2>
              <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {unfiled.map((item) => (
                  <CaseStudyCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="grid gap-x-6 gap-y-10 py-10 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((item) => (
            <CaseStudyCard key={item.id} item={item} subjectName={subjectName(item)} />
          ))}
        </div>
      )}

      {page > 1 || hasOlder ? (
        <nav aria-label="Case studies pages" className="flex items-center justify-between border-t border-hairline py-8 text-body">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-accent underline underline-offset-4">
              Newer case studies
            </Link>
          ) : (
            <span />
          )}
          {hasOlder ? (
            <Link href={pageHref(page + 1)} className="text-accent underline underline-offset-4">
              Older case studies
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

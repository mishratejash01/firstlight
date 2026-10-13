import Link from "next/link";

import type { CaseStudyCardData } from "@/lib/queries/case-studies";

import { CaseStudyCard } from "./case-study-card";

export type Subject = { slug: string; name: string };

/** A subject gets a picture shelf of its own once it has this many. */
const SHELF_FROM = 3;

/**
 * The Case studies front: a reference library rather than a news river.
 *
 * The newest leads as a dossier on a tinted panel. Under it, every case
 * study in a dense two-column list, the question doing the work, so the page
 * is full and useful from the first few. Subjects that have grown get a
 * picture shelf of their own below, in the sections' order. Older pages are
 * the same list, for a reader going through the archive and for crawlers.
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
  const counts = subjects
    .map((subject) => ({ subject, count: items.filter((item) => item.subject_slug === subject.slug).length }))
    .filter((entry) => entry.count > 0);
  const shelves = counts
    .filter((entry) => entry.count >= SHELF_FROM)
    .map(({ subject }) => ({ subject, items: rest.filter((item) => item.subject_slug === subject.slug) }));

  return (
    <>
      {page === 1 ? (
        <header className="border-b border-hairline pt-10 pb-8">
          <p className="font-label text-meta font-semibold text-accent">The question behind the news</p>
          <h1 className="headline-lg mt-2 text-hero text-ink sm:text-hero-lg">Case studies</h1>
          <p className="mt-4 max-w-measure font-dek text-[1.125rem] leading-[1.5] text-ink">
            How it works, who it affects, what is being done, and whether that works: one page per question, kept
            current, with the date it was last reviewed.
          </p>
          {counts.length ? (
            <nav aria-label="Subjects" className="mt-6 flex flex-wrap gap-2">
              {counts.map(({ subject, count }) => (
                <a
                  key={subject.slug}
                  href={`#cs-${subject.slug}`}
                  className="rounded-control border border-hairline px-3 py-1.5 font-label text-meta text-ink hover:border-accent hover:text-accent"
                >
                  {subject.name} <span className="text-muted">{count}</span>
                </a>
              ))}
            </nav>
          ) : null}
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

      {rest.length ? (
        <section aria-labelledby="cs-all" className={page === 1 ? "border-t border-hairline pt-6 pb-4" : "pt-8 pb-4"}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="cs-all" className="font-label text-section font-semibold text-ink">
              {page === 1 ? "All case studies" : `Older case studies · page ${page}`}
            </h2>
            {page === 1 ? <span className="font-label text-meta text-muted">{items.length} in all</span> : null}
          </div>
          <ul className="mt-2 md:grid md:grid-cols-2 md:gap-x-12">
            {rest.map((item) => (
              <li key={item.id} id={item.subject_slug ? `cs-${item.subject_slug}` : undefined} className="border-t border-hairline">
                <CaseStudyCard item={item} subjectName={subjectName(item)} variant="line" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page === 1
        ? shelves.map(({ subject, items: shelfItems }) => (
            <section key={subject.slug} aria-labelledby={`cs-shelf-${subject.slug}`} className="border-t border-hairline py-10">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id={`cs-shelf-${subject.slug}`} className="font-label text-section font-semibold text-ink">
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
            </section>
          ))
        : null}

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

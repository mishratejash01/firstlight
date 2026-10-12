import { Fragment, type ReactNode } from "react";

import { NewsColumn } from "@/components/site/live-headlines";
import { StaticPage } from "@/components/site/static-page";

/**
 * The paper's standing documents — About, Terms, Privacy, Editorial
 * standards, Corrections, Contact, Masthead — set out as one kind of page:
 * numbered clauses, the contents held in a column on the left, and the title
 * kept for screen readers and search engines but not shown. Inside a clause
 * the text runs as ordinary paragraphs rather than numbered points: the clause
 * number is enough to cite, and a page of 1.1, 1.2, 1.3 read as a checklist.
 *
 * The numbers are worked out here from what is actually rendered, never typed
 * by hand: several clauses only appear once the owner has supplied a detail
 * (the grievance officer, the registered address), and a hand-numbered page
 * would skip from 9 to 11 the day one of them was missing. A clause with no
 * items left after that is dropped, contents entry and all.
 */

export type LegalSection = {
  /** The anchor other pages link to (#grievance). Keep it stable. */
  id: string;
  title: string;
  /** The clause's text, a piece at a time; null or false leaves one out. */
  items: (ReactNode | null | false | undefined)[];
  /** Run every piece together as one paragraph, for clauses made of a few
   *  short sentences. Otherwise each piece is a paragraph of its own. */
  join?: boolean;
};

export function LegalDocument({
  title,
  standfirst,
  lastUpdated,
  sections,
}: {
  title: string;
  standfirst?: string;
  /** Shown above the contents, e.g. "13 October 2026". */
  lastUpdated?: string;
  sections: LegalSection[];
}) {
  const shown = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item): item is Exclude<typeof item, null | false | undefined> =>
          item !== null && item !== false && item !== undefined,
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <StaticPage title={title} standfirst={standfirst} wide hideTitle>
      {/* Three columns on a wide screen: the contents on the left, held in
          view while the clauses scroll past in the middle, and the latest news
          on the right, so a reader who came to check a policy still has the
          paper in view. Between 1024 and 1280 there is room for two; the news
          moves under the clauses. On a phone everything stacks, contents
          first. */}
      <div className="text-body leading-relaxed text-ink lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-x-14 xl:grid-cols-[14rem_minmax(0,1fr)_19rem] xl:gap-x-12">
        <aside className="lg:sticky lg:top-32 lg:self-start">
          {lastUpdated ? (
            <p className="font-label text-meta text-muted">
              Last updated {lastUpdated}
            </p>
          ) : null}

          <nav
            aria-label="Contents"
            className={`tint-panel rounded-panel px-5 py-5 ${lastUpdated ? "mt-4" : ""}`}
          >
            <p className="font-label text-meta font-semibold text-ink">Contents</p>
            <ol className="mt-3 grid gap-x-8 gap-y-1.5 text-meta sm:grid-cols-2 lg:grid-cols-1">
              {shown.map((section, index) => (
                <li key={section.id} className="flex gap-2">
                  <span className="tabular-nums text-muted">{index + 1}.</span>
                  <a
                    href={`#${section.id}`}
                    className="text-ink underline-offset-4 hover:underline"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="max-w-[46rem] lg:-mt-10">
          {shown.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="scroll-mt-28 pt-10"
            >
              <h2
                id={`${section.id}-title`}
                className="flex items-baseline gap-3 font-headline text-[1.375rem] leading-tight font-semibold text-ink"
              >
                <span className="tabular-nums text-muted">{index + 1}.</span>
                {section.title}
              </h2>
              <div className="mt-4 space-y-4">
                {section.join ? (
                  <p>
                    {section.items.map((item, itemIndex) => (
                      <Fragment key={itemIndex}>
                        {itemIndex > 0 ? " " : null}
                        {item}
                      </Fragment>
                    ))}
                  </p>
                ) : (
                  section.items.map((item, itemIndex) => <p key={itemIndex}>{item}</p>)
                )}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 lg:col-span-2 xl:col-span-1 xl:mt-0">
          <NewsColumn />
        </div>
      </div>
    </StaticPage>
  );
}

/** A bold lead-in at the start of a sub-clause: "Defamation." */
export function Lead({ children }: { children: ReactNode }) {
  return <strong className="font-semibold">{children} </strong>;
}

/** Link style used inside the clauses. */
export const clauseLink = "text-accent underline underline-offset-4";

/** The date the standing documents were last revised. */
export const DOCUMENTS_UPDATED = "13 October 2026";

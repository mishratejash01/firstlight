import { SectionHeader } from "@/components/article/section-shelf";
import type { CaseStudyCardData } from "@/lib/queries/case-studies";

import { CaseStudyCard } from "./case-study-card";

/**
 * The front page's case-study shelf: the newest as a dossier on its tinted
 * panel, the next three as rows beside it. Quiet by design; the questions
 * do the work.
 */
export function CaseStudyShelf({
  items,
  subjects,
  iconUrl,
}: {
  items: CaseStudyCardData[];
  subjects: { slug: string; name: string }[];
  iconUrl?: string | null;
}) {
  if (!items.length) return null;
  const nameOf = new Map(subjects.map((s) => [s.slug, s.name]));
  const subjectName = (item: CaseStudyCardData) => (item.subject_slug ? (nameOf.get(item.subject_slug) ?? null) : null);
  const [lead, ...rows] = items;

  return (
    <section aria-labelledby="front-case-studies">
      <SectionHeader title="Case studies" href="/case-studies" iconUrl={iconUrl} />
      <div className={`mt-6 grid gap-8 ${rows.length ? "lg:grid-cols-12 lg:gap-10" : ""}`}>
        <div className={rows.length ? "lg:col-span-8" : ""}>
          <CaseStudyCard item={lead} subjectName={subjectName(lead)} variant="lead" />
        </div>
        {rows.length ? (
          <ul className="grid content-start gap-5 lg:col-span-4">
            {rows.slice(0, 3).map((item) => (
              <li key={item.id} className="border-t border-hairline pt-5 first:border-t-0 first:pt-0">
                <CaseStudyCard item={item} subjectName={subjectName(item)} variant="row" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

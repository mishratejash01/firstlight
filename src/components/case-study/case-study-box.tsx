import Link from "next/link";

import { formatDate } from "@/lib/format/datetime";
import type { CaseStudyCardData } from "@/lib/queries/case-studies";

import { caseStudyHref } from "./case-study-card";

/**
 * Set into a news story: the case study that answers the question behind it.
 * The day's story feeds the standing page, and the page keeps earning.
 */
export function CaseStudyBox({ item }: { item: CaseStudyCardData }) {
  const href = caseStudyHref(item);
  const reviewed = item.reviewed_at ?? item.published_at;
  return (
    <aside aria-label="Case study" className="my-8 rounded-panel border-l-4 border-accent bg-wash px-5 py-4 sm:px-6">
      <p className="font-label text-meta font-semibold text-ink">Case study</p>
      <p className="mt-1.5 font-headline text-[1.25rem] leading-[1.25] text-ink">
        <Link href={href} className="hover:text-accent">
          {item.headline}
        </Link>
      </p>
      {item.standfirst ? <p className="mt-2 text-body leading-relaxed text-muted">{item.standfirst}</p> : null}
      <p className="mt-3 font-label text-meta text-muted">
        <Link href={href} className="text-accent underline-offset-4 hover:underline">
          Read the full case study
        </Link>
        {reviewed ? <> &middot; reviewed {formatDate(reviewed)}</> : null}
      </p>
    </aside>
  );
}

import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import { SectionFront, sectionMetadata } from "../../section-front";

/**
 * Older stories in a section, thirty to a page: /politics/page/2 and on.
 * Cached at the edge and rebuilt at most every five minutes, the longest the
 * site's layout allows; older pages change only as new stories push the rest
 * along.
 */
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

/** "2" -> 2. Anything that is not a whole number of at least 2 is not a page. */
function pageNumber(value: string): number | null {
  return /^\d{1,4}$/.test(value) && Number(value) >= 2 ? Number(value) : null;
}

export async function generateMetadata(
  props: PageProps<"/[category]/page/[page]">,
): Promise<Metadata> {
  const { category, page } = await props.params;
  const number = pageNumber(page);
  if (number === null) return { title: "Not found" };
  return sectionMetadata(category, number);
}

export default async function OlderSectionPage(props: PageProps<"/[category]/page/[page]">) {
  const { category, page } = await props.params;
  const number = pageNumber(page);
  if (number === null) {
    // Page 1 is the section front itself.
    if (page === "1") permanentRedirect(`/${category}`);
    notFound();
  }
  return <SectionFront slug={category} page={number} />;
}

import type { Metadata } from "next";

import { SectionFront, sectionMetadata } from "./section-front";

/**
 * A section front, cached at the edge and rebuilt at most every two minutes.
 * No section is rendered at build time; each is rendered on its first request
 * and cached from then on, so a section added in the database needs no deploy.
 */
export const revalidate = 120;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata(
  props: PageProps<"/[category]">,
): Promise<Metadata> {
  const { category } = await props.params;
  return sectionMetadata(category, 1);
}

export default async function CategoryPage(props: PageProps<"/[category]">) {
  const { category } = await props.params;
  return <SectionFront slug={category} page={1} />;
}

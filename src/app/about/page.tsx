import { SITE_NAME } from "@/lib/site";
import type { Metadata } from "next";

import { EditorialNotice } from "@/components/site/editorial-notice";
import { StaticPage } from "@/components/site/static-page";

export const metadata: Metadata = {
  title: `About — ${SITE_NAME}`,
  description: "Who we are, what we cover, and how we are funded.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <StaticPage
      title="About us"
      standfirst="General-interest reporting across politics, business, technology, science, health, sport and culture."
    >
      <EditorialNotice>
        The ownership, funding and history described below are placeholders
        written to establish the page structure. They must be replaced with
        accurate facts before launch — an inaccurate About page undermines every
        other trust signal on the site.
      </EditorialNotice>

      <div className="space-y-4 text-body leading-relaxed text-ink">
        <p>
          {SITE_NAME} reports on public life: government and policy, companies
          and markets, research and health, sport, and the arts. We publish
          original reporting, we curate and credit work done by others, and we
          carry licensed wire copy — and we tell you which is which on every
          article.
        </p>
        <p>
          Every story is reviewed by a person before it is published. We use
          software to help editors — suggesting tags, drafting summaries for the
          review queue — but nothing reaches a reader without an editor
          deciding it should.
        </p>

        <h2 className="mt-8 text-section text-ink">How we are funded</h2>
        <p>
          [Placeholder: describe revenue sources, ownership structure, and any
          commercial relationships that could bear on coverage.]
        </p>

        <h2 className="mt-8 text-section text-ink">Contact</h2>
        <p>
          [Placeholder: newsroom contact address, postal address, and the route
          for legal correspondence.]
        </p>
      </div>
    </StaticPage>
  );
}

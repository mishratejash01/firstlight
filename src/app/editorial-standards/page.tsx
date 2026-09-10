import Link from "next/link";

import { SITE_NAME } from "@/lib/site";
import type { Metadata } from "next";

import { EditorialNotice } from "@/components/site/editorial-notice";
import { StaticPage } from "@/components/site/static-page";

export const metadata: Metadata = {
  title: `Editorial standards — ${SITE_NAME}`,
  description: "How we source, verify, review and label what we publish.",
  alternates: { canonical: "/editorial-standards" },
};

export default function EditorialStandardsPage() {
  return (
    <StaticPage
      title="Editorial standards"
      standfirst="How we source, verify, review and label what we publish."
    >
      <EditorialNotice>
        This page has been updated to describe autonomous AI publishing, which
        is now part of how this site operates. The description is accurate as
        built. Whether you want to disclose it in these terms — and what your
        obligations are where readers are — needs a decision from you and, given
        it concerns published accuracy, likely legal advice. The complaints
        route and the named accountable editor are still placeholders.
      </EditorialNotice>

      <div className="space-y-4 text-body leading-relaxed text-ink">
        <h2 className="text-section text-ink">Human review</h2>
        <p>
          Reporting filed by our journalists, licensed wire copy and curated
          summaries all enter the same review queue and are published by a named
          editor. Contributors and the wire ingestion worker cannot move a story
          into a published state; that is enforced by the database, not by
          convention.
        </p>

        <h2 className="mt-8 text-section text-ink">How we use software</h2>
        <p>
          We use automated systems to find developing stories across search,
          social and news sources, and to draft coverage from what other outlets
          have reported. Some articles are produced this way and published
          without individual review. Every automatically produced article is
          written from named sources, attributes its claims to them in the text,
          and records which statements could not be verified against a source.
        </p>
        <p>
          If you find an error in any article, tell us and we will correct it
          under the same{" "}
          <Link href="/corrections" className="text-accent underline underline-offset-4">
            corrections policy
          </Link>{" "}
          as anything else we publish.
        </p>

        <h2 className="mt-8 text-section text-ink">Sourcing and attribution</h2>
        <p>
          Where we summarise reporting done by another organisation, we publish a
          short original summary and link to the original. We do not reproduce
          another outlet&rsquo;s article in full. Where we carry licensed wire
          copy, we credit the wire service, and we only reproduce full text where
          the licence permits it.
        </p>

        <h2 className="mt-8 text-section text-ink">Independence</h2>
        <p>
          [Placeholder: state the separation between commercial and editorial
          decisions, and how conflicts of interest are declared and handled.]
        </p>

        <h2 className="mt-8 text-section text-ink">Complaints</h2>
        <p>
          [Placeholder: name the editor responsible for complaints, give the
          contact route, and state the response time you commit to.]
        </p>
      </div>
    </StaticPage>
  );
}

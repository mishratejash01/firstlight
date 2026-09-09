import type { Metadata } from "next";

import { EditorialNotice } from "@/components/site/editorial-notice";
import { StaticPage } from "@/components/site/static-page";

export const metadata: Metadata = {
  title: "Editorial standards — Newswebsite",
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
        These standards describe how the platform is actually built — the
        human-review requirement and the content labelling are enforced in the
        database, not merely promised here. The complaints route and the named
        accountable editor still need to be filled in before launch.
      </EditorialNotice>

      <div className="space-y-4 text-body leading-relaxed text-ink">
        <h2 className="text-section text-ink">Human review</h2>
        <p>
          Nothing publishes automatically. Every article — original reporting,
          licensed wire copy, or a curated summary — enters the same review queue
          and is published by a named editor. This is enforced by the system:
          contributors and automated ingestion literally cannot move a story into
          a published state.
        </p>

        <h2 className="mt-8 text-section text-ink">How we use software</h2>
        <p>
          We use AI tools inside the newsroom to suggest topic tags, draft
          summaries for editors reading the queue, and help structure drafts.
          These tools produce drafts for people to accept, amend or reject. They
          do not publish, and articles they have touched carry that fact in our
          records.
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

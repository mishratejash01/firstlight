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

        <h2 className="mt-8 text-section text-ink">Articles written by AI</h2>
        <p>
          Some articles on this site are written by a language model and
          published automatically, without an editor reading them first. Every
          such article says so, on the article itself.
        </p>
        <p>
          You should know what that means. The model has no reporter, no
          documents and no way to check anything: it writes from patterns in
          text it was trained on. It is required to record every statement it
          could not verify, and the count is shown in the disclosure on each
          article. Names, figures, dates and quotations in these pieces may be
          wrong.
        </p>
        <p>
          Where we use AI to assist a human — suggesting tags, drafting a
          summary for the queue, structuring a draft an editor then works on —
          the article is reviewed before publication and the disclosure says so.
        </p>
        <p>
          If you find an error in an AI-written article, tell us and we will
          correct it under the same{" "}
          <a href="/corrections" className="text-accent underline underline-offset-4">
            corrections policy
          </a>{" "}
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

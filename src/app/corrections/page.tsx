import type { Metadata } from "next";

import { EditorialNotice } from "@/components/site/editorial-notice";
import { StaticPage } from "@/components/site/static-page";

export const metadata: Metadata = {
  title: "Corrections policy — Newswebsite",
  description: "How we handle errors, and how to tell us about one.",
  alternates: { canonical: "/corrections" },
};

export default function CorrectionsPage() {
  return (
    <StaticPage
      title="Corrections policy"
      standfirst="How we handle errors, and how to tell us about one."
    >
      <EditorialNotice>
        The process described is real — every change to a published article is
        recorded automatically and cannot be edited away. The contact route and
        the response commitment are placeholders and must be set before launch.
      </EditorialNotice>

      <div className="space-y-4 text-body leading-relaxed text-ink">
        <h2 className="text-section text-ink">What we correct</h2>
        <p>
          Any factual error, however small. A misspelled name is a correction. So
          is a wrong figure, a misattributed quote, or a caption that describes
          the wrong thing.
        </p>

        <h2 className="mt-8 text-section text-ink">How changes are recorded</h2>
        <p>
          Every edit to an article creates a permanent version record capturing
          what changed, who changed it and when. That record is written by the
          database itself rather than by the editing tool, so it cannot be
          bypassed, altered or deleted from the newsroom interface — not by a
          journalist, not by an editor, not by an administrator.
        </p>

        <h2 className="mt-8 text-section text-ink">
          Substantive versus minor changes
        </h2>
        <p>
          Where a correction changes the meaning of a story, we say so on the
          article. Typographical fixes that do not alter meaning are made
          silently but are still recorded in the version history.
        </p>

        <h2 className="mt-8 text-section text-ink">Telling us about an error</h2>
        <p>
          [Placeholder: corrections contact address, what to include, and the
          time within which you commit to responding.]
        </p>
      </div>
    </StaticPage>
  );
}

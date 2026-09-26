import Link from "next/link";
import type { Metadata } from "next";

import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { PUBLISHER } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Corrections policy",
  description: "How we handle errors, how changes are recorded, and how to tell us about one.",
  path: "/corrections",
});

const link = "text-accent underline underline-offset-4";

export default function CorrectionsPage() {
  const reportTo = PUBLISHER.email || PUBLISHER.grievanceOfficer.email;

  return (
    <StaticPage
      title="Corrections policy"
      standfirst="How we handle errors, and how to tell us about one."
    >
      <div className="space-y-4 text-body leading-relaxed text-ink">
        <h2 className="text-section text-ink">What we correct</h2>
        <p>
          Any factual error, however small. A misspelled name is a correction. So
          is a wrong figure, a misattributed quote, or a caption that describes
          the wrong thing.
        </p>

        <h2 className="mt-8 text-section text-ink">How we correct</h2>
        <p>
          We fix the error in the story itself, so that nobody reading it later
          meets the mistake. A story whose text has changed since publication
          shows when it was last updated.
        </p>

        <h2 className="mt-8 text-section text-ink">How changes are recorded</h2>
        <p>
          Every edit to a published story creates a permanent version record of
          what changed and when. The record is written by the database itself
          rather than by the editing tool, so it cannot be bypassed, altered or
          deleted from the newsroom&rsquo;s own software.
        </p>

        {reportTo ? (
          <>
            <h2 className="mt-8 text-section text-ink">
              Telling us about an error
            </h2>
            <p>
              Write to {reportTo} with the address of the story and what you
              believe is wrong. If you can, tell us where the correct
              information can be found.
              {PUBLISHER.grievanceOfficer.name ? (
                <>
                  {" "}Formal complaints about our content are handled by our
                  grievance officer, whose details are on the{" "}
                  <Link href="/contact" className={link}>
                    contact page
                  </Link>
                  .
                </>
              ) : null}
            </p>
          </>
        ) : null}
      </div>
    </StaticPage>
  );
}

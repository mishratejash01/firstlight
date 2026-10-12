import Link from "next/link";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import { GrievanceOfficer } from "@/components/site/grievance-officer";
import {
  DOCUMENTS_UPDATED,
  LegalDocument,
  clauseLink as link,
} from "@/components/site/legal-document";
import { pageMetadata } from "@/lib/seo/metadata";
import { PUBLISHER } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Corrections policy",
  description: "How we handle errors, how changes are recorded, and how to tell us about one.",
  path: "/corrections",
});

export default function CorrectionsPage() {
  // Errors go to the editor, who can fix them; the general inbox only when
  // there is no editor's address to send them to.
  const reportTo = PUBLISHER.editor.email || PUBLISHER.email;
  const officer = PUBLISHER.grievanceOfficer;

  return (
    <LegalDocument
      title="Corrections policy"
      standfirst="How we handle errors, and how to tell us about one."
      lastUpdated={DOCUMENTS_UPDATED}
      sections={[
        {
          id: "what-we-correct",
          title: "What we correct",
          items: [
            <>
              Any factual error, however small. A misspelled name is a
              correction. So is a wrong figure, a misattributed quote, or a
              caption that describes the wrong thing.
            </>,
          ],
        },
        {
          id: "how-we-correct",
          join: true,
          title: "How we correct",
          items: [
            <>
              We fix the error in the story itself, so that nobody reading it
              later meets the mistake.
            </>,
            <>
              A story whose text has changed since publication shows when it
              was last updated.
            </>,
          ],
        },
        {
          id: "record",
          join: true,
          title: "How changes are recorded",
          items: [
            <>
              Every edit to a published story creates a permanent version
              record of what changed and when.
            </>,
            <>
              The record is written by the database itself rather than by the
              editing tool, so it cannot be bypassed, altered or deleted from
              the newsroom&rsquo;s own software.
            </>,
          ],
        },
        {
          id: "report",
          join: true,
          title: "Telling us about an error",
          items: [
            reportTo ? (
              <>
                Write to <EmailLink address={reportTo} /> with the address of
                the story and what you believe is wrong. If you can, tell us
                where the correct information can be found.
              </>
            ) : null,
            reportTo && (officer.name || officer.email) ? (
              <>
                To make a formal complaint about our content, write to{" "}
                <GrievanceOfficer />. How complaints are handled is set out on
                our{" "}
                <Link href="/contact#grievance" className={link}>
                  contact page
                </Link>
                .
              </>
            ) : null,
          ],
        },
        {
          id: "replies",
          title: "Replies and removal",
          items: [
            <>
              A person or organisation that a story makes an allegation against
              may send a reply, and we consider every reply for publication.
              Removal of published material is dealt with on our{" "}
              <Link href="/about#corrections" className={link}>
                About page
              </Link>
              .
            </>,
          ],
        },
      ]}
    />
  );
}

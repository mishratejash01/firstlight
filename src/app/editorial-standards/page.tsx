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
import { PUBLISHER, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Editorial standards",
  description: "How we source, verify, attribute, illustrate and correct what we publish.",
  path: "/editorial-standards",
});

/**
 * The rules the newsroom works to. Every statement here describes how the site
 * actually behaves; where a rule is enforced in code, the thresholds quoted
 * are the ones configured.
 */
export default function EditorialStandardsPage() {
  const editor = PUBLISHER.editor;
  const officer = PUBLISHER.grievanceOfficer;

  return (
    <LegalDocument
      title="Editorial standards"
      standfirst="How we source, verify, attribute, illustrate and correct what we publish."
      lastUpdated={DOCUMENTS_UPDATED}
      sections={[
        {
          id: "sourcing",
          join: true,
          title: "Sourcing and attribution",
          items: [
            <>
              We report from the documents, statements, data and published
              reports behind each story, and we attribute every fact to the
              person, organisation or document it comes from.
            </>,
            <>
              Where our reporting draws on another publication&rsquo;s work, we
              say so and we write our own account; we do not reproduce another
              outlet&rsquo;s article.
            </>,
          ],
        },
        {
          id: "verification",
          join: true,
          title: "Verification",
          items: [
            <>
              A story&rsquo;s central claims are checked against independent
              sources before it is published, and the more serious the claim,
              the more sources it needs.
            </>,
            <>
              Deaths, injuries, crimes, allegations against named people and
              market-moving figures need at least three independent sources.
              Policy, disputes, significant sums of money and court cases need
              at least two.
            </>,
            <>
              A serious claim that one of our sources contradicts is not
              published as fact.
            </>,
          ],
        },
        {
          id: "timeliness",
          join: true,
          title: "Timeliness",
          items: [
            <>
              We publish news while it is news: we do not publish a news report
              whose newest source is more than a day old.
            </>,
            <>
              Every story shows when it was published and, if its text has
              changed since, when it was last updated.
            </>,
          ],
        },
        {
          id: "bylines",
          join: true,
          title: "Bylines",
          items: [
            <>
              Stories written by a named journalist carry that
              journalist&rsquo;s name, linked to a page about them.
            </>,
            <>
              Stories produced by the newsroom as a whole are published under
              the name of {SITE_NAME}. We never publish under an invented name.
            </>,
          ],
        },
        {
          id: "pictures",
          join: true,
          title: "Pictures",
          items: [
            <>
              We publish photographs only where their licence allows it, and we
              credit the photographer or the source.
            </>,
            <>
              Where no suitable photograph exists we use a plain typographic
              card rather than an image that could be mistaken for a picture of
              the event. We do not publish synthetic images presented as
              photographs.
            </>,
          ],
        },
        {
          id: "labels",
          title: "News, analysis and opinion",
          items: [
            <>
              Opinion appears only in the Opinion section and is labelled as
              such. Everything else we publish is news reporting or
              explanation.
            </>,
          ],
        },
        {
          id: "law",
          title: "Legal limits",
          items: [
            <>
              We report crime and the courts on the presumption of innocence,
              we do not identify victims of sexual offences or children the law
              protects, and we attribute every claim made in armed conflict.
              The law behind each of these rules is set out on our{" "}
              <Link href="/about#crime-and-courts" className={link}>
                About page
              </Link>
              .
            </>,
          ],
        },
        {
          id: "corrections",
          join: true,
          title: "Corrections",
          items: [
            <>
              We correct errors in the story itself, and every change to a
              published story is kept in a permanent version history.
            </>,
            editor.email ? (
              <>
                To tell us about an error, write to{" "}
                <EmailLink address={editor.email} />; our{" "}
                <Link href="/corrections" className={link}>
                  corrections policy
                </Link>{" "}
                sets out what happens next.
              </>
            ) : (
              <>
                How to tell us about an error is set out in our{" "}
                <Link href="/corrections" className={link}>
                  corrections policy
                </Link>
                .
              </>
            ),
          ],
        },
        {
          id: "complaints",
          title: "Complaints",
          items: [
            officer.name || officer.email ? (
              <>
                If you believe something we have published breaks these
                standards, you can complain to <GrievanceOfficer />. We
                acknowledge every complaint within 24 hours and send a decision
                within 15 days.
              </>
            ) : null,
          ],
        },
        {
          id: "responsibility",
          title: "Responsibility",
          items: [
            editor.name || editor.email ? (
              <>
                {editor.name
                  ? `${editor.name}${editor.title ? `, ${editor.title},` : ""}`
                  : "Our editor"}{" "}
                is responsible for everything {SITE_NAME} publishes
                {editor.email ? (
                  <>
                    , and can be reached at <EmailLink address={editor.email} />
                  </>
                ) : null}
                .
              </>
            ) : null,
          ],
        },
      ]}
    />
  );
}

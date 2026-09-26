import Link from "next/link";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import { GrievanceOfficer } from "@/components/site/grievance-officer";
import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { PUBLISHER, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Editorial standards",
  description: "How we source, verify, attribute, illustrate and correct what we publish.",
  path: "/editorial-standards",
});

const link = "text-accent underline underline-offset-4";

/**
 * The rules the newsroom works to. Every statement here describes how the site
 * actually behaves; where a rule is enforced in code, the thresholds quoted
 * are the ones configured.
 */
export default function EditorialStandardsPage() {
  return (
    <StaticPage
      title="Editorial standards"
      standfirst="How we source, verify, attribute, illustrate and correct what we publish."
    >
      <div className="space-y-4 text-body leading-relaxed text-ink">
        <h2 id="sourcing" className="text-section text-ink">
          Sourcing and attribution
        </h2>
        <p>
          We report from the documents, statements, data and published reports
          behind each story, and we attribute every fact to the person,
          organisation or document it comes from. Where our reporting draws on
          another publication&rsquo;s work, we say so and we write our own
          account; we do not reproduce another outlet&rsquo;s article.
        </p>

        <h2 id="verification" className="mt-8 text-section text-ink">
          Verification
        </h2>
        <p>
          A story&rsquo;s central claims are checked against independent sources
          before it is published, and the more serious the claim, the more
          sources it needs. Deaths, injuries, crimes, allegations against named
          people and market-moving figures need at least three independent
          sources. Policy, disputes, significant sums of money and court cases
          need at least two. A serious claim that one of our sources
          contradicts is not published as fact.
        </p>

        <h2 id="timeliness" className="mt-8 text-section text-ink">
          Timeliness
        </h2>
        <p>
          We publish news while it is news: we do not publish a news report
          whose newest source is more than a day old. Every story shows when it
          was published and, if its text has changed since, when it was last
          updated.
        </p>

        <h2 id="bylines" className="mt-8 text-section text-ink">
          Bylines
        </h2>
        <p>
          Stories written by a named journalist carry that journalist&rsquo;s
          name, linked to a page about them. Stories produced by the newsroom as
          a whole are published under the name of {SITE_NAME}. We never publish
          under an invented name.
        </p>

        <h2 id="pictures" className="mt-8 text-section text-ink">
          Pictures
        </h2>
        <p>
          We publish photographs only where their licence allows it, and we
          credit the photographer or the source. Where no suitable photograph
          exists we use a plain typographic card rather than an image that
          could be mistaken for a picture of the event. We do not publish
          synthetic images presented as photographs.
        </p>

        <h2 id="labels" className="mt-8 text-section text-ink">
          News, analysis and opinion
        </h2>
        <p>
          Opinion appears only in the Opinion section and is labelled as such.
          Everything else we publish is news reporting or explanation.
        </p>

        <h2 id="corrections" className="mt-8 text-section text-ink">
          Corrections
        </h2>
        <p>
          We correct errors in the story itself, and every change to a
          published story is kept in a permanent version history.{" "}
          {PUBLISHER.editor.email ? (
            <>
              To tell us about an error, write to{" "}
              <EmailLink address={PUBLISHER.editor.email} />; our{" "}
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
          )}
        </p>

        {PUBLISHER.grievanceOfficer.name || PUBLISHER.grievanceOfficer.email ? (
          <>
            <h2 id="complaints" className="mt-8 text-section text-ink">
              Complaints
            </h2>
            <p>
              If you believe something we have published breaks these
              standards, you can complain to <GrievanceOfficer />. We
              acknowledge every complaint within 24 hours and send a decision
              within 15 days.
            </p>
          </>
        ) : null}

        {PUBLISHER.editor.name || PUBLISHER.editor.email ? (
          <>
            <h2 id="responsibility" className="mt-8 text-section text-ink">
              Responsibility
            </h2>
            <p>
              {PUBLISHER.editor.name
                ? `${PUBLISHER.editor.name}${PUBLISHER.editor.title ? `, ${PUBLISHER.editor.title},` : ""}`
                : "Our editor"}{" "}
              is responsible for everything {SITE_NAME} publishes
              {PUBLISHER.editor.email ? (
                <>
                  , and can be reached at{" "}
                  <EmailLink address={PUBLISHER.editor.email} />
                </>
              ) : null}
              .
            </p>
          </>
        ) : null}
      </div>
    </StaticPage>
  );
}

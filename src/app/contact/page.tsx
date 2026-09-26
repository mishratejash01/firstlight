import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import { GrievanceOfficer } from "@/components/site/grievance-officer";
import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { HAS_CONTACT_PAGE, PUBLISHER, SITE_NAME } from "@/lib/site";

/**
 * How to reach the paper, and the grievance route India's IT (Intermediary
 * Guidelines and Digital Media Ethics Code) Rules, 2021 ask a digital news
 * publisher to publish: a grievance officer based in India, acknowledgement
 * within 24 hours and a decision within 15 days (rules 10 and 11).
 *
 * One section per mailbox, so a reader writes straight to the people who can
 * act on what they send. The sections carry ids because the footer and other
 * pages link to them directly (#newsroom, #advertising, #grievance).
 *
 * Built only from the facts in PUBLISHER: a section whose address is not set
 * is left out, and with nothing set there is no page at all, rather than a
 * page of blanks.
 */

const link = "text-accent underline underline-offset-4";

// Which section comes first depends on what is set, so every heading carries
// the space above it except whichever one opens the page.
const heading = "mt-8 text-section text-ink first:mt-0";

export function generateMetadata(): Metadata {
  if (!HAS_CONTACT_PAGE) return { title: "Not found" };
  return pageMetadata({
    title: "Contact",
    description: `How to reach ${SITE_NAME}: news tips, corrections, advertising and partnerships, and complaints to our grievance officer.`,
    path: "/contact",
  });
}

export default function ContactPage() {
  if (!HAS_CONTACT_PAGE) notFound();

  const officer = PUBLISHER.grievanceOfficer;

  return (
    <StaticPage
      title="Contact"
      standfirst={`How to reach ${SITE_NAME}, and how to raise a complaint about what we publish.`}
    >
      <div className="space-y-4 text-body leading-relaxed text-ink">
        {PUBLISHER.newsroomEmail ? (
          <>
            <h2 id="newsroom" className={heading}>
              News tips and press releases
            </h2>
            <p>
              If you know something we should be reporting, or have a press
              release or an invitation for the news desk, write to{" "}
              <EmailLink address={PUBLISHER.newsroomEmail} />. Tell us how we
              can reach you, and attach any documents you are able to share.
            </p>
          </>
        ) : null}

        {PUBLISHER.editor.email ? (
          <>
            <h2 id="editor" className={heading}>
              Corrections and the editor
            </h2>
            <p>
              To report an error in a story, respond to something we have
              published or pitch an opinion piece, write to the editor at{" "}
              <EmailLink address={PUBLISHER.editor.email} />. When reporting an
              error, include the address of the story and what you believe is
              wrong. Our{" "}
              <Link href="/corrections" className={link}>
                corrections policy
              </Link>{" "}
              explains what happens next.
            </p>
          </>
        ) : null}

        {PUBLISHER.partnershipsEmail ? (
          <>
            <h2 id="advertising" className={heading}>
              Advertising and partnerships
            </h2>
            <p>
              For advertising, sponsorship, syndication of our reporting and
              other partnerships, write to{" "}
              <EmailLink address={PUBLISHER.partnershipsEmail} />.
            </p>
          </>
        ) : null}

        {PUBLISHER.email || PUBLISHER.phone ? (
          <>
            <h2 id="general" className={heading}>
              General enquiries
            </h2>
            <p>
              For questions about the site or your account, jobs, or anything
              else,{" "}
              {PUBLISHER.email ? (
                <>
                  write to <EmailLink address={PUBLISHER.email} />
                </>
              ) : null}
              {PUBLISHER.email && PUBLISHER.phone ? " or " : null}
              {PUBLISHER.phone ? `call ${PUBLISHER.phone}` : null}.
            </p>
          </>
        ) : null}

        {PUBLISHER.legalName || PUBLISHER.address ? (
          <>
            <h2 id="address" className={heading}>
              Postal address
            </h2>
            <p>
              {[PUBLISHER.legalName, PUBLISHER.address].filter(Boolean).join(", ")}
            </p>
          </>
        ) : null}

        {officer.name || officer.email || officer.phone ? (
          <>
            <h2 id="grievance" className={heading}>
              Grievance officer
            </h2>
            <p>
              Complaints about our content go to <GrievanceOfficer />
              {officer.phone ? `, or by telephone to ${officer.phone}` : ""}.
            </p>
            <p>
              We acknowledge every complaint within 24 hours of receiving it and
              send a decision within 15 days. Please include the address of the
              story concerned and what you believe is wrong with it.
            </p>
            {officer.email ? (
              <p>
                The same address takes requests about your personal data, such
                as a copy of what we hold about your account, a correction to
                it, or its deletion. Our{" "}
                <Link href="/privacy" className={link}>
                  privacy page
                </Link>{" "}
                explains what we hold.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </StaticPage>
  );
}

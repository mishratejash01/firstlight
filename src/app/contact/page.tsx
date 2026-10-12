import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import { GrievanceOfficer } from "@/components/site/grievance-officer";
import {
  DOCUMENTS_UPDATED,
  LegalDocument,
  clauseLink as link,
} from "@/components/site/legal-document";
import { pageMetadata } from "@/lib/seo/metadata";
import { HAS_CONTACT_PAGE, PUBLISHER, SITE_NAME } from "@/lib/site";

/**
 * How to reach the paper, and the grievance route India's IT (Intermediary
 * Guidelines and Digital Media Ethics Code) Rules, 2021 ask a digital news
 * publisher to publish: a grievance officer based in India, acknowledgement
 * within 24 hours and a decision within 15 days (rules 10 and 11).
 *
 * One clause per mailbox, so a reader writes straight to the people who can
 * act on what they send. The clauses keep their ids because the footer and
 * other pages link to them directly (#newsroom, #advertising, #grievance).
 *
 * Built only from the facts in PUBLISHER: a clause whose address is not set
 * is left out, and with nothing set there is no page at all, rather than a
 * page of blanks.
 */

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
  const hasOfficer = Boolean(officer.name || officer.email || officer.phone);

  return (
    <LegalDocument
      title="Contact"
      standfirst={`How to reach ${SITE_NAME}, and how to raise a complaint about what we publish.`}
      lastUpdated={DOCUMENTS_UPDATED}
      sections={[
        {
          id: "newsroom",
          join: true,
          title: "News tips and press releases",
          items: [
            PUBLISHER.newsroomEmail ? (
              <>
                If you know something we should be reporting, or have a press
                release or an invitation for the news desk, write to{" "}
                <EmailLink address={PUBLISHER.newsroomEmail} />. Tell us how we
                can reach you, and attach any documents you are able to share.
              </>
            ) : null,
            PUBLISHER.newsroomEmail ? (
              <>
                Tell us if you wish to remain anonymous. How we treat what you
                send is set out in our{" "}
                <Link href="/terms#sending-us-material" className={link}>
                  terms of use
                </Link>
                .
              </>
            ) : null,
          ],
        },
        {
          id: "editor",
          join: true,
          title: "Corrections and the editor",
          items: [
            PUBLISHER.editor.email ? (
              <>
                To report an error in a story, respond to something we have
                published or pitch an opinion piece, write to the editor at{" "}
                <EmailLink address={PUBLISHER.editor.email} />.
              </>
            ) : null,
            PUBLISHER.editor.email ? (
              <>
                When reporting an error, include the address of the story and
                what you believe is wrong. Our{" "}
                <Link href="/corrections" className={link}>
                  corrections policy
                </Link>{" "}
                explains what happens next.
              </>
            ) : null,
          ],
        },
        {
          id: "advertising",
          title: "Advertising and partnerships",
          items: [
            PUBLISHER.partnershipsEmail ? (
              <>
                For advertising, sponsorship, syndication of our reporting and
                other partnerships, including permission to republish our
                stories, write to{" "}
                <EmailLink address={PUBLISHER.partnershipsEmail} />.
              </>
            ) : null,
          ],
        },
        {
          id: "general",
          title: "General enquiries",
          items: [
            PUBLISHER.email || PUBLISHER.phone ? (
              <>
                For questions about the site or your account, jobs, or anything
                else,{" "}
                {PUBLISHER.email ? (
                  <>
                    write to <EmailLink address={PUBLISHER.email} />
                  </>
                ) : null}
                {PUBLISHER.email && PUBLISHER.phone ? " or " : null}
                {PUBLISHER.phone ? `call ${PUBLISHER.phone}` : null}.
              </>
            ) : null,
          ],
        },
        {
          id: "address",
          title: "Postal address",
          items: [
            PUBLISHER.legalName || PUBLISHER.address ? (
              <>{[PUBLISHER.legalName, PUBLISHER.address].filter(Boolean).join(", ")}</>
            ) : null,
          ],
        },
        {
          id: "grievance",
          join: true,
          title: "Grievance officer",
          items: [
            hasOfficer ? (
              <>
                Complaints about our content go to <GrievanceOfficer />
                {officer.phone ? `, or by telephone to ${officer.phone}` : ""}.
              </>
            ) : null,
            hasOfficer ? (
              <>
                We acknowledge every complaint within 24 hours of receiving it
                and send a decision within 15 days. Please include the address
                of the story concerned and what you believe is wrong with it.
              </>
            ) : null,
            officer.email ? (
              <>
                The same address takes requests about your personal data, such
                as a copy of what we hold about your account, a correction to
                it, or its deletion. Our{" "}
                <Link href="/privacy" className={link}>
                  privacy page
                </Link>{" "}
                explains what we hold.
              </>
            ) : null,
          ],
        },
      ]}
    />
  );
}

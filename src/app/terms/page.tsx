import Link from "next/link";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import { GrievanceOfficer } from "@/components/site/grievance-officer";
import {
  DOCUMENTS_UPDATED,
  LegalDocument,
  Lead,
  clauseLink as link,
} from "@/components/site/legal-document";
import { pageMetadata } from "@/lib/seo/metadata";
import { HAS_CONTACT_PAGE, PUBLISHER, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Terms of use",
  description: `The conditions on which ${SITE_NAME} is offered: using and quoting our reporting, accounts, the morning briefing, liability, complaints and governing law.`,
  path: "/terms",
});

/**
 * The terms on which the site is offered to readers.
 *
 * Like the About page, it may not promise more than the site does: the
 * account clause describes the Google sign-in the site actually has, and the
 * briefing clause gives the way out that exists (writing to us) rather than an
 * unsubscribe link the emails may not carry. Details the owner has not supplied
 * (the legal entity, its address) are left out until they are set.
 *
 * Written as the owner's standing conditions, not as legal advice; it should
 * be read by the paper's own counsel before it is relied on.
 */
export default function TermsPage() {
  const party = PUBLISHER.legalName
    ? `${PUBLISHER.legalName}, the publisher of ${SITE_NAME}`
    : SITE_NAME;
  const officer = PUBLISHER.grievanceOfficer;

  return (
    <LegalDocument
      title="Terms of use"
      standfirst={`The conditions on which ${SITE_NAME} is offered to you, and what you may do with what we publish.`}
      lastUpdated={DOCUMENTS_UPDATED}
      sections={[
        {
          id: "agreement",
          join: true,
          title: "These terms",
          items: [
            <>
              These terms govern your use of {SITE_NAME}, its pages, feeds,
              newsletters and accounts (together, the site). They are an
              agreement between you and {party} (&ldquo;we&rdquo;,
              &ldquo;us&rdquo;).
            </>,
            <>
              By using the site you accept these terms. If you do not accept
              them, please do not use the site. Our{" "}
              <Link href="/privacy" className={link}>
                privacy page
              </Link>{" "}
              explains what we record about how the site is used, and forms part
              of these terms.
            </>,
            <>
              We may revise these terms. The date at the top of this page shows
              when they last changed; using the site after a revision means you
              accept the revised terms.
            </>,
          ],
        },
        {
          id: "our-content",
          title: "Using our reporting",
          items: [
            <>
              The text, headlines, graphics and layout of the site are our
              copyright, or that of the people who licensed them to us, under
              the Copyright Act, 1957 and the international conventions India
              is party to. Nothing in these terms transfers any of those rights
              to you.
            </>,
            <>
              You may read the site, share links to it, and quote short
              passages from our stories in your own work, provided you name{" "}
              {SITE_NAME} as the source and link to the story.
            </>,
            <>
              You may not, without our written permission, republish, sell,
              syndicate or frame whole stories or substantial parts of them;
              remove or alter a byline, credit or copyright notice; or present
              our reporting as your own.
              {PUBLISHER.partnershipsEmail ? (
                <>
                  {" "}Requests for permission go to{" "}
                  <EmailLink address={PUBLISHER.partnershipsEmail} />.
                </>
              ) : null}
            </>,
            <>
              Our feeds are offered for reading in a feed reader and for linking
              to our stories. Using them to republish our stories in full
              requires our written permission like any other republication.
            </>,
          ],
        },
        {
          id: "pictures",
          join: true,
          title: "Pictures and other material",
          items: [
            <>
              Photographs and other material we publish under licence belong to
              their owners. The credit beside each one names the owner and, where
              there is one, the licence; any reuse is governed by that licence,
              not by these terms.
            </>,
            <>
              Embedded videos are provided by their own platforms, under those
              platforms&rsquo; terms.
            </>,
          ],
        },
        {
          id: "accounts",
          join: true,
          title: "Accounts",
          items: [
            <>
              You can sign in with a Google account. Your account holds the
              topics and writers you follow and the newsletters you subscribe
              to. You are responsible for what is done through it.
            </>,
            <>
              We may suspend or close an account that is used to break these
              terms or the law. You may close your account at any time, as set
              out on the{" "}
              <Link href="/privacy" className={link}>
                privacy page
              </Link>
              .
            </>,
          ],
        },
        {
          id: "briefing",
          join: true,
          title: "The morning briefing",
          items: [
            <>
              The morning briefing is a free email of the day&rsquo;s reporting.
              Signing up asks you to confirm your address before anything is
              sent to it.
            </>,
            PUBLISHER.email ? (
              <>
                To stop receiving it, write to{" "}
                <EmailLink address={PUBLISHER.email} /> from the address it is
                sent to.
              </>
            ) : null,
          ],
        },
        {
          id: "sending-us-material",
          join: true,
          title: "Sending us material",
          items: [
            <>
              When you send us a news tip, document, photograph, letter or
              reply, you confirm that you are entitled to send it, and you allow
              us to use, edit and publish it, in whole or in part, in our
              reporting, with credit where you ask for it.
            </>,
            <>
              Tell us if you wish to remain anonymous. We will not publish your
              identity without your agreement unless the law requires us to
              disclose it.
            </>,
          ],
        },
        {
          id: "conduct",
          join: true,
          title: "Acceptable use",
          items: [
            <>
              You must not use the site for anything unlawful, or to defame,
              harass or impersonate anyone.
            </>,
            <>
              You must not interfere with the site or its security: no attempts
              to gain access to parts of it you are not authorised to use, no
              introduction of malicious code, and no automated access at a rate
              that degrades the site for other readers. Unauthorised access to
              a computer resource is an offence under sections 43 and 66 of the
              Information Technology Act, 2000.
            </>,
          ],
        },
        {
          id: "accuracy",
          title: "Reliance on what we publish",
          items: [
            <>
              We work to the standards set out in our{" "}
              <Link href="/editorial-standards" className={link}>
                editorial standards
              </Link>{" "}
              and correct our errors as our{" "}
              <Link href="/corrections" className={link}>
                corrections policy
              </Link>{" "}
              describes. News is reported as events unfold, and a report can be
              overtaken by later facts.
            </>,
            <>
              What we publish is news and comment for general information, not
              legal, financial, investment, medical or other professional
              advice. Do not make decisions on the strength of it without
              taking advice of that kind.
            </>,
            <>
              Links to other websites are given so that readers can see our
              sources. We do not control those sites and are not responsible
              for what they contain.
            </>,
          ],
        },
        {
          id: "liability",
          join: true,
          title: "Liability",
          items: [
            <>
              The site is provided as it is and as it is available. We do not
              promise that it will always be available or free of errors.
            </>,
            <>
              To the extent the law allows, we are not liable for any indirect
              or consequential loss, or for loss of profit, business or data,
              arising from your use of the site or your reliance on anything
              published on it.
            </>,
            <>
              Nothing in these terms limits any liability that cannot lawfully
              be limited, or any right you have that cannot be excluded by
              agreement.
            </>,
          ],
        },
        {
          id: "complaints",
          join: true,
          title: "Complaints",
          items: [
            officer.name || officer.email ? (
              <>
                <Lead>Grievance officer.</Lead>Complaints about our content go
                to <GrievanceOfficer />. We acknowledge every complaint within
                24 hours and send a decision within 15 days, as the Information
                Technology (Intermediary Guidelines and Digital Media Ethics
                Code) Rules, 2021 require.
              </>
            ) : null,
            <>
              Errors of fact are handled under our{" "}
              <Link href="/corrections" className={link}>
                corrections policy
              </Link>
              {HAS_CONTACT_PAGE ? (
                <>
                  , and every other way to reach us is on the{" "}
                  <Link href="/contact" className={link}>
                    contact page
                  </Link>
                </>
              ) : null}
              .
            </>,
          ],
        },
        {
          id: "law",
          join: true,
          title: "Governing law and jurisdiction",
          items: [
            <>These terms are governed by the laws of India.</>,
            <>
              {PUBLISHER.address
                ? `Any dispute arising from them or from your use of the site is subject to the jurisdiction of the courts having jurisdiction over our registered office at ${PUBLISHER.address}.`
                : "Any dispute arising from them or from your use of the site is subject to the jurisdiction of the competent courts in India."}
            </>,
            <>
              If a court finds any part of these terms unenforceable, the rest
              continues to apply.
            </>,
          ],
        },
      ]}
    />
  );
}

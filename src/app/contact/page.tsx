import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { PUBLISHER, SITE_NAME } from "@/lib/site";

/**
 * How to reach the paper, and the grievance route India's IT (Intermediary
 * Guidelines and Digital Media Ethics Code) Rules, 2021 ask a digital news
 * publisher to publish: a grievance officer based in India, acknowledgement
 * within 24 hours and a decision within 15 days (rules 10 and 11).
 *
 * Built only from the facts in PUBLISHER. With none of them set there is no
 * page at all, rather than a page of blanks.
 */

function hasContact() {
  return Boolean(PUBLISHER.email || PUBLISHER.phone || PUBLISHER.grievanceOfficer.name);
}

export function generateMetadata(): Metadata {
  if (!hasContact()) return { title: "Not found" };
  return pageMetadata({
    title: "Contact",
    description: `How to reach ${SITE_NAME}, and how to raise a complaint about our content.`,
    path: "/contact",
  });
}

export default function ContactPage() {
  if (!hasContact()) notFound();

  const newsroom = [PUBLISHER.email, PUBLISHER.phone].filter(Boolean);
  const officer = PUBLISHER.grievanceOfficer;
  const officerContact = [officer.email, officer.phone].filter(Boolean);

  return (
    <StaticPage
      title="Contact"
      standfirst={`How to reach ${SITE_NAME}, and how to raise a complaint about what we publish.`}
    >
      <div className="space-y-4 text-body leading-relaxed text-ink">
        {newsroom.length ? (
          <>
            <h2 className="text-section text-ink">The newsroom</h2>
            <p>
              For news tips, corrections and anything else, write to or call{" "}
              {newsroom.join(" or ")}.
            </p>
          </>
        ) : null}

        {PUBLISHER.legalName || PUBLISHER.address ? (
          <>
            <h2 className="mt-8 text-section text-ink">Postal address</h2>
            <p>
              {[PUBLISHER.legalName, PUBLISHER.address].filter(Boolean).join(", ")}
            </p>
          </>
        ) : null}

        {officer.name ? (
          <>
            <h2 id="grievance" className="mt-8 text-section text-ink">
              Grievance officer
            </h2>
            <p>
              Complaints about our content are handled by our grievance officer,{" "}
              {officer.name}
              {officerContact.length ? `, who can be reached at ${officerContact.join(" or ")}` : ""}.
            </p>
            <p>
              We acknowledge every complaint within 24 hours of receiving it and
              send a decision within 15 days. Please include the address of the
              story concerned and what you believe is wrong with it.
            </p>
          </>
        ) : null}
      </div>
    </StaticPage>
  );
}

import Link from "next/link";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { HAS_CONTACT_PAGE, PUBLISHER, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description: `What ${SITE_NAME} covers, how it reports, and who publishes it.`,
  path: "/about",
});

const link = "text-accent underline underline-offset-4";

export default function AboutPage() {
  return (
    <StaticPage
      title={`About ${SITE_NAME}`}
      standfirst="What we cover, how we report, and who we are."
    >
      <div className="space-y-4 text-body leading-relaxed text-ink">
        <p>
          {SITE_NAME} is an English-language news publication covering India
          and the world: politics and government, business and markets,
          technology and science, health and the environment, sport and
          culture. Every section is listed on the{" "}
          <Link href="/sections" className={link}>
            sections page
          </Link>
          .
        </p>

        <h2 className="mt-8 text-section text-ink">How we report</h2>
        <p>
          Our stories are built from the documents, statements and published
          reports behind the news, and they name the people and organisations
          their facts come from. Our rule is that a story&rsquo;s central claims
          are checked against independent sources before it is published: at
          least three for deaths, crimes and allegations against named people,
          and at least two for other significant claims. A story whose sources
          have gone stale is not published as news. The full rules are in our{" "}
          <Link href="/editorial-standards" className={link}>
            editorial standards
          </Link>
          .
        </p>

        <h2 className="mt-8 text-section text-ink">Pictures</h2>
        <p>
          We publish photographs only where their licence allows it, and we
          credit them. Where no suitable photograph exists we use a plain
          typographic card instead of an image that could be mistaken for a
          picture of the event.
        </p>

        <h2 className="mt-8 text-section text-ink">Corrections</h2>
        <p>
          When we get something wrong we correct it in the story, and every
          change to a published story is kept in a permanent version history.
          Our{" "}
          <Link href="/corrections" className={link}>
            corrections policy
          </Link>{" "}
          explains how to tell us about an error.
        </p>

        {PUBLISHER.legalName ? (
          <>
            <h2 className="mt-8 text-section text-ink">
              Who publishes {SITE_NAME}
            </h2>
            <p>
              {SITE_NAME} is published by {PUBLISHER.legalName}
              {PUBLISHER.address ? `, ${PUBLISHER.address}` : ""}.
              {PUBLISHER.foundingYear ? ` It was founded in ${PUBLISHER.foundingYear}.` : ""}
              {PUBLISHER.editor.name
                ? ` ${PUBLISHER.editor.name}${PUBLISHER.editor.title ? `, ${PUBLISHER.editor.title},` : ""} is responsible for what we publish.`
                : ""}
            </p>
          </>
        ) : null}

        {HAS_CONTACT_PAGE ? (
          <>
            <h2 className="mt-8 text-section text-ink">Contact</h2>
            <p>
              {PUBLISHER.email || PUBLISHER.phone ? (
                <>
                  Reach us at{" "}
                  {PUBLISHER.email ? <EmailLink address={PUBLISHER.email} /> : null}
                  {PUBLISHER.email && PUBLISHER.phone ? " or " : null}
                  {PUBLISHER.phone}.{" "}
                </>
              ) : null}
              {PUBLISHER.newsroomEmail ? (
                <>
                  News tips go to <EmailLink address={PUBLISHER.newsroomEmail} />.{" "}
                </>
              ) : null}
              Every way to reach us
              {PUBLISHER.grievanceOfficer.name || PUBLISHER.grievanceOfficer.email
                ? ", including our grievance officer,"
                : ""}{" "}
              is on the{" "}
              <Link href="/contact" className={link}>
                contact page
              </Link>
              .
            </p>
          </>
        ) : null}
      </div>
    </StaticPage>
  );
}

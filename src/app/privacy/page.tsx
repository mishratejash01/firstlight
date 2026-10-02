import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo/metadata";
import { PUBLISHER } from "@/lib/site";

import { EmailLink } from "@/components/site/email-link";
import { GrievanceOfficer } from "@/components/site/grievance-officer";
import { StaticPage } from "@/components/site/static-page";

export const metadata: Metadata = pageMetadata({
  title: "Privacy and tracking",
  description: "What we record about how this site is read, and why.",
  path: "/privacy",
});

export default function PrivacyPage() {
  const officer = PUBLISHER.grievanceOfficer;

  return (
    <StaticPage
      title="Privacy and tracking"
      standfirst="What we record about how this site is read, and why."
    >

      <div className="space-y-4 text-body leading-relaxed text-ink">
        <h2 className="text-section text-ink">What we do not collect</h2>
        <p>
          Our page counts and reading records never contain your IP address or
          your browser&rsquo;s user-agent string. We do not build advertising
          profiles and we do not sell reader data. The companies that host this
          site and run its sign-in do record IP addresses for security.
        </p>

        <h2 className="mt-8 text-section text-ink">
          What every page view records
        </h2>
        <p>
          When a page is served we record that a page was served — the article,
          the time, the coarse device class (phone, tablet or desktop) and the
          site you arrived from, kept as a domain name only, never a full link.
          These records carry no identifier of any kind. They cannot be linked to
          each other, to a session, or to you. They tell us how many people read
          something and nothing about who.
        </p>

        <h2 className="mt-8 text-section text-ink">If you agree</h2>
        <p>
          With your agreement we additionally record how far you scroll, whether
          you finish an article, and which links you follow, tied to a random
          identifier stored in your browser. That identifier is generated only
          once this measurement is on — when you agree, or for readers in India
          as described below — and it is not derived from anything about you or
          your device. We use this to work out which stories lose readers and
          where, which is how we decide what to change.
        </p>
        <p>
          Agreeing also loads Google Analytics, which we use alongside our own
          records for search reporting. If you decline, it is not requested at
          all.
        </p>

        <h2 className="mt-8 text-section text-ink">Readers in India</h2>
        <p>
          If your browser is set to India Standard Time, we take you to be
          reading from India. Until 12 May 2027, the measurement described above,
          Google Analytics included, is on by default for readers in India: a
          notice says so on your first visit, and choosing Turn off in that
          notice, or Decline in Privacy settings, stops it and deletes the
          identifier and the analytics cookies. From 13 May 2027, when the consent rules of India&rsquo;s
          Digital Personal Data Protection Act take effect, readers in India will
          be asked first, as readers everywhere else are now.
        </p>

        <h2 className="mt-8 text-section text-ink">Changing your mind</h2>
        <p>
          Your choice is stored in a cookie on this site and is remembered for
          twelve months, after which we ask again. To change it at any time, use
          Privacy settings at the foot of every page: it asks you again, and
          declining clears the identifier and the analytics cookies.
        </p>

        <h2 className="mt-8 text-section text-ink">Videos in stories</h2>
        <p>
          Some stories carry a YouTube video. Nothing is loaded from YouTube
          until you press play: before that you see only the video&rsquo;s
          picture. When you do press play, the video comes from YouTube&rsquo;s
          privacy-enhanced service, and YouTube&rsquo;s own privacy policy
          covers what it records from then on.
        </p>

        <h2 className="mt-8 text-section text-ink">If you sign in</h2>
        <p>
          Signing in creates an account identified by the email address from your
          Google sign-in. If you follow topics or authors, or subscribe to a
          newsletter, those choices are stored against that account. Your account
          is yours: your follow list is visible to you and to nobody else,
          including other readers.
        </p>

        {/* Requests about personal data go to the grievance officer, who
            also takes complaints about how it is handled; the general inbox
            only when no officer's address is set. */}
        {PUBLISHER.legalName || officer.email || PUBLISHER.email ? (
          <>
            <h2 id="your-rights" className="mt-8 text-section text-ink">
              Your rights and contact
            </h2>
            <p>
              {PUBLISHER.legalName
                ? `${PUBLISHER.legalName} is responsible for the personal data described here. `
                : ""}
              You can ask for a copy of the data held about your account, ask
              us to correct it, or have your account and everything stored
              against it deleted
              {officer.email ? (
                <>
                  , by writing to <GrievanceOfficer /> from the email address
                  you sign in with. Complaints about how we handle your data go
                  to the same address.
                </>
              ) : PUBLISHER.email ? (
                <>
                  , by writing to <EmailLink address={PUBLISHER.email} /> from
                  the email address you sign in with.
                </>
              ) : (
                "."
              )}
            </p>
          </>
        ) : null}
      </div>
    </StaticPage>
  );
}

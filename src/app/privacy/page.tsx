import type { Metadata } from "next";

import { EditorialNotice } from "@/components/site/editorial-notice";
import { StaticPage } from "@/components/site/static-page";

export const metadata: Metadata = {
  title: "Privacy and tracking — Newswebsite",
  description: "What we record about how this site is read, and why.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <StaticPage
      title="Privacy and tracking"
      standfirst="What we record about how this site is read, and why."
    >
      <EditorialNotice>
        The technical description below is accurate — it was written against the
        actual database schema, and the limits it describes are enforced in code
        rather than promised. It is not a complete legal privacy notice. A
        qualified adviser must review it and add the lawful basis, retention
        periods, data-subject rights, controller identity and any processor
        disclosures before launch.
      </EditorialNotice>

      <div className="space-y-4 text-body leading-relaxed text-ink">
        <h2 className="text-section text-ink">What we do not collect</h2>
        <p>
          We do not store your IP address. We do not store your browser&rsquo;s
          user-agent string. We do not build advertising profiles and we do not
          sell reader data. These are properties of how the system is built: the
          columns to hold that data do not exist.
        </p>

        <h2 className="mt-8 text-section text-ink">
          Before you agree to anything
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
          identifier stored in your browser. That identifier is generated at the
          moment you agree — not before — and it is not derived from anything
          about you or your device. We use this to work out which stories lose
          readers and where, which is how we decide what to change.
        </p>
        <p>
          Agreeing also loads Google Analytics, which we use alongside our own
          records for search reporting. Declining means it is never requested at
          all.
        </p>

        <h2 className="mt-8 text-section text-ink">Changing your mind</h2>
        <p>
          Your choice is stored in a cookie on this site and is remembered for
          twelve months, after which we ask again. Clearing your cookies for this
          site resets it.
        </p>

        <h2 className="mt-8 text-section text-ink">If you sign in</h2>
        <p>
          Signing in creates an account identified by the email address from your
          Google sign-in. If you follow topics or authors, or subscribe to a
          newsletter, those choices are stored against that account. Your account
          is yours: your follow list is visible to you and to nobody else,
          including other readers.
        </p>

        <h2 className="mt-8 text-section text-ink">
          Retention, rights and contact
        </h2>
        <p>
          [Placeholder: how long each category of data is kept, how to request
          access or deletion, the identity of the data controller, and the
          contact address for privacy enquiries.]
        </p>
      </div>
    </StaticPage>
  );
}

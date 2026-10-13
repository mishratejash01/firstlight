import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo/metadata";
import { PUBLISHER } from "@/lib/site";

import { EmailLink } from "@/components/site/email-link";
import { GrievanceOfficer } from "@/components/site/grievance-officer";
import { DOCUMENTS_UPDATED, LegalDocument } from "@/components/site/legal-document";

export const metadata: Metadata = pageMetadata({
  title: "Privacy and tracking",
  description: "What we record about how this site is read, and why.",
  path: "/privacy",
});

/**
 * What the site records, set out clause by clause. Every statement describes
 * what the code does — the consent flow, the India default and its end date,
 * the cookie's twelve months — so a change to any of those is a change to
 * this page too.
 */
export default function PrivacyPage() {
  const officer = PUBLISHER.grievanceOfficer;

  return (
    <LegalDocument
      title="Privacy and tracking"
      standfirst="What we record about how this site is read, and why."
      lastUpdated={DOCUMENTS_UPDATED}
      sections={[
        {
          id: "not-collected",
          join: true,
          title: "What we do not collect",
          items: [
            <>
              Our page counts and reading records never contain your IP address
              or your browser&rsquo;s user-agent string.
            </>,
            <>
              We do not build advertising profiles ourselves and we do not sell
              reader data. The companies that host this site, run its sign-in
              and serve its advertisements do record IP addresses for security;
              advertising is described below.
            </>,
          ],
        },
        {
          id: "page-views",
          join: true,
          title: "What every page view records",
          items: [
            <>
              When a page is served we record that a page was served — the
              article, the time, the coarse device class (phone, tablet or
              desktop) and the site you arrived from, kept as a domain name
              only, never a full link.
            </>,
            <>
              These records carry no identifier of any kind. They cannot be
              linked to each other, to a session, or to you. They tell us how
              many people read something and nothing about who.
            </>,
          ],
        },
        {
          id: "if-you-agree",
          title: "If you agree",
          items: [
            <>
              With your agreement we additionally record how far you scroll,
              whether you finish an article, and which links you follow, tied
              to a random identifier stored in your browser.
            </>,
            <>
              That identifier is generated only once this measurement is on —
              when you agree, or for readers in India as described below — and
              it is not derived from anything about you or your device. We use
              this to work out which stories lose readers and where, which is
              how we decide what to change.
            </>,
            <>
              Agreeing also loads Google Analytics, which we use alongside our
              own records for search reporting. If you decline, it is not
              requested at all.
            </>,
          ],
        },
        {
          id: "india",
          join: true,
          title: "Readers in India",
          items: [
            <>
              If your browser is set to India Standard Time, we take you to be
              reading from India.
            </>,
            <>
              Until 12 May 2027, the measurement described above, Google
              Analytics included, is on by default for readers in India: a
              notice says so on your first visit, and choosing Turn off in that
              notice, or Decline in Privacy settings, stops it and deletes the
              identifier and the analytics cookies.
            </>,
            <>
              From 13 May 2027, when the consent rules of India&rsquo;s Digital
              Personal Data Protection Act take effect, readers in India will be
              asked first, as readers everywhere else are now.
            </>,
          ],
        },
        {
          id: "changing-your-mind",
          join: true,
          title: "Changing your mind",
          items: [
            <>
              Your choice is stored in a cookie on this site and is remembered
              for twelve months, after which we ask again.
            </>,
            <>
              To change it at any time, use Privacy settings at the foot of
              every page: it asks you again, and declining clears the
              identifier and the analytics cookies.
            </>,
          ],
        },
        {
          id: "videos",
          join: true,
          title: "Videos in stories",
          items: [
            <>
              Some stories carry a YouTube video. Nothing is loaded from YouTube
              until you press play: before that you see only the video&rsquo;s
              picture.
            </>,
            <>
              When you do press play, the video comes from YouTube&rsquo;s
              privacy-enhanced service, and YouTube&rsquo;s own privacy policy
              covers what it records from then on.
            </>,
          ],
        },
        {
          id: "advertising",
          join: true,
          title: "Advertisements",
          items: [
            <>
              Advertisements on this site are served by Google AdSense. Google
              and the advertising partners it certifies may use cookies and
              similar identifiers to show you advertisements based on your
              visits to this and other sites, to limit how often you see one,
              and to measure them.
            </>,
            <>
              Where the law requires your consent before such cookies are set,
              you are asked first. You can turn off personalised advertising at
              any time in Google&rsquo;s{" "}
              <a href="https://adssettings.google.com" className="underline underline-offset-4">
                Ads Settings
              </a>
              , and Google&rsquo;s{" "}
              <a href="https://policies.google.com/technologies/ads" className="underline underline-offset-4">
                advertising privacy notice
              </a>{" "}
              describes what it records.
            </>,
          ],
        },
        {
          id: "accounts",
          join: true,
          title: "If you sign in",
          items: [
            <>
              Signing in creates an account identified by the email address
              from your Google sign-in. If you follow topics or authors, or
              subscribe to a newsletter, those choices are stored against that
              account.
            </>,
            <>
              Your account is yours: your follow list is visible to you and to
              nobody else, including other readers.
            </>,
          ],
        },
        {
          // Requests about personal data go to the grievance officer, who
          // also takes complaints about how it is handled; the general inbox
          // only when no officer's address is set.
          id: "your-rights",
          join: true,
          title: "Your rights and contact",
          items: [
            PUBLISHER.legalName ? (
              <>
                {PUBLISHER.legalName} is responsible for the personal data
                described here.
              </>
            ) : null,
            officer.email || PUBLISHER.email ? (
              <>
                You can ask for a copy of the data held about your account, ask
                us to correct it, or have your account and everything stored
                against it deleted
                {officer.email ? (
                  <>
                    , by writing to <GrievanceOfficer /> from the email address
                    you sign in with. Complaints about how we handle your data
                    go to the same address.
                  </>
                ) : (
                  <>
                    , by writing to <EmailLink address={PUBLISHER.email} /> from
                    the email address you sign in with.
                  </>
                )}
              </>
            ) : null,
          ],
        },
      ]}
    />
  );
}

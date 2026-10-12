import { HAS_CONTACT_PAGE, PUBLISHER, SITE_NAME } from "@/lib/site";
import { PrivacySettingsButton } from "@/components/analytics/privacy-settings-button";
import Image from "next/image";
import Link from "next/link";

import { getAllSections } from "@/lib/queries/navigation";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { SocialLinks } from "@/components/site/social-links";

/**
 * Site footer.
 *
 * A page has to end somewhere, and a footer set on the same white as the
 * reporting above it does not end anything — it reads as more page that has run
 * out of content. This one sits on a faded black (`.site-footer` in
 * globals.css), so the document closes rather than simply stopping.
 *
 * The section index runs the full width rather than sitting in a column. Twenty
 * sections stacked two-across in one third of the page made a tall thin list
 * beside two short ones, and left the bottom two thirds of the footer empty.
 * Across five columns the same list is six rows deep and the row below it has
 * something to sit under.
 *
 * The index is every section in circulation, not only the ones the header
 * carries. The header is a ranked selection with a fixed amount of room; the
 * footer is the contents page, and a contents page that omits entries is not
 * doing its job. Both still come from the database — nothing here is a list in
 * a file.
 *
 * The policy links are the only fixed navigation on the site, because those
 * pages are obligations rather than editorial choices.
 *
 * The nameplate repeats above the copyright line: a reader who has scrolled
 * past a long article should be told whose reporting they just read.
 */
const ABOUT_LINKS = [
  { href: "/about", label: "About" },
  { href: "/masthead", label: "Masthead" },
  { href: "/editorial-standards", label: "Editorial standards" },
  { href: "/corrections", label: "Corrections policy" },
  { href: "/privacy", label: "Privacy and tracking" },
  { href: "/terms", label: "Terms of use" },
  // The contact page exists only once the publisher's contact details are
  // set; linking to it before then would be a dead end. The two below go
  // straight to their own sections of it, for the two kinds of reader who
  // come looking for a way in: someone with a story, and an advertiser.
  ...(HAS_CONTACT_PAGE ? [{ href: "/contact", label: "Contact and grievances" }] : []),
  ...(PUBLISHER.newsroomEmail
    ? [{ href: "/contact#newsroom", label: "Send us a news tip" }]
    : []),
  ...(PUBLISHER.partnershipsEmail
    ? [{ href: "/contact#advertising", label: "Advertise with us" }]
    : []),
];

const LEGAL_LINKS = [
  { href: "/sections", label: "All sections" },
  { href: "/bulletin", label: "News bulletin" },
  { href: "/breaking", label: "Breaking" },
  { href: "/corrections", label: "Corrections" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/sitemap.xml", label: "Sitemap" },
];

export async function SiteFooter() {
  const sections = await getAllSections();

  return (
    <footer className="site-footer mt-20">
      <div className="mx-auto max-w-page px-4 py-12 sm:px-6">
        {sections.length ? (
          <>
            <h2 className="eyebrow font-label text-muted">Sections</h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {sections.map((section) => (
                <li key={section.slug}>
                  <Link
                    href={`/${section.slug}`}
                    className="text-meta text-ink hover:text-accent"
                  >
                    {section.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="mt-10 grid gap-10 border-t border-hairline pt-10 lg:grid-cols-[1.1fr_1fr_1.3fr]">
          <div>
            {/* The masthead's lockup, with the wordmark redrawn in white for
                the dark ground; the dove's orange disc is unchanged. */}
            <Link href="/" className="inline-block">
              <Image
                src="/brand/the-india-decade-light.png"
                alt={SITE_NAME}
                width={1200}
                height={218}
                className="h-10 w-auto sm:h-12"
              />
            </Link>
            <SocialLinks className="mt-6" />
          </div>

          <div>
            <h2 className="eyebrow font-label text-muted">About us</h2>
            <ul className="mt-4 space-y-2.5">
              {ABOUT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-meta text-ink hover:text-accent"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <NewsletterSignup context="footer" />
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline pt-6">
          <p className="text-meta text-muted">
            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-meta text-muted hover:text-accent"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <PrivacySettingsButton className="text-meta text-muted hover:text-accent" />
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

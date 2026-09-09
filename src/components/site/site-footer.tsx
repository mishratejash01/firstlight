import { SITE_NAME } from "@/lib/site";
import Link from "next/link";

import { getNavCategories } from "@/lib/queries/navigation";
import { NewsletterSignup } from "@/components/site/newsletter-signup";

/**
 * Site footer.
 *
 * Sections come from the same query as the header, so
 * the two can never drift. The policy links are the only fixed navigation on
 * the site, because those pages are obligations rather than editorial choices.
 *
 * The nameplate repeats above the copyright line: a reader who has scrolled
 * past a long article should be told whose reporting they just read.
 */
export async function SiteFooter() {
  const categories = await getNavCategories();

  return (
    <footer className="mt-20 border-t border-hairline">
      <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h2 className="text-body font-semibold text-ink">Sections</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/${category.slug}`}
                    className="text-meta text-muted hover:text-accent"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-body font-semibold text-ink">About us</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="/about"
                  className="text-meta text-muted hover:text-accent"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/masthead"
                  className="text-meta text-muted hover:text-accent"
                >
                  Masthead
                </Link>
              </li>
              <li>
                <Link
                  href="/editorial-standards"
                  className="text-meta text-muted hover:text-accent"
                >
                  Editorial standards
                </Link>
              </li>
              <li>
                <Link
                  href="/corrections"
                  className="text-meta text-muted hover:text-accent"
                >
                  Corrections policy
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-meta text-muted hover:text-accent"
                >
                  Privacy and tracking
                </Link>
              </li>
            </ul>
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <NewsletterSignup context="footer" />
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-hairline pt-6">
          <p className="text-[1.15rem] font-extrabold tracking-[-0.03em] text-ink">
            {SITE_NAME}
          </p>
          <p className="text-meta text-muted">
            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

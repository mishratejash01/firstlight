import Link from "next/link";

import { getNavCategories } from "@/lib/queries/navigation";
import { NewsletterSignup } from "@/components/site/newsletter-signup";

/**
 * Site footer.
 *
 * Sections come from the same query as the header, so the two can never drift.
 * The policy links are the only fixed navigation on the site, because those
 * pages are obligations rather than editorial choices.
 */
export async function SiteFooter() {
  const categories = await getNavCategories();

  return (
    <footer className="mt-16 border-t border-hairline">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <NewsletterSignup context="footer" />

        <div className="mt-10 grid gap-8 border-t border-hairline pt-8 sm:grid-cols-2">
          <div>
            <h2 className="font-serif text-body font-semibold text-ink">Sections</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link href={`/${category.slug}`} className="text-meta text-muted hover:text-accent">
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-serif text-body font-semibold text-ink">About us</h2>
            <ul className="mt-3 space-y-2">
              <li><Link href="/about" className="text-meta text-muted hover:text-accent">About</Link></li>
              <li><Link href="/masthead" className="text-meta text-muted hover:text-accent">Masthead</Link></li>
              <li><Link href="/editorial-standards" className="text-meta text-muted hover:text-accent">Editorial standards</Link></li>
              <li><Link href="/corrections" className="text-meta text-muted hover:text-accent">Corrections policy</Link></li>
              <li><Link href="/privacy" className="text-meta text-muted hover:text-accent">Privacy and tracking</Link></li>
            </ul>
          </div>
        </div>

        <p className="mt-8 border-t border-hairline pt-6 text-meta text-muted">
          © {new Date().getFullYear()} Newswebsite. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

import { SITE_NAME } from "@/lib/site";
import Link from "next/link";

import { AccountMenu } from "@/components/site/account-menu";
import { SocialLinks } from "@/components/site/social-links";
import { getNavCategories } from "@/lib/queries/navigation";

/**
 * The flag: dateline strip, nameplate, section navigation.
 *
 * Laid out the way a newspaper front page is: the dateline in small type, the
 * nameplate centred and owning the full width, the sections beneath it. One
 * hairline closes the whole block — the authority comes from the size of the
 * nameplate and the space around it, not from stacked rules.
 *
 * Mobile-first: the section strip scrolls horizontally rather than collapsing
 * into a menu button. Most readers arrive on a phone, and a one-tap section
 * switch beats a two-tap drawer. On wider screens the same strip stops needing
 * to scroll and centres itself — no second layout, no duplicated markup.
 */
export async function SiteHeader({ activeSlug }: { activeSlug?: string }) {
  const categories = await getNavCategories();
  const now = new Date();
  const today = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="border-b border-hairline">
      {/* Dateline. A paper says what day it is before it says anything else. */}
      <div>
        <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <p className="text-kicker text-muted">
            <time dateTime={now.toISOString().slice(0, 10)}>{today}</time>
          </p>
          <div className="flex items-center gap-4">
            <SocialLinks className="sm:hidden" />
            <AccountMenu />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-page px-4 pt-6 pb-5 text-center sm:px-6 sm:pt-8">
        <Link
          href="/"
          className="text-nameplate font-extrabold tracking-[-0.04em] text-ink sm:text-nameplate-lg"
        >
          {SITE_NAME}
        </Link>
      </div>

      <nav aria-label="Sections">
        <div className="mx-auto flex max-w-page items-center gap-4 px-4 sm:px-6">
          {/* Two equal spacers either side keep the section strip optically
              centred whether or not the social icons are configured, instead of
              letting the strip shift left the day an account is added. */}
          <div className="hidden flex-1 sm:block" aria-hidden="true" />

          {/* One line on a phone, scrolling edge to edge: the negative margin
              lets the first and last sections sit flush with the page gutter.
              Nothing shares this row below the sm breakpoint — the social marks
              move up into the dateline so the sections keep the full width. */}
          <ul className="-mx-4 flex min-w-0 flex-1 gap-6 overflow-x-auto px-4 pb-3 sm:mx-0 sm:flex-none sm:flex-wrap sm:justify-center sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => {
              const active = category.slug === activeSlug;
              return (
                <li key={category.slug} className="shrink-0">
                  <Link
                    href={`/${category.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "eyebrow text-accent"
                        : "eyebrow text-ink hover:text-accent"
                    }
                  >
                    {category.name}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden pb-3 sm:flex sm:flex-1 sm:justify-end">
            <SocialLinks />
          </div>
        </div>
      </nav>
    </header>
  );
}

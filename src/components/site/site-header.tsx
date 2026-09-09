import Link from "next/link";

import { AccountMenu } from "@/components/site/account-menu";
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
          <AccountMenu />
        </div>
      </div>

      <div className="mx-auto max-w-page px-4 pt-6 pb-5 text-center sm:px-6 sm:pt-8">
        <Link
          href="/"
          className="text-nameplate font-extrabold tracking-[-0.04em] text-ink sm:text-nameplate-lg"
        >
          Newswebsite
        </Link>
      </div>

      <nav aria-label="Sections">
        <div className="mx-auto max-w-page px-4 sm:px-6">
          {/* Edge-to-edge scroll on phones; the negative margin lets the first
 and last items sit flush with the page gutter while scrolling. */}
          <ul className="-mx-4 flex gap-6 overflow-x-auto px-4 pb-3 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        </div>
      </nav>
    </header>
  );
}

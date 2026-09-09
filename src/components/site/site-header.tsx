import Link from "next/link";

import { getNavCategories } from "@/lib/queries/navigation";

/**
 * Masthead and section navigation.
 *
 * Mobile-first: the section strip scrolls horizontally rather than collapsing
 * into a menu button. Most readers arrive on a phone, and a one-tap section
 * switch beats a two-tap drawer. On wider screens the same strip simply stops
 * needing to scroll — no second layout, no duplicated markup.
 */
export async function SiteHeader({ activeSlug }: { activeSlug?: string }) {
  const categories = await getNavCategories();
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="border-b border-hairline">
      <div className="mx-auto flex max-w-6xl items-baseline justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Link
          href="/"
          className="font-serif text-[1.35rem] font-semibold tracking-tight text-ink sm:text-[1.6rem]"
        >
          Newswebsite
        </Link>
        <div className="flex items-baseline gap-4">
          <span className="hidden text-meta text-muted sm:inline">{today}</span>
          <Link
            href="/login"
            className="text-meta text-accent underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>

      <nav aria-label="Sections" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* Edge-to-edge scroll on phones; the negative margin lets the first
              and last items sit flush with the page gutter while scrolling. */}
          <ul className="-mx-4 flex gap-5 overflow-x-auto px-4 py-2.5 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => {
              const active = category.slug === activeSlug;
              return (
                <li key={category.slug} className="shrink-0">
                  <Link
                    href={`/${category.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "text-meta font-semibold text-accent"
                        : "text-meta text-ink hover:text-accent"
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

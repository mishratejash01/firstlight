import { SITE_NAME } from "@/lib/site";
import Image from "next/image";
import Link from "next/link";

import { AccountMenu } from "@/components/site/account-menu";
import { SearchBox } from "@/components/site/search-box";
import { SocialLinks } from "@/components/site/social-links";
import { BreakingStrip } from "@/components/article/breaking-strip";
import { getNavCategories } from "@/lib/queries/navigation";
import {
  getRecentArticles,
  type ArticleCardData,
} from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

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
 *
 * Hovering a section opens its three latest stories underneath the strip. It is
 * built from CSS hover on the list item, with the panel a child of it — so the
 * pointer can travel from the name down into the panel without it closing, and
 * so the whole thing works server-rendered with no client JavaScript. The panel
 * is desktop-only: there is no hover on a phone, and a tap there should go to
 * the section rather than open a menu the reader has to dismiss.
 *
 * The sections and the breaking bar stick to the top of the window while the
 * dateline and the nameplate scroll away. A reader thirty paragraphs down a
 * story still wants to change section or see that something has broken; they do
 * not need the flag reintroducing itself the whole way. Both live in one sticky
 * element rather than two, so the bar cannot drift out from under the sections
 * or need a hardcoded offset to sit below them.
 */
export async function SiteHeader({
  activeSlug,
  breaking,
}: {
  activeSlug?: string;
  breaking?: ArticleCardData;
}) {
  // One query feeds every section's hover panel. Asking per section would mean
  // a round trip per item in the navigation, on every page of the site.
  const [categories, recent] = await Promise.all([
    getNavCategories(),
    getRecentArticles(60),
  ]);

  const latestBySection = new Map<string, ArticleCardData[]>();
  for (const article of recent) {
    const list = latestBySection.get(article.categories.slug) ?? [];
    if (list.length < 3) list.push(article);
    latestBySection.set(article.categories.slug, list);
  }
  const now = new Date();
  const today = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    // The sticky block is a sibling of <header>, not a child of it. A sticky
    // element can only travel inside its own parent's box, and as the last
    // child of a header that ends immediately beneath it there was nowhere to
    // go — it scrolled away like anything else. Out here its containing block
    // is the page, so it can hold the top of the window.
    <>
      <header>
        {/* Dateline. A paper says what day it is before it says anything else. */}
        <div>
          <div className="mx-auto flex max-w-wide items-center justify-between gap-4 px-4 pt-3 sm:px-6">
            <p className="text-kicker text-muted">
              <time dateTime={now.toISOString().slice(0, 10)}>{today}</time>
            </p>
            <div className="flex items-center gap-4">
              <SearchBox />
              <SocialLinks className="sm:hidden" />
              <AccountMenu />
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-wide px-4 pt-6 pb-5 text-center sm:px-6 sm:pt-8">
          <Link
            href="/"
            className="text-nameplate font-extrabold tracking-[-0.04em] text-ink sm:text-nameplate-lg"
          >
            {SITE_NAME}
          </Link>
        </div>
      </header>

      <div className="sticky top-0 z-40 border-b border-hairline bg-paper">
        <nav aria-label="Sections">
          <div className="mx-auto flex max-w-wide items-center gap-4 px-4 sm:px-6">
            {/* Fixed-width spacers either side, not flexible ones: they keep
              the strip optically centred while leaving it free to take the rest
              of the row and wrap. Flexible spacers plus a strip sized to its
              own content pushed the whole page wider than the window once a
              newsroom ran more than a dozen sections. */}
            <div className="hidden w-24 shrink-0 sm:block" aria-hidden="true" />

            {/* One line on a phone, scrolling edge to edge: the negative margin
              lets the first and last sections sit flush with the page gutter.
              Nothing shares this row below the sm breakpoint — the social marks
              move up into the dateline so the sections keep the full width. */}
            <ul className="-mx-4 flex min-w-0 flex-1 gap-6 overflow-x-auto px-4 pb-3 sm:mx-0 sm:flex-wrap sm:justify-center sm:gap-y-2 sm:overflow-visible sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => {
                const active = category.slug === activeSlug;
                return (
                  <li key={category.slug} className="group shrink-0">
                    <Link
                      href={`/${category.slug}`}
                      aria-current={active ? "page" : undefined}
                      className="flex flex-col items-center gap-1.5"
                    >
                      {/* The mark sits over the name, both centred on the same
                          axis. It is hidden from screen readers because the
                          name is right underneath it. A section without an icon
                          keeps the slot, so the row of names stays on one
                          baseline instead of stepping up where art is missing. */}
                      <span className="flex h-6 items-end">
                        {category.icon_url ? (
                          <Image
                            src={category.icon_url}
                            alt=""
                            aria-hidden="true"
                            width={40}
                            height={40}
                            className="h-6 w-6 object-contain"
                          />
                        ) : null}
                      </span>
                      <span
                        className={
                          active
                            ? "eyebrow font-label text-accent"
                            : "eyebrow font-label text-ink group-hover:text-accent"
                        }
                      >
                        {category.name}
                      </span>
                    </Link>

                    {/* Sits inside the item so the pointer can move from the
                        name into the panel without dropping the hover, but is
                        positioned against the strip so it spans the full width
                        rather than the width of one name. */}
                    {(latestBySection.get(category.slug) ?? []).length ? (
                      <div className="absolute inset-x-0 top-full z-50 hidden border-t border-hairline bg-paper pt-5 pb-6 shadow-[0_10px_24px_-18px_rgba(20,22,28,0.45)] sm:group-hover:block">
                        {/* The ground runs the width of the window; the stories
                            inside it line up with the section strip above. */}
                        <div className="mx-auto grid max-w-wide grid-cols-3 px-4 sm:px-6">
                          {(latestBySection.get(category.slug) ?? []).map(
                            (article, index) => (
                              <div
                                key={article.id}
                                className={`relative ${index === 0 ? "pr-6" : "px-6"}`}
                              >
                                {/* Dashed rather than solid, and in the mid
                                    grey rather than the hairline: a hairline
                                    this short reads as a smudge, while a solid
                                    dark line reads as a border round the story.
                                    Inset top and bottom so it separates the
                                    columns without ruling a grid around them. */}
                                {index > 0 ? (
                                  <span
                                    aria-hidden="true"
                                    className="absolute top-2 bottom-2 left-0 border-l border-dashed border-muted"
                                  />
                                ) : null}
                                <Link
                                  href={`/${article.categories.slug}/${article.slug}`}
                                  className="flex items-start gap-3"
                                >
                                  {article.hero_image_url ? (
                                    <span className="relative block h-20 w-28 shrink-0 overflow-hidden rounded-media bg-hairline">
                                      <Image
                                        src={
                                          cloudinaryImage(
                                            article.hero_image_url,
                                            "card",
                                          ) ?? article.hero_image_url
                                        }
                                        alt=""
                                        aria-hidden="true"
                                        fill
                                        sizes="112px"
                                        className="object-cover"
                                      />
                                    </span>
                                  ) : null}
                                  <span className="min-w-0 text-[0.9375rem] leading-[1.3] font-medium text-ink hover:text-accent">
                                    {article.headline}
                                  </span>
                                </Link>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="hidden w-24 shrink-0 pb-3 sm:flex sm:justify-end">
              <SocialLinks />
            </div>
          </div>
        </nav>

        {breaking ? <BreakingStrip article={breaking} /> : null}
      </div>
    </>
  );
}

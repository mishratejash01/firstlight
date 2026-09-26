import { SITE_NAME } from "@/lib/site";
import Image from "next/image";
import Link from "next/link";

import { AccountMenu } from "@/components/site/account-menu";
import { SearchBox } from "@/components/site/search-box";
import { SocialLinks } from "@/components/site/social-links";
import { BreakingStrip } from "@/components/article/breaking-strip";
import { SectionsDrawer } from "@/components/site/sections-drawer";
import { SectionMark } from "@/components/site/section-mark";
import { inSentence } from "@/lib/format/section-name";
import { StickyNav } from "@/components/site/sticky-nav";
import { getAllSections, getNavCategories } from "@/lib/queries/navigation";
import {
  getBreakingArticles,
  getRecentArticles,
  rankByConsequence,
  type ArticleCardData,
} from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The flag: dateline, nameplate, section navigation.
 *
 * Laid out the way a newspaper front page is — the dateline in small type, the
 * nameplate owning the centre, the sections beneath. One hairline closes the
 * whole block; the authority comes from the size of the nameplate and the space
 * around it, not from stacked rules.
 *
 * On a wide screen all three parts of the top line share one row: dateline
 * left, nameplate centre, search and social marks right. Stacked, they cost
 * about fifty pixels of the first screen and buy nothing — the dateline is four
 * words and the search a single glyph, and neither needs a row to itself. The
 * row only collapses into two below the large breakpoint, where the nameplate
 * at full size no longer leaves room beside it.
 *
 * Mobile-first for the sections: the strip scrolls horizontally rather than
 * collapsing into a menu button. Most readers arrive on a phone, and a one-tap
 * section switch beats a two-tap drawer. On wider screens the same strip stops
 * needing to scroll and centres itself — no second layout, no duplicated markup.
 *
 * Hovering a section opens its three latest stories underneath the strip, with
 * the section named down the left so the panel says what it belongs to. It is
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
 * or need a hardcoded offset to sit below them. That element shrinks once the
 * page has moved — see StickyNav.
 */
/**
 * How many sections the bar carries on a desktop, from each breakpoint up,
 * measured so the row stays on one line at every width from the breakpoint to
 * the next. Phones and tablets keep eleven: the phone strip scrolls sideways,
 * and the tablet row was left as it was.
 */
type BarTier = "lg" | "xl" | "laptop" | "2xl" | "desktop" | "wide";
const BAR_TIERS: { from: BarTier; count: number }[] = [
  { from: "lg", count: 7 },
  { from: "xl", count: 9 },
  { from: "laptop", count: 11 },
  { from: "2xl", count: 12 },
  { from: "desktop", count: 13 },
  { from: "wide", count: 14 },
];
const BAR_BELOW_LG = 11;
const BAR_MAX = 14;

// Written out whole so the stylesheet generator can find every class.
const SHOW_FROM: Record<BarTier, string> = {
  lg: "",
  xl: "xl:block",
  laptop: "laptop:block",
  "2xl": "2xl:block",
  desktop: "desktop:block",
  wide: "wide:block",
};
const HIDE_FROM: Record<BarTier, string> = {
  lg: "lg:hidden",
  xl: "xl:hidden",
  laptop: "laptop:hidden",
  "2xl": "2xl:hidden",
  desktop: "desktop:hidden",
  wide: "wide:hidden",
};

const tierFor = (index: number) => BAR_TIERS.find((tier) => index < tier.count)?.from;

/** Where a section at this place in the running order shows in the bar. */
function barClasses(index: number): string {
  const tier = tierFor(index);
  if (!tier || tier === "lg") return "";
  return `${index < BAR_BELOW_LG ? "lg:hidden" : "hidden"} ${SHOW_FROM[tier]}`;
}

/** Where the same section shows in the "More" panel: wherever the bar does not. */
function panelClasses(index: number | undefined): string | undefined {
  const tier = index === undefined ? undefined : tierFor(index);
  if (index === undefined || !tier) return undefined;
  if (tier === "lg") return "hidden";
  return index < BAR_BELOW_LG ? `hidden lg:block ${HIDE_FROM[tier]}` : HIDE_FROM[tier];
}

export async function SiteHeader({
  activeSlug,
  excludeId,
}: {
  activeSlug?: string;
  /**
   * A story this page is already leading on — the front page's splash, or the
   * article being read. The bar exists to point at things a reader would
   * otherwise miss, and it has nothing to point at when the story is already
   * the thing on screen.
   */
  excludeId?: string;
}) {
  // One query feeds every section's hover panel. Asking per section would mean
  // a round trip per item in the navigation, on every page of the site.
  //
  // Alerts are fetched here rather than handed down by each page. Breaking news
  // is breaking everywhere, and requiring twelve callers to remember to pass it
  // is how eleven of them quietly end up without it. The extra query costs no
  // wall time: it runs alongside the three already here.
  const [navCategories, allSections, recent, breakingAll] = await Promise.all([
    getNavCategories(),
    getAllSections(),
    getRecentArticles(60),
    getBreakingArticles(),
  ]);

  // Capped at ten. The bar shows one at a time and holds each for five seconds,
  // so ten is already most of a minute before the first comes round again; past
  // that the rota stops being a bulletin and becomes a section front that
  // happens to move.
  const BREAKING_IN_BAR = 10;
  const breaking = rankByConsequence(breakingAll)
    .filter((article) => article.id !== excludeId)
    .slice(0, BREAKING_IN_BAR);

  // The bar carries the sections the editors ranked highest, as many as fill
  // one row at the width of the window: a wider window has room for more of
  // the running order before the rest go behind "More". The counts are design
  // constants, like type sizes, measured so the row never wraps; which
  // sections fill them is still the running order held in the database. On a
  // phone the strip scrolls sideways, so it carries the lot.
  const categories = navCategories.slice(0, BAR_MAX);

  // Everything the bar cannot always show, by name: the sections it carries
  // only on some widths (hidden here wherever it does) and the ones held out
  // of the header entirely, which is exactly where a reader would look.
  const place = new Map(categories.map((c, index) => [c.slug, index]));
  const overflow = allSections
    .filter((section) => tierFor(place.get(section.slug) ?? BAR_MAX) !== "lg")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((section) => ({ ...section, hideFrom: panelClasses(place.get(section.slug)) }));

  const latestBySection = new Map<string, ArticleCardData[]>();
  for (const article of recent) {
    const list = latestBySection.get(article.categories.slug) ?? [];
    if (list.length < 3) list.push(article);
    latestBySection.set(article.categories.slug, list);
  }
  // The paper's day is India's day. Formatted on the server, which runs on
  // UTC, the dateline showed yesterday's date until 5.30 in the morning.
  const now = new Date();
  const today = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const todayShort = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const isoToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);

  return (
    // The sticky block is a sibling of <header>, not a child of it. A sticky
    // element can only travel inside its own parent's box, and as the last
    // child of a header that ends immediately beneath it there was nowhere to
    // go — it scrolled away like anything else. Out here its containing block
    // is the page, so it can hold the top of the window.
    <>
      <header className="mx-auto max-w-wide px-4 pt-3 pb-5 sm:px-6 lg:pt-5">
        {/* Two columns below lg — dateline and controls on one line, nameplate
            centred beneath them. Three at lg and up, the nameplate in an auto
            column between two equal ones, which is what keeps it optically
            centred on the page rather than centred on whatever is left over
            after the dateline. Ordered in CSS, so the markup stays in the
            reading order a screen reader should hear: date, then controls,
            then the paper's name. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-4 lg:grid-cols-[1fr_auto_1fr]">
          {/* The short form on a phone, where the same line also has to hold
              the controls and the sign-in button. */}
          <p className="text-kicker text-muted lg:order-1">
            <time dateTime={isoToday}>
              <span className="sm:hidden">{todayShort}</span>
              <span className="hidden sm:inline">{today}</span>
            </time>
          </p>

          <div className="flex items-center justify-end gap-3.5 sm:gap-4 lg:order-3">
            <SearchBox />
            <SocialLinks />
            {/* On a phone the section strip has the row below to itself, so
                sign-in lives up here; from sm it sits at the end of that row. */}
            <span className="sm:hidden">
              <AccountMenu compact />
            </span>
          </div>

          <div className="col-span-2 flex justify-center lg:order-2 lg:col-span-1">
            {/* The paper's name, never the page's heading: every page, the
                front included, has a heading of its own that says what is on
                it, and the name is the same on all of them.

                Artwork now rather than type. Sized by height so the lockup
                keeps its proportions at every breakpoint. The name is in the
                alt text, so a reader who cannot see it still gets it here.

                The file is cropped to what can be seen rather than to every
                pixel carrying a trace of alpha: the original has a soft halo
                below the mark, and including it left the image box a quarter
                taller than the artwork, so centring the box sat the lockup
                visibly high in the row.

                The cell centres with flex rather than text-align. An inline
                block sits on a text baseline, so the cell grew eight pixels
                taller than the image to leave room for a descender that is not
                there, and the lockup rode the top of that while the dateline
                and the social marks sat on the row's true middle. */}
            <Link href="/" className="block">
              <Image
                src="/brand/the-india-decade.png"
                alt={SITE_NAME}
                width={1200}
                height={218}
                priority
                className="h-11 w-auto sm:h-16"
              />
            </Link>
          </div>
        </div>
      </header>

      <StickyNav>
        {/* Positioned, so the hover panels below resolve against this row
            rather than against the sticky block as a whole. Against the block,
            "top-full" put them under the breaking bar — and the bar is not part
            of any section's list item, so a pointer travelling from a name down
            to its panel crossed dead ground, dropped the hover and closed the
            panel. Opening and closing like that changes the page height on
            every flicker, which the browser's scroll anchoring then tries to
            correct, and the page appears to scroll on its own.

            Clipped on the x axis, which is what stops the whole document
            scrolling sideways on a phone. The section strip inside scrolls
            horizontally and its items run far past the right edge; nav was
            passing that width up to the body, so the page could be dragged
            595px sideways. `clip` rather than `hidden` on purpose — hidden
            would force the y axis to `auto` and trap the hover panels, which
            have to hang below this row. */}
        <nav aria-label="Sections" className="relative overflow-x-clip">
          <div className="mx-auto flex max-w-wide items-center gap-4 px-4 sm:px-6">
            {/* Fixed-width spacers either side, not flexible ones: they keep
              the strip optically centred while leaving it free to take the rest
              of the row and wrap. Flexible spacers plus a strip sized to its
              own content pushed the whole page wider than the window once a
              newsroom ran more than a dozen sections.

              The left one is not empty once the page has scrolled: the
              nameplate has gone by then, and without this there is nothing on
              screen naming the paper. Absolutely positioned so a wordmark
              wider than the slot cannot push the strip off centre, and
              invisible rather than transparent at the top of the page so it
              takes no focus stop while it cannot be read. */}
            <div
              className="relative hidden w-20 shrink-0 self-stretch sm:block"
              aria-hidden="true"
            >
              {/* The dove alone once the page has scrolled. The full lockup
                  is far too wide for this slot and its lettering unreadable at
                  the height available; the disc is the part of the mark that
                  still says whose paper this is at twenty pixels. */}
              <Link
                href="/"
                tabIndex={-1}
                className="absolute top-1/2 left-0 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-data-[shrunk=true]/nav:opacity-100 motion-reduce:transition-none"
              >
                <Image
                  src="/brand/dove.png"
                  alt={SITE_NAME}
                  width={256}
                  height={256}
                  className="h-6 w-6"
                />
              </Link>
              {/* A rule between the name and the first section. There are only
                  sixteen pixels of gap to work with — the strip needs the rest
                  of the row — and at that distance the wordmark simply read as
                  another item in the navigation. The rule makes the gap look
                  chosen. */}
              <span
                className="absolute top-1/2 -right-2 h-3.5 w-px -translate-y-1/2 bg-hairline opacity-0 transition-opacity duration-200 group-data-[shrunk=true]/nav:opacity-100 motion-reduce:transition-none"
              />
            </div>

            {/* One line on a phone, scrolling edge to edge: the negative margin
              lets the first and last sections sit flush with the page gutter.
              Nothing shares this row below the sm breakpoint — the social marks
              move up into the dateline so the sections keep the full width. */}
            {/* The top padding only exists in the shrunk state. Unshrunk, the
              marks give the names all the room above them they need; once the
              marks fold away the names are left sitting against the very top
              of the window — two pixels from it, measured — which reads as the
              bar having been cut off rather than closed up. */}
            {/* The marks and names grow a step on wide windows, which have
              the room: the sizes are variables so the fold-away on scroll
              still wins over them. */}
            <ul className="-mx-4 flex min-w-0 flex-1 gap-6 overflow-x-auto px-4 [--nav-mark:2.25rem] group-data-[shrunk=true]/nav:pt-3 sm:mx-0 sm:flex-wrap sm:justify-center sm:gap-y-2 sm:overflow-visible sm:px-0 xl:gap-x-5 xl:[--nav-mark:2.5rem] xl:[--text-kicker:0.75rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category, index) => {
                const active = category.slug === activeSlug;
                const latest = latestBySection.get(category.slug) ?? [];
                return (
                  <li key={category.slug} className={`group shrink-0 pb-3 ${barClasses(index)}`}>
                    <Link
                      href={`/${category.slug}`}
                      aria-current={active ? "page" : undefined}
                      className="flex flex-col items-center gap-1.5 group-data-[shrunk=true]/nav:gap-0"
                    >
                      {/* The mark sits over the name, both centred on the same
                          axis. It is hidden from screen readers because the
                          name is right underneath it. A section without an icon
                          keeps the slot, so the row of names stays on one
                          baseline instead of stepping up where art is missing.

                          Drawn at 36px, not 24: the artwork is a detailed
                          illustration and at the smaller size a reader could
                          not tell one section's mark from another's without
                          reading the name under it, which is the whole job the
                          mark was there to do.

                          The slot folds to nothing once the page has scrolled.
                          The marks earn their height on arrival; held at the
                          top of the window for the length of a story they are
                          just furniture, and the names alone navigate fine.

                          Width folds with the height. Left at its full 36px
                          the slot went on setting the width of any item whose
                          name is shorter than its mark, so "AI" sat centred in
                          a gap twice the width of the word with nothing
                          visible in it. */}
                      <span className="flex h-[var(--nav-mark)] w-[var(--nav-mark)] items-end justify-center overflow-hidden transition-[height,width] duration-200 group-data-[shrunk=true]/nav:h-0 group-data-[shrunk=true]/nav:w-0 motion-reduce:transition-none">
                        {category.icon_url ? (
                          <SectionMark
                            src={category.icon_url}
                            // Fades in half the time the box takes to close.
                            // Run at the same speed, the last frames of the
                            // collapse are a still-opaque sliver of artwork one
                            // or two pixels tall, which flickers along the top
                            // of the bar on every scroll.
                            className="h-[var(--nav-mark)] w-[var(--nav-mark)] transition-opacity duration-100 group-data-[shrunk=true]/nav:opacity-0 motion-reduce:transition-none"
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
                      {/* The section you are reading, ruled. Colour alone was
                          carrying this before, and navy against near-black at
                          eleven pixels is not a difference most readers see. */}
                      <span
                        aria-hidden="true"
                        className={`h-[2px] w-full ${active ? "bg-accent" : "bg-transparent"}`}
                      />
                    </Link>

                    {/* Sits inside the item so the pointer can move from the
                        name into the panel without dropping the hover, but is
                        positioned against the nav row so it spans the full
                        width rather than the width of one name.

                        Pulled up over the row's last few pixels. The strip is
                        centred against the taller sign-in slot beside it, which
                        leaves a sliver of nav below the names belonging to no
                        item; a pointer crossing it lost the hover and shut the
                        panel. The top padding grows by the same amount, so what
                        a reader sees has not moved — only the hit area. */}
                    {latest.length ? (
                      <div className="absolute inset-x-0 top-full -mt-3 z-50 hidden border-t border-hairline bg-paper pt-8 pb-6 shadow-[0_10px_24px_-18px_rgba(20,22,28,0.45)] sm:group-hover:block">
                        {/* The ground runs the width of the window; the stories
                            inside it line up with the section strip above. */}
                        <div className="mx-auto flex max-w-wide items-start px-4 sm:px-6">
                          {/* Which section this belongs to. The panel is full
                              width and looks identical whichever name opened
                              it, so without this the reader has to remember
                              what their pointer was over. */}
                          <div className="w-48 shrink-0 pr-6">
                            <p className="flex items-center gap-2.5">
                              {category.icon_url ? (
                                <SectionMark src={category.icon_url} className="h-8 w-8" />
                              ) : null}
                              <span className="font-label text-[1rem] font-semibold text-ink">
                                {category.name}
                              </span>
                            </p>
                            <Link
                              href={`/${category.slug}`}
                              className="mt-2 inline-block text-meta text-accent underline-offset-4 hover:underline"
                            >
                              More {inSentence(category.name)}
                            </Link>
                          </div>

                          <div className="grid min-w-0 flex-1 grid-cols-3">
                            {latest.map((article) => (
                              <div key={article.id} className="relative px-6">
                                {/* Dashed rather than solid, and in the mid
                                    grey rather than the hairline: a hairline
                                    this short reads as a smudge, while a solid
                                    dark line reads as a border round the story.
                                    Inset top and bottom so it separates the
                                    columns without ruling a grid around them. */}
                                <span
                                  aria-hidden="true"
                                  className="absolute top-2 bottom-2 left-0 border-l border-dashed border-muted"
                                />
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
                                        alt={article.hero_image_alt ?? ""}
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
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {overflow.length ? (
                <li className="shrink-0 pb-3">
                  <SectionsDrawer sections={overflow} />
                </li>
              ) : null}
            </ul>

            <div className="hidden w-20 shrink-0 pb-3 group-data-[shrunk=true]/nav:pt-3 sm:flex sm:justify-end">
              <AccountMenu />
            </div>
          </div>
        </nav>

        {breaking?.length ? <BreakingStrip articles={breaking} /> : null}
      </StickyNav>
    </>
  );
}

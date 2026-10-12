"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BREAKING_IN_BAR, BreakingStrip } from "@/components/article/breaking-strip";
import { HeadlineRail } from "@/components/article/headline-rail";
import { SectionMark } from "@/components/site/section-mark";
import { inSentence } from "@/lib/format/section-name";
import { LIVE_HEADLINES_PATH, type LiveHeadlines } from "@/lib/live-headlines";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The parts of every page that change with each new story, read from the one
 * shared file rather than built into the page. See lib/live-headlines for why.
 *
 * One request per page, however many pieces want the file: it is asked for
 * once and every piece waits on the same answer. A reader moving between
 * pages keeps it for a minute, the same minute the file itself is cached for.
 */

const FRESH_FOR_MS = 60_000;

let request: Promise<LiveHeadlines | null> | null = null;
let requestedAt = 0;

function loadLiveHeadlines(): Promise<LiveHeadlines | null> {
  if (!request || Date.now() - requestedAt > FRESH_FOR_MS) {
    requestedAt = Date.now();
    request = fetch(LIVE_HEADLINES_PATH)
      .then((response) => (response.ok ? (response.json() as Promise<LiveHeadlines>) : null))
      .catch(() => null);
  }
  return request;
}

// Asked for as soon as this script runs in the browser, before the page has
// finished starting up, so the banner and the panels can be filled at the
// first chance. (A preload hint in the page's head was tried: the browser
// would not reuse it for this request and fetched the file twice.)
if (typeof window !== "undefined") void loadLiveHeadlines();

function useLiveHeadlines(): LiveHeadlines | null {
  const [live, setLive] = useState<LiveHeadlines | null>(null);

  useEffect(() => {
    let active = true;
    void loadLiveHeadlines().then((data) => {
      if (active) setLive(data);
    });
    return () => {
      active = false;
    };
  }, []);

  return live;
}

/** The breaking banner, without the story the page is already about. */
export function LiveBreakingStrip({ excludeId }: { excludeId?: string }) {
  const live = useLiveHeadlines();
  const articles = (live?.breaking ?? [])
    .filter((article) => article.id !== excludeId)
    .slice(0, BREAKING_IN_BAR);

  return articles.length ? <BreakingStrip articles={articles} /> : null;
}

/** The "Latest" column beside a story, without that story. */
export function LatestRail({ excludeId, title }: { excludeId: string; title: string }) {
  const live = useLiveHeadlines();
  const articles = (live?.latest ?? []).filter((article) => article.id !== excludeId).slice(0, 6);

  return <HeadlineRail articles={articles} title={title} compact />;
}

/**
 * The latest stories, set between a story's paragraphs instead of in a column
 * beside it.
 *
 * A column beside the story was six headlines tall next to an article five
 * times that length, so for most of the read it was an empty margin. Set into
 * the story, a short row of other stories is met at a natural pause in the
 * reading, the way a paper runs a panel across a page between columns of copy.
 *
 * Several of these share one story: `from` and `count` pick which slice of the
 * latest list each shows, so two of them never repeat a story. Read from the
 * shared live file like everything else here, so the story page itself stays
 * cached; it renders nothing until that file arrives, and nothing at all if
 * there is nothing new to show.
 */
export function InlineLatest({
  excludeId,
  from = 0,
  count = 3,
  label = "Latest",
}: {
  excludeId: string;
  from?: number;
  count?: number;
  label?: string;
}) {
  const live = useLiveHeadlines();
  const articles = (live?.latest ?? [])
    .filter((article) => article.id !== excludeId)
    .slice(from, from + count);

  if (!articles.length) return null;

  return (
    <aside aria-label={label} className="tint-panel my-10 rounded-panel px-5 py-5">
      <p className="font-label text-meta font-semibold text-ink">{label}</p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-3 sm:gap-5">
        {articles.map((article) => (
          <li key={article.id} className="min-w-0">
            <Link
              href={`/${article.categories.slug}/${article.slug}`}
              className="flex gap-3 sm:flex-col sm:gap-2"
            >
              <span className="relative block aspect-[16/9] w-28 shrink-0 overflow-hidden rounded-media bg-wash sm:w-full">
                {article.hero_image_url ? (
                  <Image
                    src={cloudinaryImage(article.hero_image_url, "thumb") ?? article.hero_image_url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 112px, 240px"
                    className="object-cover"
                  />
                ) : null}
              </span>
              <span className="line-clamp-3 min-w-0 font-headline text-[0.9375rem] leading-[1.3] font-semibold text-ink">
                {article.headline}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * A section's three latest stories, opened by hovering its name in the strip.
 *
 * Shown by CSS hover on the list item it sits in, with the panel a child of
 * it, so the pointer can travel from the name down into the panel without it
 * closing. The panel is desktop-only: there is no hover on a phone, and a tap
 * there should go to the section rather than open a menu the reader has to
 * dismiss.
 */
export function SectionPeek({
  slug,
  name,
  iconUrl,
}: {
  slug: string;
  name: string;
  iconUrl: string | null;
}) {
  const live = useLiveHeadlines();
  const latest = live?.bySection[slug] ?? [];
  if (!latest.length) return null;

  // Pulled up over the row's last few pixels. The strip is centred against the
  // taller sign-in slot beside it, which leaves a sliver of nav below the names
  // belonging to no item; a pointer crossing it lost the hover and shut the
  // panel. The top padding grows by the same amount, so what a reader sees has
  // not moved — only the hit area.
  return (
    <div className="absolute inset-x-0 top-full -mt-3 z-50 hidden border-t border-hairline bg-paper pt-8 pb-6 shadow-[0_10px_24px_-18px_rgba(20,22,28,0.45)] sm:group-hover:block">
      {/* The ground runs the width of the window; the stories inside it line
          up with the section strip above. */}
      <div className="mx-auto flex max-w-wide items-start px-4 sm:px-6">
        {/* Which section this belongs to. The panel is full width and looks
            identical whichever name opened it, so without this the reader has
            to remember what their pointer was over. */}
        <div className="w-48 shrink-0 pr-6">
          <p className="flex items-center gap-2.5">
            {iconUrl ? <SectionMark src={iconUrl} className="h-8 w-8" /> : null}
            <span className="font-label text-[1rem] font-semibold text-ink">{name}</span>
          </p>
          <Link
            href={`/${slug}`}
            className="mt-2 inline-block text-meta text-accent underline-offset-4 hover:underline"
          >
            More {inSentence(name)}
          </Link>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-3">
          {latest.map((article) => (
            <div key={article.id} className="relative px-6">
              {/* Dashed rather than solid, and in the mid grey rather than the
                  hairline: a hairline this short reads as a smudge, while a
                  solid dark line reads as a border round the story. Inset top
                  and bottom so it separates the columns without ruling a grid
                  around them. */}
              <span
                aria-hidden="true"
                className="absolute top-2 bottom-2 left-0 border-l border-dashed border-muted"
              />
              <Link href={`/${article.categories.slug}/${article.slug}`} className="flex items-start gap-3">
                {article.hero_image_url ? (
                  <span className="relative block h-20 w-28 shrink-0 overflow-hidden rounded-media bg-hairline">
                    <Image
                      src={cloudinaryImage(article.hero_image_url, "card") ?? article.hero_image_url}
                      alt={article.hero_image_alt ?? ""}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  </span>
                ) : null}
                <span className="min-w-0 text-[0.9375rem] leading-[1.3] font-medium text-ink">
                  {article.headline}
                </span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The latest stories as a column of their own, beside a standing page (About,
 * Terms, Privacy and the rest), so a reader who came to check a policy still
 * has the news in view.
 *
 * From the shared live file like everything else here: the policy pages are
 * cached for hours and must never carry a headline baked in at render time.
 * Nothing shows until the file arrives, and nothing at all if it is empty.
 * On a wide screen it is a column; narrower, the same stories run as a grid
 * under the page.
 */
export function NewsColumn({ count = 6 }: { count?: number }) {
  const live = useLiveHeadlines();
  const articles = (live?.latest ?? []).slice(0, count);

  if (!articles.length) return null;

  return (
    // A box of its own, with its label set into the middle of the top line
    // like a tag, so the news reads as a separate panel beside the document
    // rather than as more of it. The stories carry no section label: the tag
    // names the box, and a section name over every headline was clutter.
    <aside
      aria-labelledby="news-column-label"
      className="relative rounded-panel border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-paper))] px-5 pt-9 pb-6"
    >
      <p
        id="news-column-label"
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-control bg-signal px-3.5 py-1 font-label text-meta font-semibold whitespace-nowrap text-white"
      >
        Latest news
      </p>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1 xl:gap-5">
        {articles.map((article) => (
          <li key={article.id} className="min-w-0">
            <Link
              href={`/${article.categories.slug}/${article.slug}`}
              className="group block"
            >
              <span className="relative block aspect-[16/9] w-full overflow-hidden rounded-media bg-wash">
                {article.hero_image_url ? (
                  <Image
                    src={cloudinaryImage(article.hero_image_url, "thumb") ?? article.hero_image_url}
                    alt={article.hero_image_alt ?? ""}
                    fill
                    sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1280px) 33vw, 320px"
                    className="object-cover"
                  />
                ) : null}
              </span>
              <span className="mt-2.5 line-clamp-3 block font-headline text-[1rem] leading-[1.3] font-semibold text-ink">
                {article.headline}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

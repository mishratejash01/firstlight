import Image from "next/image";

import { Crossword } from "@/components/epaper/crossword";
import { Sudoku } from "@/components/epaper/sudoku";
import { WordSearch } from "@/components/epaper/word-search";
import type { EpaperPage } from "@/lib/epaper/compose";
import { formatEditionDate, windowLabel } from "@/lib/epaper/edition";
import type { EditionPuzzles } from "@/lib/epaper/puzzles";
import { briefText, forPrint, openingParagraphs } from "@/lib/epaper/text";
import { renderMarkdown } from "@/lib/format/markdown";
import { cloudinaryImage } from "@/lib/media/transform";
import type { EditionArticle } from "@/lib/queries/epaper";
import { PUBLISHER, SITE_NAME } from "@/lib/site";

/**
 * One page of the e-paper, as a sheet of newsprint.
 *
 * The front carries the nameplate, the edition line and an "Inside" panel of
 * the pages behind it; every other page a running head, as a printed paper
 * does. Then the same three tiers on every page: the lead in full, set in
 * justified columns; two seconds with their opening paragraphs; and briefs.
 *
 * Read like a newspaper, not clicked through like the site: no headline is a
 * link and no story points elsewhere (see lib/epaper/text). The only things
 * that move the reader are the page jumps, in "Inside", the index and the
 * foot of each page, which are how a reader turns to a page.
 *
 * Pictures carry no credit line on the page; the credits are gathered on the
 * last page under "Picture credits", as a printed paper or a book gathers
 * them. Every picture is still credited in full, as its licence requires.
 *
 * Server-rendered and fixed for the edition: nothing here depends on the time
 * it is read, so the whole edition can be cached like any story page.
 */

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function Byline({ story }: { story: EditionArticle }) {
  return (
    <p className="ep-byline">
      {story.authors?.display_name ?? SITE_NAME}
      {story.published_at ? ` · ${timeFormat.format(new Date(story.published_at)).toLowerCase()}` : null}
    </p>
  );
}

function Picture({
  story,
  sizes,
  shape = "ep-pic-wide",
}: {
  story: EditionArticle;
  sizes: string;
  shape?: string;
}) {
  if (!story.hero_image_url) return null;
  return (
    <figure className="ep-figure">
      <div className={`ep-pic ${shape}`}>
        <Image
          src={cloudinaryImage(story.hero_image_url, "hero") ?? story.hero_image_url}
          alt={story.hero_image_alt ?? ""}
          fill
          sizes={sizes}
          className="object-cover"
        />
      </div>
    </figure>
  );
}

function Lead({ story, front }: { story: EditionArticle; front: boolean }) {
  const dek = story.standfirst ?? story.summary;
  return (
    <article className="ep-lead">
      <h2 className={front ? "ep-hed ep-hed-front" : "ep-hed ep-hed-lead"}>{story.headline}</h2>
      {dek ? <p className="ep-dek">{dek}</p> : null}
      <Byline story={story} />
      <Picture story={story} sizes="(max-width: 768px) 100vw, 900px" />
      <div className="ep-body ep-columns">
        {story.body ? renderMarkdown(forPrint(story.body)) : <p>{dek}</p>}
      </div>
    </article>
  );
}

function Second({ story }: { story: EditionArticle }) {
  const opening = openingParagraphs(story.body, 3);
  return (
    <article className="ep-second">
      <Picture story={story} sizes="(max-width: 768px) 100vw, 450px" shape="ep-pic-second" />
      <h3 className="ep-hed ep-hed-second">{story.headline}</h3>
      <Byline story={story} />
      <div className="ep-body">
        {opening ? renderMarkdown(opening) : <p>{story.standfirst ?? story.summary}</p>}
      </div>
    </article>
  );
}

function Brief({ story }: { story: EditionArticle }) {
  return (
    <article className="ep-brief">
      <h4 className="ep-hed ep-hed-brief">{story.headline}</h4>
      <p className="ep-brief-text">{briefText(story.body, story.standfirst ?? story.summary)}</p>
    </article>
  );
}

/**
 * The paper's own advertisement, set at the end of each page's columns so
 * the last column never ends on a blank: a printed paper fills its gaps the
 * same way. The address is the advertising mailbox from PUBLISHER (the
 * general one if that is not set), printed as text: the e-paper has no links.
 */
const AD_LINES = [
  { head: "Advertise with us", text: "Reach readers every morning, in print and online." },
  { head: "Your message here", text: "Put your brand in front of our readers, page by page." },
];

function HouseAd({ number }: { number: number }) {
  const email = PUBLISHER.partnershipsEmail || PUBLISHER.email;
  if (!email) return null;
  const line = AD_LINES[number % AD_LINES.length];
  return (
    <aside className="ep-ad" aria-label="Advertisement">
      <p className="ep-ad-mark">Advertisement</p>
      <p className="ep-ad-head">{line.head}</p>
      <p className="ep-ad-text">{line.text}</p>
      <p className="ep-ad-mail">To advertise, contact {email}</p>
    </aside>
  );
}

/** Every picture the edition prints, with the page it is on, for the credits list. */
function pictureCredits(pages: EpaperPage[]) {
  return pages.flatMap((p) =>
    [p.lead, ...p.seconds]
      .filter((story): story is EditionArticle =>
        Boolean(story?.hero_image_url && story.hero_image_credit),
      )
      .map((story) => ({ page: p.number, story })),
  );
}

/** The puzzles page: the news crossword, sudoku and word search, then yesterday's answers. */
function PuzzlesPage({
  puzzles,
  solutions,
}: {
  puzzles: EditionPuzzles;
  solutions: EditionPuzzles | null;
}) {
  return (
    <div className="ep-puzzles-page">
      <div className="ep-puzzles">
        {puzzles.crossword ? (
          <section className="ep-puzzle ep-puzzle-main" aria-labelledby="ep-crossword-title">
            <h3 id="ep-crossword-title" className="ep-puzzle-title">
              The news crossword
            </h3>
            <p className="ep-puzzle-note">
              Every answer is in today&rsquo;s paper: each clue is a headline with
              the answer left out, and its length in brackets.
            </p>
            <Crossword puzzle={puzzles.crossword} />
          </section>
        ) : null}

        {/* The two square puzzles side by side, under the crossword. */}
        <div className="ep-puzzle-pair">
          <section className="ep-puzzle" aria-labelledby="ep-sudoku-title">
            <h3 id="ep-sudoku-title" className="ep-puzzle-title">
              Sudoku
            </h3>
            <p className="ep-puzzle-note">
              Fill the grid so that every row, column and three-by-three box holds
              each number from 1 to 9 once.
            </p>
            <Sudoku puzzle={puzzles.sudoku} />
          </section>

          {puzzles.wordSearch ? (
            <section className="ep-puzzle" aria-labelledby="ep-wordsearch-title">
              <h3 id="ep-wordsearch-title" className="ep-puzzle-title">
                Word search
              </h3>
              <p className="ep-puzzle-note">
                Names and words from today&rsquo;s stories, hidden across, down,
                diagonally and backwards. Press a word&rsquo;s first letter, then
                its last.
              </p>
              <WordSearch puzzle={puzzles.wordSearch} />
            </section>
          ) : null}
        </div>
      </div>

      {solutions ? (
        <section className="ep-solutions" aria-labelledby="ep-solutions-title">
          <h3 id="ep-solutions-title" className="ep-rail-title">
            Solutions to yesterday&rsquo;s puzzles
          </h3>
          <div className="ep-solutions-grid">
            {solutions.crossword ? (
              <div>
                <p className="ep-puzzle-subhead">Crossword</p>
                <p className="ep-solution-text">
                  <b>Across:</b>{" "}
                  {solutions.crossword.across.map((c) => `${c.number} ${c.answer}`).join(", ")}.{" "}
                  <b>Down:</b>{" "}
                  {solutions.crossword.down.map((c) => `${c.number} ${c.answer}`).join(", ")}.
                </p>
                <HouseAd number={0} />
              </div>
            ) : (
              <HouseAd number={0} />
            )}
            <div>
              <p className="ep-puzzle-subhead">Sudoku</p>
              <div className="ep-sd-mini" aria-label="Yesterday's sudoku solution">
                {solutions.sudoku.solution.map((n, i) => (
                  <span
                    key={i}
                    className={[
                      i % 9 % 3 === 2 && i % 9 < 8 ? "ep-sd-right" : "",
                      Math.floor(i / 9) % 3 === 2 && i < 72 ? "ep-sd-bottom" : "",
                    ].join(" ")}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function stories(page: EpaperPage): EditionArticle[] {
  return [page.lead, ...page.seconds, ...page.briefs].filter(
    (story): story is EditionArticle => Boolean(story),
  );
}

export function EpaperSheet({
  page,
  pages,
  date,
  puzzles,
  solutions,
}: {
  page: EpaperPage;
  pages: EpaperPage[];
  date: string;
  puzzles: EditionPuzzles;
  solutions: EditionPuzzles | null;
}) {
  const front = page.kind === "front";
  const next = pages[page.number] as EpaperPage | undefined;

  return (
    <div className="ep-sheet">
      {front ? (
        <header className="ep-nameplate">
          <Image
            src="/brand/the-india-decade.png"
            alt={SITE_NAME}
            width={1200}
            height={218}
            priority
            className="ep-nameplate-art"
          />
          <div className="ep-edition-line">
            <span>{formatEditionDate(date)}</span>
            <span>Morning edition</span>
            <span>{windowLabel(date)}</span>
          </div>
          {/* What is inside, as a strip under the nameplate rather than a
              column beside the stories: a column that ended before the
              stories did left the rest of the front page empty. */}
          <nav className="ep-inside-strip" aria-label="Inside this edition">
            <span className="ep-inside-label">Inside</span>
            {pages
              .filter((p) => p.kind !== "front")
              .map((p) => (
                <a key={p.number} href={`#page-${p.number}`}>
                  <span className="ep-index-number">{p.number}</span>
                  {p.title}
                </a>
              ))}
          </nav>
        </header>
      ) : (
        <header className="ep-running-head">
          <span>{SITE_NAME}</span>
          <h2 className="ep-page-title">{page.title}</h2>
          <span>
            {formatEditionDate(date)} · Page {page.number}
          </span>
        </header>
      )}

      {page.kind === "puzzles" ? (
        <PuzzlesPage puzzles={puzzles} solutions={solutions} />
      ) : page.kind === "index" ? (
        <div className="ep-index">
          <h2 className="ep-hed ep-hed-lead">In this edition</h2>
          <ol className="ep-index-list">
            {pages
              .filter((p) => p.kind !== "index")
              .map((p) => (
                <li key={p.number} className="ep-index-page">
                  <a href={`#page-${p.number}`} className="ep-index-head">
                    <span className="ep-index-number">{p.number}</span>
                    {p.title}
                  </a>
                  <ul>
                    {p.kind === "puzzles"
                      ? ["The news crossword", "Sudoku", "Word search"].map((name) => (
                          <li key={name}>{name}</li>
                        ))
                      : stories(p).map((story) => <li key={story.id}>{story.headline}</li>)}
                  </ul>
                </li>
              ))}
          </ol>

          {pictureCredits(pages).length ? (
            <section className="ep-credits" aria-labelledby="ep-credits-title">
              <h3 id="ep-credits-title" className="ep-rail-title">
                Picture credits
              </h3>
              <ol>
                {pictureCredits(pages).map(({ page: number, story }) => (
                  <li key={story.id}>
                    <span className="ep-credits-page">Page {number}</span>{" "}
                    <span className="ep-credits-story">{story.headline}:</span>{" "}
                    {story.hero_image_credit}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      ) : (
        // The lead across the full width, its text in balanced columns; then
        // every other story flowing through balanced columns beneath it. Each
        // column ends level with its neighbours whatever the stories' lengths,
        // so no page is left with an empty stretch beside a long one.
        <div className="ep-stories">
          {page.lead ? <Lead story={page.lead} front={front} /> : null}
          {/* With one story or none below the lead there is nothing to
              balance across columns: what there is runs the full width, the
              story's picture beside its text and the advertisement as a
              banner, rather than one narrow column beside an empty one. */}
          <div
            className={`ep-flow ${
              page.seconds.length + page.briefs.length <= 1 ? "ep-flow-solo" : ""
            }`}
          >
            {page.seconds.map((story) => (
              <Second key={story.id} story={story} />
            ))}
            {page.briefs.length ? <p className="ep-flow-label">In brief</p> : null}
            {page.briefs.map((story) => (
              <Brief key={story.id} story={story} />
            ))}
            <HouseAd number={page.number} />
          </div>
        </div>
      )}

      <footer className="ep-sheet-foot">
        <span>Page {page.number}</span>
        {next ? (
          <a href={`#page-${next.number}`} className="ep-next">
            Page {next.number}: {next.title}
          </a>
        ) : (
          <span>End of this edition</span>
        )}
      </footer>
    </div>
  );
}

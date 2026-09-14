import { SITE_NAME } from "@/lib/site";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * The running order for the spoken bulletin.
 *
 * Assembled from copy that is already published — the headline and the
 * standfirst an editor wrote and approved. Nothing here is generated, summarised
 * or rewritten, which is the whole point: the newsroom's rule is that AI never
 * publishes, and a bulletin that had a model write new sentences and then read
 * them aloud to the public would break that rule no matter how good the
 * sentences were. This is a running order over existing stories, the way a
 * newsreader works from copy that has already been subbed.
 *
 * The connectives between stories are the one thing written here, and they are
 * the same class of text as a button label: fixed microcopy carrying no claim
 * about the news. "Also this hour" says nothing that could be wrong.
 */

export type BulletinLine = {
  /** Spoken aloud, and shown on the page as the running order. */
  text: string;
  /** The story this line belongs to, where it belongs to one. */
  article: ArticleCardData | null;
};

/** Words per minute a news read runs at. Broadcast copy sits near 160. */
const WORDS_PER_MINUTE = 160;

/**
 * Connectives, by position in the run. A bulletin that simply lists eight
 * headlines end to end sounds like a list; the same eight with these between
 * them sound like a programme. Kept deliberately empty in most slots — a link
 * before every single story is worse than none at all.
 */
function connective(index: number, total: number, category: string): string {
  if (index === 0) return "";
  if (index === total - 1) return "And finally.";
  if (index === 1) return "Also this hour.";
  if (index === Math.floor(total / 2)) return `Turning to ${category}.`;
  return "";
}

function clockTime(at: Date): string {
  return at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Build the script.
 *
 * Every line is one thing the voice says and one row the page shows, so the
 * running order a reader sees and the words they hear cannot drift apart.
 */
export function buildBulletin(
  articles: ArticleCardData[],
  at: Date = new Date(),
): { lines: BulletinLine[]; words: number; seconds: number } {
  if (!articles.length) return { lines: [], words: 0, seconds: 0 };

  const lines: BulletinLine[] = [
    {
      text: `${SITE_NAME}. The main stories at ${clockTime(at)}.`,
      article: null,
    },
  ];

  articles.forEach((article, index) => {
    const link = connective(index, articles.length, article.categories.name);
    const dek = article.standfirst ?? article.summary;

    // The category is spoken before the headline, the way a bulletin names the
    // desk before the story. It is also the only cue a listener gets that the
    // subject has changed, having no section heading to look at.
    const parts = [
      link,
      `${article.categories.name}.`,
      ensureStop(article.headline),
      dek ? ensureStop(dek) : "",
    ].filter(Boolean);

    lines.push({ text: parts.join(" "), article });
  });

  lines.push({
    text: `That is the bulletin. ${SITE_NAME}, updated through the day.`,
    article: null,
  });

  const words = lines.reduce(
    (total, line) => total + line.text.split(/\s+/).filter(Boolean).length,
    0,
  );

  return {
    lines,
    words,
    // Rounded to the nearest five seconds. Announcing a bulletin as "two
    // minutes and thirty-one seconds" implies a precision that a speech engine
    // running at the device's own rate does not have.
    seconds: Math.round((words / WORDS_PER_MINUTE) * 60 / 5) * 5,
  };
}

/** A headline filed without a full stop still has to be read as a sentence. */
function ensureStop(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** "3 min" / "45 sec", for the page furniture. */
export function formatRunTime(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

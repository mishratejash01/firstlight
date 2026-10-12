/**
 * A topic tag as a reader should see it.
 *
 * Tags are stored in lower case — that is what keeps "Supreme Court" and
 * "supreme court" one tag rather than two — and shown that way they read as
 * a typing error: "rbi", "saudi arabia", "bar council of india". This puts
 * the capitals back for display only; the stored name and the link are
 * untouched.
 *
 * The best source of the right spelling is the story itself: if one of the
 * people or organisations named in it matches the tag, its spelling wins
 * ("Bar Council of India", not "Bar Council Of India"). Otherwise each word is
 * capitalised, the short joining words stay lower case, and the acronyms that
 * Indian news runs on go to capitals. A name that already has a capital in it
 * was cased by a person and is left exactly as written.
 */

const FORMS = new Map<string, string>(
  [
    "ai", "aap", "aiims", "aiadmk", "bci", "bcci", "bjp", "brics", "bse", "bsf",
    "cag", "cbi", "ceo", "cfo", "cji", "cm", "crpf", "dcp", "dgp", "dmk", "drdo",
    "ed", "eu", "ev", "fifa", "fir", "g20", "gdp", "gst", "hc", "ias", "icc",
    "icj", "iim", "iit", "imd", "imf", "ioc", "ipl", "ipo", "ips", "isi", "isro",
    "jee", "jnu", "mla", "mp", "nasa", "nato", "nda", "neet", "nhrc", "nia",
    "nse", "opec", "pil", "pm", "pok", "rbi", "sc", "sebi", "sit", "ssc", "tmc",
    "uae", "uk", "un", "upa", "upi", "upsc", "us", "usa", "who",
  ].map((word) => [word, word.toUpperCase()] as [string, string]),
);
FORMS.set("loc", "LoC");

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "the",
  "to", "vs", "with",
]);

export function displayTagName(name: string, properNames: string[] = []): string {
  const trimmed = name.trim();
  if (trimmed !== trimmed.toLowerCase()) return trimmed;

  const fromStory = properNames.find((proper) => proper.toLowerCase() === trimmed);
  if (fromStory) return fromStory;

  return trimmed
    .split(" ")
    .filter(Boolean)
    .map((word, index) => {
      const known = FORMS.get(word);
      if (known) return known;
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

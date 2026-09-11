import "server-only";

import { v2 as cloudinary } from "cloudinary";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  commonsImage,
  commonsLogo,
  commonsSearchImage,
  commonsSearchTitles,
  findSubjectImage,
  findWikidataItem,
  looksLikeSymbol,
  wikidataUrl,
  wikipediaPageImage,
} from "@/lib/engine/wikidata";
import { cosine, embedTexts } from "@/lib/engine/embeddings";
import {
  attributionFor,
  searchLicensedImage,
  searchLicensedImages,
  type LicensedImage,
} from "./openverse";
import { buildTypographicCard } from "./typographic-card";

/**
 * Gives an article a lead image.
 *
 * Order of preference:
 *   1. The Commons portrait of the person the story is about, resolved
 *      through Wikidata so it is that exact person, credited.
 *   1a. The logo of the company the story is about, padded on a plain ground.
 *   1b. The scene the writer asked for, found on Commons or open stock and
 *       ranked by meaning against the brief.
 *   1c. The Commons picture of an institution, work or place the story is
 *       about. Usually a building; correct, but further from the story.
 *   2. The lead image of the subject's Wikipedia article.
 *   3. A Commons file whose own title names the subject.
 *   4. Open stock of a place or a specific multi-word subject, accepted only
 *      when the photo's title confirms it.
 *   5. A place or institution the story mentions, resolved the same way and
 *      captioned with its own name.
 *   6. A generated typographic card.
 *
 * There is deliberately no seventh option. The photograph from the article we
 * read is not available to us — it belongs to the outlet or their agency — and
 * a synthesised photorealistic image of a real event is fabrication whatever
 * the caption says.
 *
 * Everything chosen is copied into our own Cloudinary account rather than
 * hotlinked. Hotlinking spends someone else's bandwidth and breaks the moment
 * they move the file, which on a news page means an article with a hole in it.
 */

export type Illustration = {
  url: string;
  alt: string;
  credit: string;
  kind: "photo" | "card";
  /** Wikidata identities resolved along the way, to record against our entities. */
  sameAs: { name: string; url: string }[];
};

function configureCloudinary(): boolean {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return false;

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return true;
}

async function uploadRemote(
  sourceUrl: string,
  folder: string,
  options: { pad?: boolean } = {},
): Promise<{ url: string; publicId: string; bytes: number } | null> {
  try {
    const result = await cloudinary.uploader.upload(sourceUrl, {
      folder,
      resource_type: "image",
      quality: "auto",
      fetch_format: "auto",
      // Photographs are cropped to the shape every card and hero on the site
      // expects. A logo is never cropped: it is scaled to sit in the middle
      // of that shape on a plain ground, the way a paper runs a company mark.
      transformation: options.pad
        ? [
            { width: 760, height: 430, crop: "fit" },
            { width: 1600, height: 900, crop: "pad", background: "#F4F4F5" },
          ]
        : [{ width: 1600, height: 900, crop: "fill", gravity: "auto" }],
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes ?? 0,
    };
  } catch (error) {
    console.error("[illustrate] upload failed", error);
    return null;
  }
}

async function uploadSvg(
  svg: string,
  folder: string,
): Promise<{ url: string; publicId: string; bytes: number } | null> {
  try {
    // Cloudinary rasterises SVG on upload, so the delivered asset is a normal
    // image rather than markup the browser has to trust.
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
      format: "png",
      quality: "auto",
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes ?? 0,
    };
  } catch (error) {
    console.error("[illustrate] card upload failed", error);
    return null;
  }
}

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? fallback;
}

/**
 * Which subjects may be illustrated with a stock photograph, and which may not.
 *
 * Places only — and this restriction was earned. Keyword search across a stock
 * library collides constantly, and on news the failure is not a missing picture
 * but a confidently wrong one:
 *
 *   "Jackson"              -> a Michael Jackson photo, on a story about the
 *                             death of a Black woman in Jackson, Mississippi
 *   "Metropolitan Police"  -> Las Vegas Metropolitan Police, on a UK story
 *   "Napoli"               -> a religious procession, on a footballer's surgery
 *
 * A picture that appears to show the story but does not is worse than no
 * picture, and the first of those is indefensible under any masthead.
 *
 * Geography is the exception that holds up: a photograph captioned "Strait of
 * Hormuz" is the Strait of Hormuz, and it does not misidentify anybody. People,
 * organisations and events all fail — a stock portrait is usually the wrong
 * person, and an organisation's name is rarely unique.
 */
/**
 * A brief is usable when it is what it is meant to be: a scene without a
 * person in it. Geography is allowed — "monsoon flooding in a Delhi street"
 * is a better search than the same without Delhi, and a place cannot be the
 * wrong person. The story's own people are the names that must not appear.
 */
function usableBrief(
  brief: string | null | undefined,
  subjects: { name: string; type: string }[],
): string | null {
  const text = (brief ?? "").trim().replace(/[."']/g, "");
  if (text.split(/\s+/).length < 2 || text.length > 90) return null;
  const lower = text.toLowerCase();
  const people = subjects.filter((subject) => subject.type === "Person");
  if (people.some((person) => lower.includes(person.name.toLowerCase()))) return null;
  // A surname alone is enough to be a person.
  if (people.some((person) => person.name.split(/\s+/).some((part) => part.length > 3 && lower.includes(part.toLowerCase())))) return null;
  return lower;
}

/**
 * A picture of the scene the writer described.
 *
 * Word rules kept failing in both directions: a skua on an ice floe passed
 * on "arctic", a Delhi flood photograph failed for not saying "street". The
 * engine's own embedding function judges meaning instead. Candidates are
 * gathered from several queries — the scene, its two core words, and the
 * story's place with each core word — and ranked by similarity between
 * their titles and the brief. Measured on the pictures that had gone right
 * and wrong: right ones scored 0.85 to 0.93, wrong ones 0.70 to 0.83. The
 * best candidate wins only if it clears 0.82; otherwise there is no scene.
 */
const SCENE_SIMILARITY = 0.82;

/**
 * A scene must be nameless, so a candidate whose title names a person is
 * not a scene. Official photo libraries title their portraits exactly this
 * way — "The Union Minister for Heavy Industries, Shri …" — and one turned
 * up for "Delhi heavy".
 */
function looksLikePersonPhoto(title: string | null): boolean {
  if (!title) return false;
  return /\b(minister|ministry|secretary|president|chairman|chairperson|commissioner|governor|director|officer|chief|ceo|md|mla|mp|shri|smt|dr|mr|mrs|ms|sir|hon|addressing|addresses|meeting|meets|inaugurat|felicitat|press conference|with the)\b/i.test(
    title,
  );
}

async function sceneImage(
  scene: string,
  places: string[] = [],
  terms: string | null = null,
): Promise<LicensedImage | null> {
  const content = scene.split(/\s+/).filter((word) => word.length > 3);
  if (content.length < 2) return null;
  const core = [...content].sort((a, b) => b.length - a.length).slice(0, 2);

  // The writer's plain terms are the best query of all: libraries index
  // "stock market", not "trading terminal screens showing falling prices".
  const plainTerms = (terms ?? "")
    .toLowerCase()
    .split(/[,;/]/)
    .map((term) => term.replace(/[^a-z0-9 ]/g, " ").trim())
    .filter((term) => term.length > 2)
    .slice(0, 3);
  const queries = new Set<string>([...plainTerms, scene, core.join(" ")]);
  for (const place of places.slice(0, 1)) for (const term of plainTerms.slice(0, 1)) queries.add(`${place} ${term}`);
  for (const place of places.slice(0, 2)) for (const word of core) queries.add(`${place} ${word}`);

  type Candidate = { title: string; commonsFile?: string; stock?: LicensedImage & { tags: string[] } };
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const consider = (candidate: Candidate) => {
    const key = candidate.title.toLowerCase();
    if (seen.has(key) || looksLikeSymbol(candidate.title) || looksLikePersonPhoto(candidate.title)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const query of queries) {
    for (const file of await commonsSearchTitles(query, 6)) {
      consider({ title: file.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "), commonsFile: file });
    }
    for (const stock of await searchLicensedImages(query, 6)) {
      if (stock.title) consider({ title: stock.title, stock });
    }
  }
  if (!candidates.length) return null;

  // Similarity is measured against the scene itself. Folding the place into
  // the target let the place take over: a California drone factory matched a
  // California sequoia. The place decides order among candidates that
  // already look like the scene, nothing more.
  const vectors = await embedTexts([scene, ...candidates.map((c) => c.title)]);
  const targetVector = vectors[0];
  if (!targetVector) return null;

  const placeTokens = places
    .map((place) => [...place.split(/\s+/)].sort((a, b) => b.length - a.length)[0].toLowerCase())
    .filter((token) => token.length >= 4);
  const mentionsPlace = (title: string) =>
    placeTokens.some((token) => title.toLowerCase().includes(token)) ? 1 : 0;

  const ranked = candidates
    .map((candidate, index) => ({
      candidate,
      similarity: vectors[index + 1] ? cosine(targetVector, vectors[index + 1] as number[]) : 0,
    }))
    .filter((entry) => entry.similarity >= SCENE_SIMILARITY)
    .sort(
      (a, b) =>
        mentionsPlace(b.candidate.title) - mentionsPlace(a.candidate.title) ||
        b.similarity - a.similarity,
    );

  for (const { candidate } of ranked.slice(0, 4)) {
    if (candidate.stock) return candidate.stock;
    if (candidate.commonsFile) {
      const image = await commonsImage(candidate.commonsFile);
      if (image) return image;
    }
  }
  return null;
}


/** Subject types whose logo is the right picture for a story about them. */
const LOGO_TYPES = new Set(["Organization", "Corporation", "SportsTeam", "Brand"]);

/** Subject types with a specific identity that a name search can confirm. */
const SEARCHABLE_TYPES = new Set([
  "Place",
  "Organization",
  "GovernmentOrganization",
  "CreativeWork",
  "SportsTeam",
  "EducationalOrganization",
  "Corporation",
]);

function photoCandidates(
  subjects: { name: string; type: string }[],
): string[] {
  return subjects
    .filter((subject) => subject.type === "Place")
    .map((subject) => subject.name.trim())
    .filter((name) => name.length > 3)
    .slice(0, 3);
}

/**
 * Does the image actually appear to be of the thing we searched for?
 *
 * Openverse ranks by relevance, not by whether the title matches, so the top
 * result for "Jackson" is whatever is most popular rather than whatever is
 * correct. Requiring the place name in the image's own title is a blunt check
 * that catches every collision above.
 */
function titleConfirmsSubject(title: string | null, subject: string): boolean {
  if (!title) return false;

  const haystack = title.toLowerCase();
  const words = subject
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3);

  if (!words.length) return false;
  // Every distinctive word of the place must appear: "Strait of Hormuz" needs
  // both "strait" and "hormuz", so "Hormuz Island" alone would not pass.
  return words.every((word) => haystack.includes(word));
}

export async function illustrateArticle({
  headline,
  section,
  subjects,
  related = [],
  brief = null,
  terms = null,
  relevantOnly = false,
  uploadedBy,
}: {
  headline: string;
  section: string;
  /** What the story is about, in the drafter's order. */
  subjects: { name: string; type: string }[];
  /** Places and organisations the story mentions; tried only after the subjects fail. */
  related?: { name: string; type: string }[];
  /** The scene the writer asked for: generic, nameless, e.g. "hospital consultation room". */
  brief?: string | null;
  /** The writer's plain library terms for the same picture, e.g. "stock market". */
  terms?: string | null;
  /** Stop after the relevant tiers — subject identity and the brief — rather than falling back. */
  relevantOnly?: boolean;
  uploadedBy?: string | null;
}): Promise<Illustration | null> {
  if (!configureCloudinary()) return null;

  const enabled = await readSetting<boolean>("illustration_enabled", true);
  if (!enabled) return null;

  const allowPhotos = await readSetting<boolean>("illustration_allow_photos", true);
  const supabase = createAdminClient();

  const sameAs: { name: string; url: string }[] = [];

  /** Copies a licensed image into our own account and records it. */
  const publish = async (
    image: LicensedImage,
    alt: string,
    options: { pad?: boolean } = {},
  ): Promise<Illustration | null> => {
    const uploaded = await uploadRemote(image.url, "newswebsite/illustrations", options);
    if (!uploaded) return null;

    const credit = attributionFor(image);
    await supabase.from("media_assets").insert({
      public_id: uploaded.publicId,
      secure_url: uploaded.url,
      resource_type: "image",
      bytes: uploaded.bytes,
      // The subject, not the headline: alt text describes the picture, not
      // the story it illustrates.
      alt_text: alt,
      credit,
      licence: image.licence,
      licence_url: image.licenceUrl,
      creator: image.creator,
      source_url: image.sourceUrl,
      provider: image.provider,
      uploaded_by: uploadedBy ?? null,
    });

    return { url: uploaded.url, alt, credit, kind: "photo", sameAs };
  };

  if (allowPhotos) {
    // The subjects the drafter said the story is about, in its order: the
    // first is usually the main one.
    const named = subjects
      .map((subject) => ({ name: subject.name.trim(), type: subject.type }))
      .filter((subject) => subject.name.length > 2)
      .slice(0, 4);

    const isPlace = (type: string) => type === "Place";

    // Tier one: the picture Wikipedia's editors chose for that exact subject.
    // Identity is resolved by name and type on Wikidata, so this is the one
    // route where the picture cannot be of a different Jackson. Every
    // subject type qualifies — a court, a village, a tapestry, a charity —
    // not only people. Measured on the stories that had ended up as cards,
    // this alone would have illustrated eight of twelve subjects.
    // Only a person's own portrait outranks the scene the writer asked for.
    // An institution's Wikidata picture is nearly always its building, and a
    // building is the wrong picture for almost any story about what the
    // institution did: OpenAI's model launch got its San Francisco office.
    // So people first, then the scene, then institutions and works, then
    // places — each correctly identified, each further from the story.
    const peopleFirst = named.filter((subject) => subject.type === "Person");
    const institutionsLater = named.filter(
      (subject) => subject.type !== "Person" && !isPlace(subject.type),
    );
    const placesLater = named.filter((subject) => isPlace(subject.type));

    for (const subject of peopleFirst) {
      const found = await findSubjectImage(subject.name, subject.type);
      if (!found) continue;
      sameAs.push({ name: subject.name, url: wikidataUrl(found.match.qid) });
      if (!found.image) continue;
      const published = await publish(found.image, found.match.label);
      if (published) return published;
    }

    // A company's own mark, for a story about the company's own doing. The
    // desk asked for this in so many words: a model launch is better served
    // by the lab's logo than by a picture of its office or a server rack.
    for (const subject of named.filter((s) => LOGO_TYPES.has(s.type)).slice(0, 2)) {
      const item = await findWikidataItem(subject.name, subject.type);
      if (!item) continue;
      sameAs.push({ name: subject.name, url: wikidataUrl(item.qid) });
      const logo = await commonsLogo(item.qid);
      if (!logo) continue;
      const published = await publish(logo, `${item.label} logo`, { pad: true });
      if (published) return published;
    }

    // The scene the writer asked for. Generic by rule, so a keyword search
    // cannot land on the wrong person; relevant by construction, because the
    // writer described the story rather than a name in it.
    const scene = usableBrief(brief, named);
    if (scene) {
      // The story's places, subjects first. "Delhi rain" finds Delhi in the
      // rain; "heavy rain flooded city street" found a lane in Somerset.
      const places = [...named, ...related]
        .filter((subject) => isPlace(subject.type))
        .map((subject) => subject.name.trim())
        .filter((name, index, all) => name.length > 2 && all.indexOf(name) === index)
        .slice(0, 2);
      const candidate = await sceneImage(scene, places, terms);
      if (candidate) {
        const published = await publish(candidate, `${scene} (file image)`);
        if (published) return published;
      }
    }

    // Everything below is a stand-in: a place, a mention, a card. A caller
    // redoing pictures keeps what it has rather than swap one stand-in for
    // another.
    if (relevantOnly) return null;

    for (const subject of [...institutionsLater, ...placesLater]) {
      const found = await findSubjectImage(subject.name, subject.type);
      if (!found) continue;
      sameAs.push({ name: subject.name, url: wikidataUrl(found.match.qid) });
      if (!found.image) continue;
      const published = await publish(found.image, found.match.label);
      if (published) return published;
    }

    // Tier two: the lead image of the subject's Wikipedia article, for
    // subjects with a page but no Wikidata claim. The page title must match
    // the name, which is what makes this safe for people too: the lead image
    // on "Chris Johnson (running back)" is that Chris Johnson.
    for (const subject of named) {
      const image = await wikipediaPageImage(subject.name);
      if (!image) continue;
      const published = await publish(image, subject.name);
      if (published) return published;
    }

    // Search tiers only run for things that have a specific identity — a
    // place, an institution, a work. A generic noun the drafter typed as a
    // product or event ("Sub-Inspector") matches any file with the word in
    // it, which is how an Indian recruitment story got a Malaysian policeman.
    const searchable = (type: string) => SEARCHABLE_TYPES.has(type);

    // Tier three: a Commons file whose own title carries the subject's name.
    for (const subject of named) {
      if (!searchable(subject.type)) continue;
      const image = await commonsSearchImage(subject.name);
      if (!image) continue;
      const published = await publish(image, image.title ?? subject.name);
      if (published) return published;
    }

    // Tier four: open stock, for places and for specific multi-word subjects,
    // accepted only when the photo's own title confirms the subject. Single
    // common words are still excluded: that is where the collisions live.
    const stockQueries = [
      ...photoCandidates(subjects),
      ...named
        .filter((subject) => searchable(subject.type) && subject.name.split(/\s+/).length >= 2)
        .map((subject) => subject.name),
    ].filter((query, index, all) => all.indexOf(query) === index);

    for (const query of stockQueries) {
      const candidate = await searchLicensedImage(query);
      if (
        candidate &&
        titleConfirmsSubject(candidate.title, query) &&
        !looksLikeSymbol(candidate.title ?? "")
      ) {
        const published = await publish(candidate, candidate.title ?? query);
        if (published) return published;
      }
    }

    // Tier five: a place or institution the story mentions — the university
    // behind a study, the city where a scholar lived, the bank whose rate
    // moved. Identity-resolved like the subjects, and captioned with its own
    // name, so the reader is told what the picture shows rather than led to
    // believe it is the event itself. Every story that still ended up as a
    // card had one of these.
    const mentioned = related
      .map((subject) => ({ name: subject.name.trim(), type: subject.type }))
      .filter(
        (subject) =>
          subject.name.length > 2 &&
          searchable(subject.type) &&
          !named.some((n) => n.name === subject.name),
      )
      .slice(0, 3);

    for (const subject of mentioned) {
      // A mentioned company's mark before its building, for the same reason
      // as above: a story about people leaving the labs is better served by
      // a lab's logo than by its office block.
      if (LOGO_TYPES.has(subject.type)) {
        const item = await findWikidataItem(subject.name, subject.type);
        if (item) {
          sameAs.push({ name: subject.name, url: wikidataUrl(item.qid) });
          const logo = await commonsLogo(item.qid);
          if (logo) {
            const published = await publish(logo, `${item.label} logo`, { pad: true });
            if (published) return published;
          }
        }
      }
      // Identity-resolved only. A name search for a passing mention is where
      // "Mocha", the port, became a cup of coffee.
      const found = await findSubjectImage(subject.name, subject.type);
      if (found?.image) {
        const published = await publish(found.image, found.match.label);
        if (published) return published;
      }
    }
  }

  // Nothing suitable and licensed. A generated card is honest about being a
  // graphic; a generated photograph would not be.
  const svg = buildTypographicCard({ headline, section });
  const uploaded = await uploadSvg(svg, "newswebsite/cards");
  if (!uploaded) return null;

  await supabase.from("media_assets").insert({
    public_id: uploaded.publicId,
    secure_url: uploaded.url,
    resource_type: "image",
    bytes: uploaded.bytes,
    alt_text: `${section}: ${headline}`,
    credit: "The Federal Post",
    provider: "generated",
    uploaded_by: uploadedBy ?? null,
  });

  return {
    url: uploaded.url,
    // Says what it is. A screen reader user should not be told this is a
    // photograph of the event.
    alt: `${section} — ${headline}`,
    credit: "The Federal Post",
    kind: "card",
    sameAs,
  };
}

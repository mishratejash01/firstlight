import "server-only";

import { v2 as cloudinary } from "cloudinary";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  commonsSearchImage,
  findSubjectImage,
  looksLikeSymbol,
  wikidataUrl,
  wikipediaPageImage,
} from "@/lib/engine/wikidata";
import { attributionFor, searchLicensedImage, type LicensedImage } from "./openverse";
import { buildTypographicCard } from "./typographic-card";

/**
 * Gives an article a lead image.
 *
 * Order of preference:
 *   1. The Wikimedia Commons picture of whatever the story is about — a
 *      person, a court, a village, an artwork — resolved through Wikidata so
 *      it is that exact subject, credited.
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
): Promise<{ url: string; publicId: string; bytes: number } | null> {
  try {
    const result = await cloudinary.uploader.upload(sourceUrl, {
      folder,
      resource_type: "image",
      quality: "auto",
      fetch_format: "auto",
      // Crop to the shape every card and hero on the site expects, rather than
      // letting a 3:2 photograph decide the layout.
      transformation: [{ width: 1600, height: 900, crop: "fill", gravity: "auto" }],
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
  uploadedBy,
}: {
  headline: string;
  section: string;
  /** What the story is about, in the drafter's order. */
  subjects: { name: string; type: string }[];
  /** Places and organisations the story mentions; tried only after the subjects fail. */
  related?: { name: string; type: string }[];
  uploadedBy?: string | null;
}): Promise<Illustration | null> {
  if (!configureCloudinary()) return null;

  const enabled = await readSetting<boolean>("illustration_enabled", true);
  if (!enabled) return null;

  const allowPhotos = await readSetting<boolean>("illustration_allow_photos", true);
  const supabase = createAdminClient();

  const sameAs: { name: string; url: string }[] = [];

  /** Copies a licensed image into our own account and records it. */
  const publish = async (image: LicensedImage, alt: string): Promise<Illustration | null> => {
    const uploaded = await uploadRemote(image.url, "newswebsite/illustrations");
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

    // Tier one: the picture Wikipedia's editors chose for that exact subject.
    // Identity is resolved by name and type on Wikidata, so this is the one
    // route where the picture cannot be of a different Jackson. Every
    // subject type qualifies — a court, a village, a tapestry, a charity —
    // not only people. Measured on the stories that had ended up as cards,
    // this alone would have illustrated eight of twelve subjects.
    for (const subject of named) {
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
      const found = await findSubjectImage(subject.name, subject.type);
      if (found?.image) {
        const published = await publish(found.image, found.match.label);
        if (published) return published;
      }
      const image = (await wikipediaPageImage(subject.name)) ?? (await commonsSearchImage(subject.name));
      if (image) {
        const published = await publish(image, image.title ?? subject.name);
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

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { CRAWLER_USER_AGENT } from "@/lib/site";
import type { LicensedImage } from "@/lib/media/openverse";

/**
 * Pictures of people and organisations, from the one place where identity is
 * not a keyword match.
 *
 * Stock search fails on people because "Jackson" matches every Jackson. A
 * Wikidata item is a specific person: the search resolves a name to an item,
 * the item's type confirms it is the kind of thing we expected (a human, an
 * organisation), and its P18 property is the picture the Wikipedia community
 * has chosen for that exact subject. The file's licence is then read from
 * Commons and only open licences are accepted.
 *
 * Also yields the item's identifier, which is recorded against our entity as
 * a `sameAs` link — the thing search engines use to know that our "Narendra
 * Modi" is the Narendra Modi.
 */

const UA = CRAWLER_USER_AGENT;

/**
 * Licences we will publish under. Everything else on Commons is declined.
 * Government open licences are common on official portraits — the UK's OGL,
 * India's GODL — and are attribution licences like CC BY.
 */
const OPEN_LICENCES =
  /^(cc0|cc[ -]by(-sa)?[ -]?\d?(\.\d)?|public domain|pd|ogl|godl|open government licen[cs]e|attribution)/i;

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

type Entity = {
  id: string;
  labels?: { en?: { value: string } };
  descriptions?: { en?: { value: string } };
  claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>;
};

function claimValues(entity: Entity, property: string): unknown[] {
  return (entity.claims?.[property] ?? [])
    .map((claim) => claim.mainsnak.datavalue?.value)
    .filter((value) => value !== undefined);
}

function instanceIds(entity: Entity): string[] {
  return claimValues(entity, "P31")
    .map((value) => (value as { id?: string }).id)
    .filter((id): id is string => Boolean(id));
}

export type WikidataMatch = {
  qid: string;
  label: string;
  description: string | null;
  imageFile: string | null;
};

/**
 * Resolves a name to a Wikidata item of the expected type.
 *
 * Several candidates are fetched and the first whose instance-of matches the
 * type wins, so "Mercury" asked for as a Person does not come back as the
 * planet. Nothing is returned when no candidate is of the right type, which
 * is the correct answer more often than any guess.
 */
/**
 * The forms of a name worth searching. Drafts write "Prince Rahim Aga Khan V"
 * and "Dr Manmohan Singh"; Wikidata labels are "Rahim Aga Khan" and
 * "Manmohan Singh". Honorifics and regnal numerals come off for the retry.
 */
function nameVariants(name: string): string[] {
  const variants = [name];
  const stripped = name
    .replace(/^(?:prince|princess|king|queen|sir|dame|lord|lady|dr\.?|mr\.?|mrs\.?|ms\.?|justice|general|president|prime minister)\s+/i, "")
    .replace(/\s+(?:[IVX]{1,4})$/i, "")
    .trim();
  if (stripped && stripped !== name) variants.push(stripped);
  return variants;
}

export async function findWikidataItem(
  name: string,
  type: string,
  context?: string,
): Promise<WikidataMatch | null> {
  const wantHuman = type === "Person";
  const target = normaliseName(name);
  const contextWords = new Set(
    normaliseName(context ?? "")
      .split(" ")
      .filter((word) => word.length > 3),
  );

  let ids: string[] = [];
  for (const variant of nameVariants(name)) {
    const search = await getJson<{ search?: { id: string }[] }>(
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&type=item&limit=5&format=json&search=" +
        encodeURIComponent(variant),
    );
    ids = (search?.search ?? []).map((hit) => hit.id);
    if (ids.length) break;
  }
  if (!ids.length) return null;

  const entities = await getJson<{ entities?: Record<string, Entity & { aliases?: { en?: { value: string }[] } }> }>(
    "https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels|descriptions|claims|aliases&languages=en&format=json&ids=" +
      ids.join("|"),
  );

  for (const id of ids) {
    const entity = entities?.entities?.[id];
    if (!entity) continue;
    const instances = instanceIds(entity);
    const isHuman = instances.includes("Q5");
    const isDisambiguation = instances.includes("Q4167410");
    if (isDisambiguation) continue;

    if (wantHuman) {
      // A person must be a human, must be called exactly this — the search
      // is fuzzy and "Saurav Das" once came back as "Sourav Das", a different
      // man — and, where the story gives any context, must be the kind of
      // person the story is about: an activist's story does not get the
      // portrait of an actor who shares the name.
      if (!isHuman) continue;
      const label = entity.labels?.en?.value ?? "";
      const aliases = (entity.aliases?.en ?? []).map((a) => a.value);
      if (![label, ...aliases].map(normaliseName).includes(target)) continue;
      if (contextWords.size) {
        const description = normaliseName(entity.descriptions?.en?.value ?? "");
        const shares = description.split(" ").some((word) => word.length > 3 && contextWords.has(word));
        if (!shares) continue;
      }
    } else {
      // Anything else must not be a human, and must actually be called what
      // we asked for: the search is fuzzy, the identity must not be.
      if (isHuman) continue;
      const label = entity.labels?.en?.value ?? "";
      const aliases = (entity.aliases?.en ?? []).map((a) => a.value);
      const names = [label, ...aliases].map(normaliseName);
      if (!names.includes(target) && !normaliseName(label).includes(target)) continue;

      // An acronym is not a word that happens to spell the same: "MIRA", an
      // organisation, resolved to Mira, a town near Venice, on a case-blind
      // match. A short all-caps name must match an all-caps label or alias.
      const isAcronym = /^[A-Z0-9&.]{2,6}$/.test(name.trim());
      if (isAcronym && ![label, ...aliases].some((n) => n === name.trim())) continue;

      // And the kind of thing must agree with what the drafter said it was,
      // judged positively from Wikidata's own description. "TAR" the startup
      // resolved to The Amazing Race through an alias; "Mocha" the port
      // resolved to the coffee. A place has to read as a place, a company as
      // a company, a work as a work; anything else is a different thing with
      // the same name.
      const description = (entity.descriptions?.en?.value ?? "").toLowerCase();
      const kind = kindOf(description);
      const wanted = wantedKind(type);
      if (wanted && kind !== wanted) continue;
    }

    const image = claimValues(entity, "P18")[0];
    return {
      qid: id,
      label: entity.labels?.en?.value ?? name,
      description: entity.descriptions?.en?.value ?? null,
      imageFile: typeof image === "string" ? image : null,
    };
  }

  return null;
}

type Kind = "place" | "organisation" | "work" | "other";

/** What Wikidata's one-line description says a thing is. */
function kindOf(description: string): Kind {
  if (
    /\b(town|city|village|municipality|comune|commune|hamlet|settlement|capital|port|river|lake|sea|strait|bay|mountain|island|district|county|province|state|region|country|neighbou?rhood|street|road|building|stadium|airport|station|park|square|temple|museum|university campus)\b/.test(
      description,
    )
  ) {
    return "place";
  }
  if (
    /\b(company|corporation|firm|business|startup|manufacturer|developer|bank|organization|organisation|agency|institute|institution|laboratory|university|college|school|hospital|club|team|party|charity|foundation|network|group|alliance|association|federation|league|ministry|department|commission|court|police|force|authority|council|newspaper|magazine|publisher|broadcaster|website|label)\b/.test(
      description,
    )
  ) {
    return "organisation";
  }
  if (
    /\b(film|movie|television series|tv series|reality (television|tv)|show|album|song|single|novel|book|poem|painting|tapestry|artwork|sculpture|video game|software|language model|model|programme|program)\b/.test(
      description,
    )
  ) {
    return "work";
  }
  return "other";
}

/** The kind the drafter's type implies, or null when the type is too loose to check. */
function wantedKind(type: string): Kind | null {
  if (type === "Place") return "place";
  if (["Organization", "Corporation", "GovernmentOrganization", "SportsTeam", "EducationalOrganization", "Brand"].includes(type)) {
    return "organisation";
  }
  if (type === "CreativeWork" || type === "Product") return "work";
  return null;
}

function normaliseName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u202a-\u202e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Files that are pictures of a symbol rather than of the thing: a logo, a
 * flag, a seal, a map, a vector emblem. Correct identity, wrong picture.
 */
const NOT_A_PHOTOGRAPH = /(logo|emblem|seal|flag|coat[_ ]of[_ ]arms|\bmaps?\b|bioregion|diagram|chart|satellite|landsat|sentinel-|insignia|icon|wordmark|banner|montage|collage)/i;

export function looksLikeSymbol(fileName: string): boolean {
  return /\.(svg|gif)$/i.test(fileName) || NOT_A_PHOTOGRAPH.test(fileName);
}

type ImageInfo = {
  query?: {
    pages?: Record<
      string,
      {
        title: string;
        imageinfo?: {
          url: string;
          thumburl?: string;
          thumbwidth?: number;
          thumbheight?: number;
          width: number;
          height: number;
          descriptionurl: string;
          extmetadata?: Record<string, { value: string }>;
        }[];
      }
    >;
  };
};

function stripHtml(value: string | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * The Commons file behind a P18 claim, with its licence, or null if the
 * licence is not one we publish under.
 */
export async function commonsImage(fileName: string): Promise<LicensedImage | null> {
  if (looksLikeSymbol(fileName)) return null;

  const data = await getJson<ImageInfo>(
    "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600&format=json&titles=" +
      encodeURIComponent(`File:${fileName}`),
  );

  const page = Object.values(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;

  const meta = info.extmetadata ?? {};
  const licence = stripHtml(meta.LicenseShortName?.value) ?? "";
  if (!OPEN_LICENCES.test(licence)) return null;

  // The file name is not the only place a logo announces itself.
  const objectName = stripHtml(meta.ObjectName?.value) ?? "";
  if (looksLikeSymbol(objectName)) return null;

  // Portraits under 600px wide look like thumbnails at hero size.
  if (info.width < 600) return null;

  return {
    url: info.thumburl ?? info.url,
    title: stripHtml(meta.ObjectName?.value) ?? page.title.replace(/^File:/, ""),
    creator: stripHtml(meta.Artist?.value),
    licence,
    licenceUrl: stripHtml(meta.LicenseUrl?.value),
    sourceUrl: info.descriptionurl,
    provider: "wikimedia_commons",
    width: info.thumbwidth ?? info.width,
    height: info.thumbheight ?? info.height,
  };
}

/**
 * The organisation's logo, from its Wikidata claim, as a Commons file.
 *
 * Logos are refused everywhere else in the illustrator because a logo is
 * the wrong picture for a story about a place or a person. For a story
 * about a company's own doing — a model it launched, money it raised — the
 * logo is the honest picture, and the desk asked for it. Only open licences
 * are accepted; a vector file is served as the rendered PNG Commons makes.
 */
export async function commonsLogo(qid: string): Promise<LicensedImage | null> {
  const entities = await getJson<{ entities?: Record<string, Entity> }>(
    "https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=" + qid,
  );
  const file = claimValues(entities?.entities?.[qid] ?? { id: qid }, "P154")[0];
  if (typeof file !== "string") return null;

  const data = await getJson<ImageInfo>(
    "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1200&format=json&titles=" +
      encodeURIComponent(`File:${file}`),
  );
  const page = Object.values(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;

  const meta = info.extmetadata ?? {};
  const licence = stripHtml(meta.LicenseShortName?.value) ?? "";
  if (!/^(cc0|cc[ -]by(-sa)?[ -]?\d?(\.\d)?|public domain|pd|mit|apache)/i.test(licence)) return null;
  if (info.width < 256) return null;

  return {
    url: info.thumburl ?? info.url,
    title: file.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "),
    creator: stripHtml(meta.Artist?.value),
    licence,
    licenceUrl: stripHtml(meta.LicenseUrl?.value),
    sourceUrl: info.descriptionurl,
    provider: "wikimedia_commons",
    width: info.thumbwidth ?? info.width,
    height: info.thumbheight ?? info.height,
  };
}

export type SubjectImage = { match: WikidataMatch; image: LicensedImage | null };

/**
 * Resolves a named person or organisation and, where Wikidata has one under
 * an open licence, their picture. The match is returned even without a
 * picture: the identity is worth recording on its own.
 */
export async function findSubjectImage(
  name: string,
  type: string,
  context?: string,
): Promise<SubjectImage | null> {
  const match = await findWikidataItem(name, type, context);
  if (!match) return null;

  const image = match.imageFile ? await commonsImage(match.imageFile) : null;
  return { match, image };
}

export function wikidataUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}

/**
 * The lead image of the Wikipedia article about a subject.
 *
 * Usually the same file as the Wikidata claim, but Wikipedia's search is more
 * forgiving of how a drafter phrases a name, and some subjects have a page
 * image without a Wikidata claim. The page title has to match the name, so
 * "Chilime" resolving to "Chilime Hydropower Plant" is accepted and "Jackson"
 * resolving to a singer is not.
 */
export async function wikipediaPageImage(name: string): Promise<LicensedImage | null> {
  const data = await getJson<{
    query?: { pages?: Record<string, { title: string; pageimage?: string }> };
  }>(
    "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=1&prop=pageimages&piprop=name&format=json&gsrsearch=" +
      encodeURIComponent(name),
  );
  const page = Object.values(data?.query?.pages ?? {})[0];
  if (!page?.pageimage) return null;

  // The page must be about the name, not a fragment of it: "Mira Murati"
  // must not resolve to Mira, a town near Venice, because "Mira" fits
  // inside her name. Every word of the name has to be in the page title.
  const title = normaliseName(page.title);
  const wanted = normaliseName(name).split(" ").filter((word) => word.length > 1);
  if (!wanted.length || !wanted.every((word) => title.split(" ").includes(word))) return null;

  return commonsImage(page.pageimage);
}

/** File names a Commons search returns for a query, cheapest call first. */
export async function commonsSearchTitles(query: string, limit = 8): Promise<string[]> {
  const data = await getJson<{ query?: { search?: { title: string }[] } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=${limit}&format=json&srsearch=` +
      encodeURIComponent(`${query} filetype:bitmap`),
  );
  return (data?.query?.search ?? []).map((hit) => hit.title.replace(/^File:/, ""));
}

/**
 * A Commons search for the subject by name, accepting only files whose own
 * title carries the name. "Supreme Court of India" finds photographs of the
 * building; "DeepSeek office" finds nothing that passes, which is right.
 */
export async function commonsSearchImage(name: string): Promise<LicensedImage | null> {
  const words = normaliseName(name)
    .split(" ")
    .filter((word) => word.length > 3);
  if (!words.length) return null;
  const needed = Math.min(2, words.length);

  const data = await getJson<{ query?: { search?: { title: string }[] } }>(
    "https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=8&format=json&srsearch=" +
      encodeURIComponent(`${name} filetype:bitmap`),
  );

  for (const hit of data?.query?.search ?? []) {
    const fileName = hit.title.replace(/^File:/, "");
    const haystack = normaliseName(fileName);
    if (words.filter((word) => haystack.includes(word)).length < needed) continue;
    const image = await commonsImage(fileName);
    if (image) return image;
  }
  return null;
}

/**
 * Records Wikidata identities against our entity rows, by name.
 *
 * Adds to whatever `sameAs` links the entity already has rather than
 * replacing them, and never adds one twice.
 */
export async function recordSameAs(
  supabase: SupabaseClient<Database>,
  links: { name: string; url: string }[],
): Promise<number> {
  let recorded = 0;
  for (const link of links) {
    const { data: rows } = await supabase
      .from("entities")
      .select("id, same_as")
      .ilike("name", link.name)
      .limit(3);

    for (const row of rows ?? []) {
      const existing = Array.isArray(row.same_as) ? (row.same_as as string[]) : [];
      if (existing.includes(link.url)) continue;
      const { error } = await supabase
        .from("entities")
        .update({ same_as: [...existing, link.url] })
        .eq("id", row.id);
      if (!error) recorded += 1;
    }
  }
  return recorded;
}

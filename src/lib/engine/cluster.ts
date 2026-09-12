import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { embedTexts, updateCentroid } from "./embeddings";
import { extractEntityKeys, sharesEntity } from "./entities";

/**
 * Event clustering: streaming first-story detection.
 *
 * The idea is thirty years old (DARPA's Topic Detection and Tracking
 * programme) and still what every serious system does: for each new document,
 * find the nearest existing story; if it is close enough, this is more
 * coverage of that story; if not, it is a new one.
 *
 * Two tiers of "close enough". Above the strict threshold a mention joins on
 * similarity alone. Between the loose and strict thresholds it joins only if
 * it also shares an entity with the event — that guard is what stops "gold
 * falls in Delhi" and "gold falls in London", which are nearly identical
 * sentences about different events, from becoming one story.
 *
 * Nearest-neighbour search runs in Postgres over the HNSW index, restricted to
 * events still open. HNSW finds the neighbours approximately, but the distance
 * reported for each one is exact, so the join decision is made on the
 * database's figure and the vectors themselves never leave it.
 */

export type IncomingMention = {
  sourceKind: string;
  sourceKey: string;
  externalId: string;
  title: string;
  body?: string | null;
  url?: string | null;
  region?: string | null;
  /** Entity names the source supplies directly, e.g. a Wikipedia page title. */
  entityNames?: string[];
  magnitude?: number | null;
  observedAt?: string;
  raw?: Record<string, unknown>;
};

export type ClusterReport = {
  received: number;
  inserted: number;
  duplicates: number;
  joined: number;
  founded: number;
  unembedded: number;
  /** Mentions set aside because their text is not in a script we can cluster. */
  skipped: number;
  /** Search hits that did not land on the event they were fetched for. */
  discarded: number;
};

/**
 * Share of a text's letters that are Latin script.
 *
 * The embedding model and the entity extractor both work on English. A
 * Hindi or Telugu headline embeds into a corner of the space where every
 * other Hindi or Telugu headline also lands, and they cluster with each other
 * regardless of subject. Until the engine has a multilingual model those
 * mentions are set aside rather than mis-clustered.
 */
function latinShare(text: string): number {
  let letters = 0;
  let latin = 0;
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    letters += 1;
    if (/\p{Script=Latin}/u.test(char)) latin += 1;
  }
  return letters ? latin / letters : 1;
}

const STRICT_SIMILARITY = 0.9;
const DEFAULT_LOOSE_SIMILARITY = 0.84;
const CANDIDATES = 8;

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? fallback;
}

/** What the embedding sees. Title carries most of the signal; body adds context. */
function embeddingText(mention: IncomingMention): string {
  const body = (mention.body ?? "").trim();
  return body ? `${mention.title}\n\n${body.slice(0, 1200)}` : mention.title;
}

type LiveEvent = {
  id: string;
  title: string;
  entities: string[];
  source_keys: string[];
  mention_count: number;
};

/**
 * An outlet already on the event must be filing a near-duplicate to join it.
 *
 * An outlet rarely files forty pieces on one story in a day, but a national
 * desk files forty pieces a day on the same beat, and on a compressed
 * embedding those sit close enough to chain into one ever-growing event.
 * Requiring near-identity from a repeat outlet — measured on the engine's own
 * data — split those attractors into their real stories while leaving
 * genuinely multi-outlet clusters whole.
 */
const SAME_OUTLET_SIMILARITY = 0.95;

/**
 * Nearest live events by centroid, from the HNSW index.
 *
 * The window filter comes first so the index is only consulted for events that
 * could plausibly still be receiving coverage. A story from last month is not a
 * candidate however similar its centroid.
 *
 * The similarity is the database's own figure. The index finds the neighbours
 * approximately, but the distance it reports for each one is computed exactly
 * on the stored vectors — measured against a client-side recomputation on
 * four thousand real pairs, the two never differed by more than 3e-7. The
 * vectors themselves stay in the database: shipping ten of them per lookup
 * was two gigabytes a day of egress for numbers nothing read.
 */
async function nearestEvents(
  embedding: number[],
  windowHours: number,
): Promise<{ event: LiveEvent; similarity: number }[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("match_story_events", {
    query_embedding: embedding as never,
    window_hours: windowHours,
    match_count: CANDIDATES,
  });

  if (error || !data) return [];

  return data.map((row) => ({
    event: {
      id: row.id,
      title: row.title,
      entities: row.entities ?? [],
      source_keys: row.source_keys ?? [],
      mention_count: row.mention_count,
    },
    similarity: Number(row.similarity ?? 0),
  }));
}

/** pgvector returns vectors as '[0.1,0.2,...]' strings through PostgREST. */
function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Events the mention could join without an embedding: any open event sharing
 * two or more of its entities. Used when embedding failed, so that a temporary
 * model outage degrades to entity matching rather than to every mention
 * founding its own event.
 */
async function entityFallbackEvent(
  entities: string[],
  windowHours: number,
): Promise<LiveEvent | null> {
  if (entities.length < 2) return null;
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("story_events")
    .select("id, title, entities, mention_count, source_keys")
    .in("status", ["candidate", "newsworthy"])
    .gte("last_seen_at", new Date(Date.now() - windowHours * 3600_000).toISOString())
    .overlaps("entities", entities)
    .order("last_seen_at", { ascending: false })
    .limit(20);

  for (const row of data ?? []) {
    const shared = (row.entities ?? []).filter((key) => entities.includes(key)).length;
    if (shared >= 2) {
      return {
        id: row.id,
        title: row.title,
        entities: row.entities ?? [],
        source_keys: row.source_keys ?? [],
        mention_count: row.mention_count,
      };
    }
  }
  return null;
}

async function attachToEvent(
  event: LiveEvent,
  mentionId: number,
  embedding: number[] | null,
  entities: string[],
  observedAt: string,
  region: string | null,
  sourceKey: string,
) {
  const supabase = createAdminClient();

  const mergedEntities = [...new Set([...event.entities, ...entities])];

  await supabase.from("signal_mentions").update({ event_id: event.id }).eq("id", mentionId);

  // The one vector this needs is the winner's, read here alongside the
  // counters it was already reading: one row, once per join, rather than ten
  // vectors per lookup.
  const { data: current } = await supabase
    .from("story_events")
    .select("centroid, region_mix, mention_count, source_keys, last_seen_at")
    .eq("id", event.id)
    .single();

  const existing = parseVector(current?.centroid as unknown);
  const count = current?.mention_count ?? event.mention_count;
  const centroid =
    embedding && existing ? updateCentroid(existing, count, embedding) : (existing ?? embedding);

  const mix = ((current?.region_mix as Record<string, number>) ?? {});
  if (region) mix[region] = (mix[region] ?? 0) + 1;

  const sourceKeys = [...new Set([...(current?.source_keys ?? event.source_keys), sourceKey])];

  await supabase
    .from("story_events")
    .update({
      centroid: centroid as never,
      entities: mergedEntities,
      source_keys: sourceKeys,
      mention_count: (current?.mention_count ?? event.mention_count) + 1,
      // Never earlier than it already is: a late-arriving mention with an
      // old publication time must not make the event look older.
      last_seen_at:
        current?.last_seen_at && current.last_seen_at > observedAt ? current.last_seen_at : observedAt,
      region_mix: mix as never,
    })
    .eq("id", event.id);
}

async function foundEvent(
  mention: IncomingMention,
  mentionId: number,
  embedding: number[] | null,
  entities: string[],
  observedAt: string,
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("story_events")
    .insert({
      title: mention.title,
      entities,
      centroid: embedding as never,
      first_seen_at: observedAt,
      last_seen_at: observedAt,
      mention_count: 1,
      source_count: 1,
      source_keys: [mention.sourceKey],
      region_mix: mention.region ? { [mention.region]: 1 } : {},
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not create event");

  await supabase.from("signal_mentions").update({ event_id: data.id }).eq("id", mentionId);
  return data.id;
}

/**
 * Ingests a batch of mentions from one stream.
 *
 * Embeds the whole batch in one request, then walks it sequentially so that two
 * mentions of a brand-new story in the same batch cluster together — the second
 * finds the event the first just founded.
 */
export async function ingestMentions(mentions: IncomingMention[]): Promise<ClusterReport> {
  const report: ClusterReport = {
    received: mentions.length,
    inserted: 0,
    duplicates: 0,
    joined: 0,
    founded: 0,
    unembedded: 0,
    skipped: 0,
    discarded: 0,
  };
  if (!mentions.length) return report;

  const supabase = createAdminClient();
  const loose = await readSetting<number>("engine_cluster_threshold", DEFAULT_LOOSE_SIMILARITY);
  const windowHours = await readSetting<number>("engine_event_window_hours", 48);

  // Drop what we have already seen before spending an embedding on it.
  const ids = mentions.map((m) => m.externalId);
  const { data: existing } = await supabase
    .from("signal_mentions")
    .select("source_kind, external_id")
    .in("external_id", ids);
  const seen = new Set((existing ?? []).map((row) => `${row.source_kind}:${row.external_id}`));

  const unseen = mentions.filter((m) => !seen.has(`${m.sourceKind}:${m.externalId}`));
  report.duplicates = mentions.length - unseen.length;

  // Set aside what cannot be clustered (script) and what is not news any
  // more (a wire item republished days after the fact). The engine is about
  // what is happening now; old items only found stale events.
  const staleBefore = Date.now() - 36 * 3600_000;
  const fresh = unseen.filter(
    (m) =>
      latinShare(m.title) >= 0.5 &&
      (!m.observedAt || new Date(m.observedAt).getTime() >= staleBefore),
  );
  report.skipped = unseen.length - fresh.length;
  if (!fresh.length) return report;

  const embeddings = await embedTexts(fresh.map(embeddingText));

  for (let i = 0; i < fresh.length; i++) {
    const mention = fresh[i];
    const embedding = embeddings[i];
    const entities = extractEntityKeys(mention.title, mention.entityNames ?? []);
    const observedAt = mention.observedAt ?? new Date().toISOString();

    if (!embedding) report.unembedded += 1;

    // Decide where the mention belongs before storing it, so a search hit
    // that belongs nowhere is never stored at all.
    let target: LiveEvent | null = null;

    if (embedding) {
      const candidates = await nearestEvents(embedding, windowHours);
      for (const { event, similarity } of candidates) {
        const close =
          similarity >= STRICT_SIMILARITY ||
          (similarity >= loose && sharesEntity(event.entities, entities));
        if (!close) continue;
        if (event.source_keys.includes(mention.sourceKey) && similarity < SAME_OUTLET_SIMILARITY) {
          continue;
        }
        target = event;
        break;
      }
    } else {
      target = await entityFallbackEvent(entities, windowHours);
    }

    // A corroboration hit was fetched for one specific event. If it does not
    // land there it is not corroboration — it is a search result about
    // something else, and storing it founds junk events by the hundred.
    const fetchedFor = mention.raw?.corroboratingEvent;
    if (typeof fetchedFor === "string" && target?.id !== fetchedFor) {
      report.discarded += 1;
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("signal_mentions")
      .insert({
        source_kind: mention.sourceKind,
        source_key: mention.sourceKey,
        external_id: mention.externalId,
        title: mention.title,
        body: mention.body ?? null,
        url: mention.url ?? null,
        region: mention.region ?? null,
        entities,
        magnitude: mention.magnitude ?? null,
        observed_at: observedAt,
        embedding: embedding as never,
        raw: (mention.raw ?? {}) as never,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      // A unique violation here is a race with another pulse, not a problem.
      if (error?.code === "23505") report.duplicates += 1;
      continue;
    }
    report.inserted += 1;

    if (target) {
      await attachToEvent(
        target,
        inserted.id,
        embedding,
        entities,
        observedAt,
        mention.region ?? null,
        mention.sourceKey,
      );
      report.joined += 1;
    } else {
      await foundEvent(mention, inserted.id, embedding, entities, observedAt);
      report.founded += 1;
    }
  }

  return report;
}

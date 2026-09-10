import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { cosine, embedTexts, updateCentroid } from "./embeddings";
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
 * events still open. The similarity is recomputed here from the returned
 * vector rather than trusted from the index, because HNSW is approximate and
 * the join decision should not be.
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
  centroid: number[] | null;
  mention_count: number;
};

/**
 * Nearest live events by centroid, from the HNSW index.
 *
 * The window filter comes first so the index is only consulted for events that
 * could plausibly still be receiving coverage. A story from last month is not a
 * candidate however similar its centroid.
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

  return data.map((row) => {
    const centroid = parseVector(row.centroid as unknown);
    return {
      event: {
        id: row.id,
        title: row.title,
        entities: row.entities ?? [],
        centroid,
        mention_count: row.mention_count,
      },
      // Recomputed exactly; the index's distance is an approximation.
      similarity: centroid ? cosine(embedding, centroid) : 0,
    };
  });
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
    .select("id, title, entities, centroid, mention_count")
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
        centroid: parseVector(row.centroid as unknown),
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
) {
  const supabase = createAdminClient();

  const centroid =
    embedding && event.centroid
      ? updateCentroid(event.centroid, event.mention_count, embedding)
      : (event.centroid ?? embedding);

  const mergedEntities = [...new Set([...event.entities, ...entities])];

  await supabase.from("signal_mentions").update({ event_id: event.id }).eq("id", mentionId);

  // Region mix is a counter map; bumping it in SQL would be cleaner but the
  // row was just read, and one pulse's worth of drift is not worth a function.
  const { data: current } = await supabase
    .from("story_events")
    .select("region_mix, mention_count")
    .eq("id", event.id)
    .single();

  const mix = ((current?.region_mix as Record<string, number>) ?? {});
  if (region) mix[region] = (mix[region] ?? 0) + 1;

  await supabase
    .from("story_events")
    .update({
      centroid: centroid as never,
      entities: mergedEntities,
      mention_count: (current?.mention_count ?? event.mention_count) + 1,
      last_seen_at: observedAt,
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

    let target: LiveEvent | null = null;

    if (embedding) {
      const candidates = await nearestEvents(embedding, windowHours);
      for (const { event, similarity } of candidates) {
        if (similarity >= STRICT_SIMILARITY) {
          target = event;
          break;
        }
        if (similarity >= loose && sharesEntity(event.entities, entities)) {
          target = event;
          break;
        }
      }
    } else {
      target = await entityFallbackEvent(entities, windowHours);
    }

    if (target) {
      await attachToEvent(target, inserted.id, embedding, entities, observedAt, mention.region ?? null);
      report.joined += 1;
    } else {
      await foundEvent(mention, inserted.id, embedding, entities, observedAt);
      report.founded += 1;
    }
  }

  return report;
}

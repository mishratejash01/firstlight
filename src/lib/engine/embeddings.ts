import "server-only";

/**
 * Text embeddings for clustering.
 *
 * Served by the project's own edge function, which runs the gte-small model
 * that ships inside the Supabase edge runtime. It is free, has no daily quota,
 * and lives next to the database. The metered alternative — Gemini's
 * embedding endpoint — counts every text in a batch as a request against a
 * hundred-a-minute, thousand-a-day free allowance, which an engine that
 * clusters hundreds of mentions an hour would exhaust before breakfast.
 *
 * gte-small produces 384-dimensional unit vectors. Its similarity scale is
 * compressed compared with larger models — unrelated headlines sit around
 * 0.75, paraphrases above 0.9 — so the clustering thresholds are calibrated
 * to this model, not to a general notion of "similar".
 */

export const EMBEDDING_DIMENSIONS = 384;
/**
 * Per call. The edge runtime allows about two seconds of CPU per request and
 * gte-small takes a fraction of a second per headline, so eight is the safe
 * batch; anything larger is retried in halves when the worker refuses it.
 */
const BATCH_LIMIT = 8;
/** Calls in flight at once. */
const CONCURRENCY = 3;
/** The edge runtime's "worker exceeded its resource limits" status. */
const WORKER_LIMIT_STATUS = 546;
const MAX_CHARS = 1000;

function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum) || 1;
  return vector.map((value) => value / length);
}

function endpoint(): { url: string; secret: string } | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return null;
  return { url: `${base.replace(/\/$/, "")}/functions/v1/embed`, secret };
}

export function embeddingsAvailable(): boolean {
  return endpoint() !== null;
}

async function embedBatch(
  texts: string[],
  target: { url: string; secret: string },
): Promise<(number[] | null)[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(target.url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-engine-secret": target.secret },
      body: JSON.stringify({ texts: texts.map((text) => text.slice(0, MAX_CHARS)) }),
    });

    if (response.status === WORKER_LIMIT_STATUS && texts.length > 1) {
      // Too much for one request: split and try each half. Ends at single
      // texts, which either embed or genuinely cannot.
      const middle = Math.ceil(texts.length / 2);
      const [left, right] = await Promise.all([
        embedBatch(texts.slice(0, middle), target),
        embedBatch(texts.slice(middle), target),
      ]);
      return [...left, ...right];
    }

    if (!response.ok) {
      console.error("[embeddings] batch failed", response.status, await response.text());
      return texts.map(() => null);
    }

    const data = (await response.json()) as { embeddings?: number[][] };
    return texts.map((_, index) => {
      const vector = data.embeddings?.[index];
      return vector?.length === EMBEDDING_DIMENSIONS ? normalise(vector) : null;
    });
  } catch (error) {
    console.error("[embeddings] batch threw", error);
    return texts.map(() => null);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Embeds many texts, a few batches at a time.
 *
 * Returns null for any text that could not be embedded rather than throwing:
 * a mention with no embedding is still stored and can still be matched by
 * entity overlap, whereas a thrown error would drop the whole batch.
 */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const target = endpoint();
  if (!target || !texts.length) return texts.map(() => null);

  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const batches: { start: number; texts: string[] }[] = [];
  for (let start = 0; start < texts.length; start += BATCH_LIMIT) {
    batches.push({ start, texts: texts.slice(start, start + BATCH_LIMIT) });
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const wave = batches.slice(i, i + CONCURRENCY);
    const embedded = await Promise.all(wave.map((batch) => embedBatch(batch.texts, target)));
    wave.forEach((batch, index) => {
      embedded[index].forEach((vector, offset) => {
        results[batch.start + offset] = vector;
      });
    });
  }

  return results;
}

export async function embedText(text: string): Promise<number[] | null> {
  const [result] = await embedTexts([text]);
  return result;
}

/** Cosine similarity of two unit vectors is their dot product. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Running mean of unit vectors, re-normalised. */
export function updateCentroid(
  centroid: number[] | null,
  count: number,
  incoming: number[],
): number[] {
  if (!centroid || count <= 0) return incoming;
  const merged = centroid.map((value, i) => (value * count + incoming[i]) / (count + 1));
  return normalise(merged);
}

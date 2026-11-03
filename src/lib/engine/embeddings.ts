import "server-only";
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * Text embeddings for clustering.
 *
 * Computed inside the app with gte-small, the same model the project's
 * Supabase edge function ran until November 2026. It is loaded once per
 * process (about 130 MB of ONNX weights, fetched on first use into
 * `EMBEDDINGS_CACHE_DIR`) and then costs a few milliseconds per headline on
 * the server's own CPU: no request leaves the machine, nothing is metered.
 *
 * gte-small produces 384-dimensional unit vectors. Its similarity scale is
 * compressed compared with larger models — unrelated headlines sit around
 * 0.75, paraphrases above 0.9 — so the clustering thresholds are calibrated
 * to this model, not to a general notion of "similar". Mean pooling and
 * normalisation match what the edge runtime did, so vectors stored before
 * the move and vectors computed after it compare like for like.
 */

export const EMBEDDING_DIMENSIONS = 384;
const MODEL = "Supabase/gte-small";
/** Texts per model call: long enough to amortise the call, short enough to keep memory flat. */
const BATCH_LIMIT = 16;
const MAX_CHARS = 1000;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function loadExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    env.cacheDir = process.env.EMBEDDINGS_CACHE_DIR ?? ".cache/transformers";
    // fp32, not the quantised build: the stored centroids were made by the
    // full-precision model and a quantised one drifts a few hundredths.
    extractor = pipeline("feature-extraction", MODEL, { dtype: "fp32" }).catch((error) => {
      extractor = null;
      throw error;
    });
  }
  return extractor;
}

function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum) || 1;
  return vector.map((value) => value / length);
}

/** The model runs wherever the app runs; nothing external has to be configured. */
export function embeddingsAvailable(): boolean {
  return true;
}

async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  try {
    const extract = await loadExtractor();
    const output = await extract(texts, { pooling: "mean", normalize: true });
    const rows = output.tolist() as number[][];
    return texts.map((_, index) => {
      const vector = rows[index];
      return vector?.length === EMBEDDING_DIMENSIONS ? normalise(vector) : null;
    });
  } catch (error) {
    console.error("[embeddings] batch failed", error);
    return texts.map(() => null);
  }
}

/**
 * Embeds many texts, a batch at a time.
 *
 * Returns null for any text that could not be embedded rather than throwing:
 * a mention with no embedding is still stored and can still be matched by
 * entity overlap, whereas a thrown error would drop the whole batch. Blank
 * texts get null without troubling the model.
 */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const pending: { index: number; text: string }[] = [];
  texts.forEach((text, index) => {
    const trimmed = String(text ?? "").slice(0, MAX_CHARS).trim();
    if (trimmed) pending.push({ index, text: trimmed });
  });

  for (let start = 0; start < pending.length; start += BATCH_LIMIT) {
    const batch = pending.slice(start, start + BATCH_LIMIT);
    const vectors = await embedBatch(batch.map((item) => item.text));
    batch.forEach((item, offset) => {
      results[item.index] = vectors[offset];
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

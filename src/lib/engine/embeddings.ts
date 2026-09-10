import "server-only";

/**
 * Text embeddings for clustering.
 *
 * Gemini's embedding endpoint, called directly rather than through the AI SDK
 * because the batch endpoint and the task-type hint are what matter here and
 * both are provider-specific. CLUSTERING is a real task type: it tunes the
 * space so that things about the same event sit close together, which is
 * exactly the property the event clusterer depends on.
 *
 * 768 dimensions rather than the model's native 3072. The index is a quarter
 * the size, matching is four times faster, and the quality loss on short news
 * text is negligible. Truncated Gemini embeddings must be re-normalised, so
 * every vector leaves here at unit length — which also means cosine similarity
 * is a plain dot product downstream.
 */

export const EMBEDDING_DIMENSIONS = 768;
const MODEL = process.env.AI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const BATCH_LIMIT = 100;
const MAX_CHARS = 2000;

function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum) || 1;
  return vector.map((value) => value / length);
}

export function embeddingsAvailable(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

/**
 * Embeds many texts in as few requests as possible.
 *
 * Returns null for any text that could not be embedded rather than throwing:
 * a mention with no embedding is still stored and can still be matched by
 * entity overlap, whereas a thrown error would drop the whole batch.
 */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key || !texts.length) return texts.map(() => null);

  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let start = 0; start < texts.length; start += BATCH_LIMIT) {
    const slice = texts.slice(start, start + BATCH_LIMIT);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: slice.map((text) => ({
              model: `models/${MODEL}`,
              content: { parts: [{ text: text.slice(0, MAX_CHARS) }] },
              taskType: "CLUSTERING",
              outputDimensionality: EMBEDDING_DIMENSIONS,
            })),
          }),
        },
      );

      if (!response.ok) {
        console.error("[embeddings] batch failed", response.status, await response.text());
        continue;
      }

      const data = (await response.json()) as { embeddings?: { values: number[] }[] };
      (data.embeddings ?? []).forEach((item, index) => {
        if (item?.values?.length === EMBEDDING_DIMENSIONS) {
          results[start + index] = normalise(item.values);
        }
      });
    } catch (error) {
      console.error("[embeddings] batch threw", error);
    } finally {
      clearTimeout(timeout);
    }
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

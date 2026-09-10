/**
 * Sentence embeddings for the event engine.
 *
 * Runs the gte-small model that ships inside the Supabase edge runtime, so
 * embedding a headline costs nothing and has no daily quota. The engine
 * clusters hundreds of mentions an hour; a metered API cannot carry that on a
 * free tier, and this one does not need to.
 *
 * Guarded by a shared secret rather than a JWT: the only caller is the
 * engine's own server code.
 */

const MAX_TEXTS = 64;
const MAX_CHARS = 1000;

const session = new Supabase.ai.Session("gte-small");

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("ENGINE_SECRET");
  if (!secret || request.headers.get("x-engine-secret") !== secret) {
    return new Response("Unauthorised", { status: 401 });
  }

  let texts: unknown;
  try {
    ({ texts } = await request.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS) {
    return new Response(`Send 1 to ${MAX_TEXTS} texts`, { status: 400 });
  }

  const embeddings: number[][] = [];
  for (const text of texts) {
    const input = String(text ?? "").slice(0, MAX_CHARS);
    if (!input.trim()) {
      embeddings.push([]);
      continue;
    }
    const output = await session.run(input, { mean_pool: true, normalize: true });
    embeddings.push(Array.from(output as Iterable<number>));
  }

  return Response.json({ embeddings });
});

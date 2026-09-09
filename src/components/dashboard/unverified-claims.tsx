/**
 * The claims the model said it could not stand behind.
 *
 * Shown above the editor, not below it, and styled with the signal colour — the
 * one place in the design system reserved for something that genuinely demands
 * attention. An editor who publishes without reading this has made a decision;
 * one who never saw it has not.
 */
export function UnverifiedClaims({ claims }: { claims: string[] }) {
  if (!claims.length) return null;

  return (
    <section className="mb-8 border-l-2 border-signal pl-4">
      <h2 className="text-meta font-semibold text-signal">
        {claims.length} claim{claims.length === 1 ? "" : "s"} the AI could not verify
      </h2>
      <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
        Check each of these against a real source before this is published, or
        remove it from the copy. They are recorded against the article, so they
        remain visible to whoever publishes it.
      </p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        {claims.map((claim, index) => (
          <li key={index} className="text-meta leading-relaxed text-ink">
            {claim}
          </li>
        ))}
      </ul>
    </section>
  );
}

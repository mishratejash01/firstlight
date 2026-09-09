/**
 * Emits a JSON-LD block.
 *
 * JSON.stringify output is escaped before it reaches the script tag: a '<' in
 * any string field could otherwise close the script element early and turn a
 * headline into markup. This is the one place in the codebase that uses
 * dangerouslySetInnerHTML, and this is why it is safe to.
 */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

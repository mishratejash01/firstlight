/**
 * Explains an empty panel.
 *
 * A blank table is the most confusing thing a dashboard can show: the reader
 * cannot tell whether it is broken, still loading, or simply has nothing to
 * report yet. Every empty panel says which of those it is and, where relevant,
 * what would make it fill.
 */
export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="mt-3 border-l-2 border-hairline pl-4 py-1">
      <p className="text-body text-ink">{title}</p>
      <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

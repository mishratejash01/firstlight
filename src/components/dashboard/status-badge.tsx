const LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "With the desk",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Sent back",
  archived: "Archived",
};

/**
 * Editorial status.
 *
 * Text, not colour. A newsroom status is read at a glance by people who may be
 * colourblind and often on a phone in poor light; a word is unambiguous where a
 * grey-versus-green dot is not. The one exception the design allows for colour
 * is breaking news, and this is not that.
 */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="text-meta text-muted">{LABELS[status] ?? status}</span>
  );
}

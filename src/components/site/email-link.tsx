/**
 * An email address, written out in full and linked.
 *
 * The address itself is always the link text, never "email us": a reader
 * copying it into webmail, or reading it off a screenshot, needs the address.
 * It may break anywhere, because an address that cannot wrap pushes a phone's
 * page wider than its screen.
 *
 * A subject and body can be filled in for the reader, so that a message about
 * a story arrives saying which story. Line breaks in a body should be "\r\n",
 * which is what mailto links are specified to carry.
 */
export function EmailLink({
  address,
  subject,
  body,
  className = "text-accent underline underline-offset-4",
}: {
  address: string;
  subject?: string;
  body?: string;
  className?: string;
}) {
  const query = [
    subject ? `subject=${encodeURIComponent(subject)}` : null,
    body ? `body=${encodeURIComponent(body)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  return (
    <a
      href={`mailto:${address}${query ? `?${query}` : ""}`}
      className={`${className} [overflow-wrap:anywhere]`}
    >
      {address}
    </a>
  );
}

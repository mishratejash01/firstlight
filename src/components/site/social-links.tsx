import { SOCIAL_LINKS } from "@/lib/site";

/**
 * The paper's social accounts, as marks in the masthead.
 *
 * The marks are inline SVG rather than an icon package: three paths do not
 * justify a dependency, and inlining means they render with the first byte of
 * HTML instead of arriving a beat late on a slow connection.
 *
 * An account with no URL configured still shows its mark, but as plain artwork
 * rather than a link — so the masthead looks finished before the accounts are
 * opened, and nobody can click through to nothing. Fill the href in
 * SOCIAL_LINKS and the same mark becomes a real link.
 */

const PATHS: Record<string, string> = {
  X: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  Facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  Instagram:
    "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm7.846-10.405a1.441 1.441 0 01-2.88 0 1.44 1.44 0 012.88 0z",
};

/**
 * Each network's own colour. These are the one deliberate exception to the
 * six-token palette: a social mark is a borrowed logo, and recolouring it to
 * match the paper makes it harder to recognise at 15px, which is the only job
 * it has.
 */
const BRAND: Record<string, string> = {
  X: "#000000",
  Facebook: "#1877F2",
  Instagram: "#E4405F",
};

function Mark({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="h-[17px] w-[17px]"
      fill={BRAND[name] ?? "currentColor"}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function SocialLinks({ className = "" }: { className?: string }) {
  const marks = SOCIAL_LINKS.filter((link) => PATHS[link.name]);
  if (!marks.length) return null;

  return (
    <ul className={`flex items-center gap-4 ${className}`}>
      {marks.map((link) => (
        <li key={link.name}>
          {link.href ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer me"
              className="block transition-opacity hover:opacity-70"
            >
              <Mark name={link.name} />
              <span className="sr-only">{link.name}</span>
            </a>
          ) : (
            // Artwork, not a control: no link, no focus stop, and hidden from
            // screen readers, which have nothing useful to announce about an
            // account that does not exist yet.
            <span className="block">
              <Mark name={link.name} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

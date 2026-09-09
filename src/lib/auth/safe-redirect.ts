/**
 * Constrains a post-sign-in redirect to somewhere on this site.
 *
 * Sign-in flows carry a `next` parameter through an external provider and back,
 * which makes it attacker-supplied by the time we see it. Without this check
 * the login page becomes an open redirect: a link to our own domain that lands
 * the reader on someone else's, with our sign-in as the credential.
 *
 * Rejects anything that is not a single-slash absolute path — including
 * protocol-relative '//evil.example' and backslash variants that some URL
 * parsers normalise into one.
 */
export function safeRedirectPath(candidate: string | null, fallback = "/"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  return candidate;
}

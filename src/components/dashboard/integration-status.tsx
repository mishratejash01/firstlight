import Link from "next/link";

/**
 * Which external services are actually wired up.
 *
 * Exists because "is the AI working?" and "are uploads going anywhere?" were
 * otherwise unanswerable without reading environment variables on a server
 * nobody has open. A feature that silently does nothing is worse than one that
 * says it is not configured.
 *
 * Server-rendered and admin-gated: it reports whether a variable is set, never
 * what it contains.
 */

type Integration = {
  name: string;
  configured: boolean;
  purpose: string;
  missing: string;
  href?: string;
};

export function IntegrationStatus() {
  const integrations: Integration[] = [
    {
      name: "AI assist",
      // On Vercel the gateway authenticates with the deployment's OIDC token,
      // so no key is needed there; locally one is.
      configured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
      purpose: "Drafting, tag and headline suggestions, wire summaries.",
      missing: "Set AI_GATEWAY_API_KEY from the Vercel dashboard under AI Gateway → API keys.",
    },
    {
      name: "Cloudinary",
      configured: Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET,
      ),
      purpose: "Image and video hosting, resizing and format conversion.",
      missing: "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    },
    {
      name: "Wire ingestion",
      configured: Boolean(process.env.CRON_SECRET),
      purpose: "Scheduled polling of RSS and Atom feeds into the wire queue.",
      missing: "Set CRON_SECRET. Without it the scheduled endpoint refuses to run at all.",
      href: "/admin/sources",
    },
    {
      name: "Google Analytics",
      configured: Boolean(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID),
      purpose: "Search reporting alongside the first-party analytics tables.",
      missing: "Set NEXT_PUBLIC_GA4_MEASUREMENT_ID.",
    },
    {
      name: "IndexNow",
      configured: Boolean(process.env.INDEXNOW_KEY),
      purpose: "Tells search engines within seconds when a story publishes.",
      missing: "Set INDEXNOW_KEY and publish the matching key file.",
    },
    {
      name: "Email delivery",
      configured: false,
      purpose: "Newsletter confirmation and sending.",
      missing:
        "No provider connected. Signups are stored, but no email is sent — including the confirmation subscribers are waiting for.",
    },
  ];

  return (
    <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
      {integrations.map((integration) => (
        <li key={integration.name} className="py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-body text-ink">
              {integration.href ? (
                <Link href={integration.href} className="hover:text-accent">
                  {integration.name}
                </Link>
              ) : (
                integration.name
              )}
            </p>
            <span
              className={
                integration.configured ? "text-meta text-muted" : "text-meta text-signal"
              }
            >
              {integration.configured ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mt-0.5 max-w-measure text-meta leading-relaxed text-muted">
            {integration.configured ? integration.purpose : integration.missing}
          </p>
        </li>
      ))}
    </ul>
  );
}

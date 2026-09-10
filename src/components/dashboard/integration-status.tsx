import Link from "next/link";

import { aiProviderName } from "@/lib/ai/config";

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
      configured: Boolean(aiProviderName()),
      purpose: `Drafting, triage, tag and headline suggestions, wire summaries. Routed via ${aiProviderName()}.`,
      missing:
        "No provider key set. Free options needing no card: GOOGLE_GENERATIVE_AI_API_KEY (aistudio.google.com/apikey) or GROQ_API_KEY (console.groq.com/keys). The Vercel AI Gateway also works but requires a card on file, even for its free credits.",
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
      name: "Event engine",
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.CRON_SECRET),
      purpose:
        "Clusters, scores, triages and writes breaking stories from a dozen streams; embeddings run in the project's own edge function.",
      missing: "Set CRON_SECRET; the same value must be stored in Vault as engine_cron_secret for the schedule.",
      href: "/admin/events",
    },
    {
      name: "YouTube stream",
      configured: Boolean(process.env.YOUTUBE_API_KEY),
      purpose: "Most-popular news videos in India, the US and the UK feed the engine every fifteen minutes.",
      missing:
        "Set YOUTUBE_API_KEY: a Google Cloud API key with the YouTube Data API v3 enabled. The AI Studio key used for Gemini does not carry YouTube access.",
    },
    {
      name: "Reddit stream",
      configured: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
      purpose: "Rising posts in r/news, r/worldnews and r/india feed the engine every fifteen minutes.",
      missing:
        "Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET from a script-type app at reddit.com/prefs/apps.",
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

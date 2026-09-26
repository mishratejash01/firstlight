import type { NextConfig } from "next";

/**
 * The one hostname the paper is published at, read from the same variable the
 * app builds every canonical URL from. Any other hostname that serves this
 * deployment (the hosting provider's own addresses, preview builds, the bare
 * domain) is a duplicate copy of the site as far as a search engine can tell.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CANONICAL_HOST = new URL(SITE_URL).host;
const CANONICAL_HOST_PATTERN = `^${CANONICAL_HOST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;

/**
 * Set CANONICAL_REDIRECT=1 once the canonical domain resolves to this project:
 * every page request on any other hostname then gets a permanent redirect to
 * the same path on the canonical one. Off by default, because redirecting to a
 * domain whose DNS does not point here yet would take the site down.
 */
const REDIRECT_TO_CANONICAL = process.env.CANONICAL_REDIRECT === "1";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Duplicate hostnames tell search engines not to index what they
        // serve. The pages already name the canonical URL; this makes it a
        // rule rather than a hint, so only the real domain can rank.
        source: "/:path*",
        missing: [{ type: "host", value: CANONICAL_HOST_PATTERN }],
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  async redirects() {
    if (!REDIRECT_TO_CANONICAL) return [];
    return [
      {
        // Everything but the API, which the scheduler calls by the hosting
        // provider's address and which must keep answering there.
        source: "/:path((?!api/).*)",
        missing: [{ type: "host", value: CANONICAL_HOST_PATTERN }],
        destination: `${SITE_URL}/:path`,
        permanent: true,
      },
    ];
  },
  // This project sits inside a parent directory that also contains a lockfile.
  // Pinning the root stops Turbopack inferring the wrong workspace root.
  turbopack: {
    root: __dirname,
  },
  // Every visitor, crawler or reader, gets the page's title, description,
  // canonical link and social tags inside <head>, before the body.
  //
  // By default Next.js may stream that metadata in after the first bytes of
  // the page, appended to <body>, for any user agent not on its short list of
  // "HTML-limited" bots. That list has Bingbot and Google's secondary crawlers
  // but not Googlebot itself, and none of the AI answer engines' crawlers
  // (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and others), which read raw
  // HTML; a canonical link outside <head> is ignored. Matching everything turns
  // streaming metadata off; the cost is that the first byte waits for
  // generateMetadata, which shares its data fetch with the page anyway.
  //
  // Remove this before ever enabling cacheComponents: with partial
  // prerendering it would force every request to render dynamically.
  htmlLimitedBots: /.*/,
  experimental: {
    serverActions: {
      // Media uploads travel through a Server Action so the Cloudinary secret
      // stays on the server. The default 1MB cap would reject almost every
      // photograph, let alone video; Vercel Functions accept up to 100MB.
      bodySizeLimit: "100mb",
    },
  },
  images: {
    // Cloudinary resizes and picks the format; Vercel's image optimiser is not
    // used at all (see src/lib/media/cloudinary-loader.ts for why).
    loader: "custom",
    loaderFile: "./src/lib/media/cloudinary-loader.ts",
    // The widths a browser may ask for. Fewer, better-chosen steps mean fewer
    // distinct renditions for Cloudinary to make and cache.
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1600],
    imageSizes: [96, 160, 240, 320],
    // Hero images are stored as absolute URLs in the database so the source can
    // change without a migration. Only hosts listed here are optimisable, which
    // stops an editor pasting a URL that turns our image pipeline into an open
    // proxy for arbitrary remote content.
    remotePatterns: [
      // Development seed placeholders.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      // Cloudinary, where all editorial media is hosted.
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Google account avatars, shown on a reader's own profile.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Supabase Storage, where real editorial images will live.
      { protocol: "https", hostname: "jjucyhrrlntziuwesvfw.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;

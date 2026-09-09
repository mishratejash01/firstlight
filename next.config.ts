import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project sits inside a parent directory that also contains a lockfile.
  // Pinning the root stops Turbopack inferring the wrong workspace root.
  turbopack: {
    root: __dirname,
  },
  images: {
    // Hero images are stored as absolute URLs in the database so the source can
    // change without a migration. Only hosts listed here are optimisable, which
    // stops an editor pasting a URL that turns our image pipeline into an open
    // proxy for arbitrary remote content.
    remotePatterns: [
      // Development seed placeholders.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      // Google account avatars, shown on a reader's own profile.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Supabase Storage, where real editorial images will live.
      { protocol: "https", hostname: "jjucyhrrlntziuwesvfw.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;

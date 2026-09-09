import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project sits inside a parent directory that also contains a lockfile.
  // Pinning the root stops Turbopack inferring the wrong workspace root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

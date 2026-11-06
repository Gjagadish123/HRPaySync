import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The floating dev badge covers content in demos and screenshots.
  devIndicators: false,
  partialPrefetching: true,
  // Workforce was split into Workers and Contractors; keep old links (and their #worker hashes) working.
  async redirects() {
    return [{ source: "/workforce", destination: "/workers", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

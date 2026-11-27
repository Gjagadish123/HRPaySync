import type { NextConfig } from "next";

// GitHub Pages serves static files from a sub-path (https://<user>.github.io/<repo>/). Setting PAGES_BASE_PATH
// (the deploy workflow sets "/HRPaySync") builds a static export for that path into ./out. Local dev, `next start`
// and the e2e tests leave it unset and run the normal server build.
const pagesBasePath = process.env.PAGES_BASE_PATH;

const nextConfig: NextConfig = {
  // A static export can't use Partial Prerendering, which Cache Components and partial prefetching turn on.
  // Every page here renders its data in the browser, so the export loses nothing by switching them off.
  ...(pagesBasePath
    ? { output: "export" as const, basePath: pagesBasePath, trailingSlash: true }
    : { cacheComponents: true, partialPrefetching: true }),
  // The floating dev badge covers content in demos and screenshots.
  devIndicators: false,
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

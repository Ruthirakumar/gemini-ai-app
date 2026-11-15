import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Native canvas + the PDF renderer used to crop worksheet pictures must run
  // as plain Node modules, not be bundled.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // pdfjs loads its standard fonts from disk at runtime; ship them with the
  // extraction route on Vercel.
  outputFileTracingIncludes: {
    "/api/library/sets/*/extract": ["./node_modules/pdfjs-dist/standard_fonts/**/*"],
  },
  partialPrefetching: true,
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

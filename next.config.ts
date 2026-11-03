import type { NextConfig } from "next";

// Set NEXT_PUBLIC_BASE_PATH (e.g. "/senderbond") at build time to serve the
// app under a path prefix behind a reverse proxy.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Every page reads live demo state, so we keep Next's default request-time
  // rendering instead of Cache Components.
  basePath,
  output: "standalone",
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live demo state, so we keep Next's default request-time
  // rendering instead of Cache Components.
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

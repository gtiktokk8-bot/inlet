import type { NextConfig } from "next";

// Every screen is per-user, per-org PHI behind auth: nothing is prerendered or cached across users.
const nextConfig: NextConfig = {
  cacheComponents: false,
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

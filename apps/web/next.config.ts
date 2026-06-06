import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp", "playwright-core", "bullmq", "ioredis"],
  transpilePackages: ["@forkd/ui"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // playwright-core bundles chromium-bidi internally (not an npm package).
      // Adding it as a webpack external prevents "Module not found" errors at build time.
      const existing = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...existing, /^chromium-bidi/, /^playwright-core/];
    }
    return config;
  },
};

export default nextConfig;

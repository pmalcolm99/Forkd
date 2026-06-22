import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Read the monorepo root package.json version and inline it (plus the git SHA
// passed in as a build arg) at build time. process.env.npm_package_version is
// only populated when run via a pnpm script, so it is undefined in the
// standalone production container — hence inlining here instead.
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(readFileSync(path.join(rootDir, "../../package.json"), "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp", "playwright-core", "bullmq", "ioredis"],
  transpilePackages: ["@forkd/ui"],
  env: {
    APP_VERSION: rootPkg.version,
    APP_GIT_SHA: process.env.GIT_SHA ?? "dev",
  },
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

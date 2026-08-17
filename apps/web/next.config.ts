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
  async headers() {
    // Baseline hardening everywhere. These are cheap and have no downside for a
    // single-origin app that never intends to be framed.
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];

    // The guest bill-split path carries a capability token in the URL. `no-referrer`
    // guarantees that token can never ride out in a Referer header, rather than
    // relying on the browser's default policy being strict enough. X-Robots-Tag
    // keeps it out of search indexes even for a crawler that only reads headers.
    //
    // The CSP here is much stricter than the baseline because it can be: guest
    // pages are self-contained HTML with inline CSS and no JavaScript at all, so
    // `default-src 'none'` costs nothing and turns any future injected <script>
    // into a no-op. Note these headers *replace* whatever a route handler sets —
    // Next applies config headers last — so this is the only place the guest CSP
    // can be defined.
    const guest = [
      ...baseline.filter((h) => h.key !== "Referrer-Policy" && h.key !== "Content-Security-Policy"),
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
      {
        key: "Content-Security-Policy",
        value:
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    ];

    return [
      { source: "/:path*", headers: baseline },
      { source: "/g/:path*", headers: guest },
    ];
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp"],
  transpilePackages: ["@forkd/ui"],
};

export default nextConfig;

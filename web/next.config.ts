import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // better-sqlite3 is a native addon; keep it external so Turbopack/webpack
  // does not try to bundle it.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

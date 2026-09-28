import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly and data files it loads from its own folder at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;

import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root so Turbopack doesn't pick the repo root
  // (which has a package.json + lockfile for Playwright E2E)
  turbopack: { root: path.resolve(__dirname) },
  // Trace from repo root so the sibling @grimoire-os/shared package
  // (file:../shared) is included in the standalone build.
  outputFileTracingRoot: path.resolve(__dirname, ".."),
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for a small, self-contained Docker image (see Dockerfile).
  output: "standalone",
};

export default nextConfig;

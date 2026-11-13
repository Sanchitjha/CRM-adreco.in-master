import type { NextConfig } from "next";

// Sent on every response. HSTS is ignored over plain HTTP, so it only takes effect once the site is on HTTPS.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Standalone output for a small, self-contained Docker image (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  // Server actions accept 1 MB by default. The lead importer takes spreadsheets of several months, up to 10 MB.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

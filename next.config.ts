import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Self-contained server bundle for cPanel/Passenger, enabled only by scripts/package-cpanel.py.
  ...(process.env.BUILD_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // Readable `file__Component` class names only in development; production emits bare `sc-` ids.
  compiler: { styledComponents: { displayName: process.env.NODE_ENV !== "production", ssr: true } },
  // The private analytics dashboard and its APIs: never cached, framed or indexed.
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Referrer-Policy", value: "same-origin" },
    ];
    return [{ source: "/analytics", headers: privateHeaders }, { source: "/api/analytics/:path*", headers: privateHeaders }];
  },
  async redirects() {
    return [{ source: "/:path*", has: [{ type: "host", value: "www.goalhint.com" }],
      destination: "https://goalhint.com/:path*", permanent: true }];
  },
};

export default nextConfig;

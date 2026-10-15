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
    return [
      // Resolve both the host and default locale in one hop. Config redirects also
      // retain the query string, unlike the root page's parameterless redirect.
      { source: "/", has: [{ type: "host", value: "www.goalhint.com" }],
        destination: "https://goalhint.com/en", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.goalhint.com" }],
        destination: "https://goalhint.com/:path*", permanent: true },
      { source: "/", destination: "/en", permanent: true },
    ];
  },
  async rewrites() {
    // Root-level sitemap URLs cover the entire site without directory-scope
    // restrictions. Keep native metadata handlers as the single XML authority.
    return [
      { source: "/sitemap-matches-:id.xml", destination: "/matches/sitemap/:id.xml" },
      { source: "/sitemap-archive-:id.xml", destination: "/archive/sitemap/:id.xml" },
    ];
  },
};

export default nextConfig;

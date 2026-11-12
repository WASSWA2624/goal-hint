import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  ...(process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_GOAL_HINT_DEMO === "true"
    ? { devIndicators: false as const } : {}),
  // The owned Windows snapshot keeps the dev graph in memory to avoid disk
  // compaction interrupting navigation. Production and other dev targets use their defaults.
  ...(process.env.NODE_ENV === "development" && process.platform === "win32" && process.env.NEXT_PUBLIC_GOAL_HINT_LOCAL_FOOTBALL === "true"
    ? { experimental: { turbopackFileSystemCacheForDev: false } } : {}),
  // No `X-Powered-By: Next.js` response header.
  poweredByHeader: false,
  // Allow dev assets and hot reload from this machine's actual IPv4 addresses,
  // along with loopback and the Android emulator's host alias.
  ...(process.env.NODE_ENV === "development" ? {
    allowedDevOrigins: ["127.0.0.1", "[::1]", "10.0.2.2", ...Object.values(networkInterfaces()).flatMap(
      (addresses) => (addresses ?? []).filter(({ family, internal }) => family === "IPv4" && !internal)
        .map(({ address }) => address),
    )],
  } : {}),
  // Self-contained server bundle for cPanel/Passenger, enabled only by scripts/package-cpanel.py.
  ...(process.env.BUILD_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // Readable `file__Component` class names only in development; production emits bare `sc-` ids.
  compiler: { styledComponents: { displayName: process.env.NODE_ENV !== "production", ssr: true } },
  // Every response: no MIME sniffing. Flags and brand files: browser-cached, since Next serves /public with max-age=0 (brand
  // files keep their names when they change, so only a day). The private owner dashboards (/analytics, /admin), the member
  // account and Get access pages, and their APIs: never cached, framed or indexed (the same list as `privateHeaders` in
  // src/server/http/private-http.ts).
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Referrer-Policy", value: "same-origin" },
    ];
    const privateSources = ["/analytics", "/api/analytics/:path*", "/admin", "/admin/:path*", "/api/admin/:path*",
      "/en/account", "/en/subscribe", "/en/best-slips/:date/:number", "/api/account/:path*", "/api/slips/:path*", "/r/:path*", "/s/:path*", "/payment-review/:path*"];
    const publicCache = [["/flags/:file*", "public, max-age=2592000, stale-while-revalidate=86400"],
      ["/brand/:file*", "public, max-age=86400, stale-while-revalidate=604800"],
      ["/sounds/:file*", "public, max-age=31536000, immutable"]] as const;
    // The global rule stays first and the private rules last: when a key repeats, the last matching rule wins.
    return [{ source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] },
      { source: "/offline", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "X-GoalHint-Offline-Entry", value: "1" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/offline-manifest.json", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "X-GoalHint-Offline-Manifest", value: "1" }] },
      { source: "/offline-worker.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self'" }] },
      ...publicCache.map(([source, value]) => ({ source, headers: [{ key: "Cache-Control", value }] })),
      ...privateSources.map((source) => ({ source, headers: privateHeaders }))];
  },
  async redirects() {
    return [
      // Resolve both the host and canonical Matches home in one hop, retaining queries.
      { source: "/", has: [{ type: "host", value: "www.goalhint.com" }],
        destination: "https://goalhint.com/en/matches", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.goalhint.com" }],
        destination: "https://goalhint.com/:path*", permanent: true },
      { source: "/", destination: "/en/matches", permanent: true },
    ];
  },
  async rewrites() {
    // Root-level sitemap URLs cover the entire site without directory-scope
    // restrictions. Keep native metadata handlers as the single XML authority.
    return {
      // Retire production workers left on the development origin before the
      // public worker file is considered. A cached page may never run new app JS.
      beforeFiles: process.env.NODE_ENV === "development" ? [
        { source: "/offline-worker.js", destination: "/api/development/offline-worker" },
      ] : [],
      afterFiles: [
        { source: "/sitemap-matches-:id.xml", destination: "/matches/sitemap/:id.xml" },
        { source: "/sitemap-archive-:id.xml", destination: "/archive/sitemap/:id.xml" },
      ],
    };
  },
};

export default nextConfig;

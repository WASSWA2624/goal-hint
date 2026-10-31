import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  ...(process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_GOAL_HINT_DEMO === "true"
    ? { devIndicators: false as const } : {}),
  // No `X-Powered-By: Next.js` response header.
  poweredByHeader: false,
  // Development only: let phones and other machines on the local network open `next dev` by its LAN address
  // (e.g. http://192.168.1.148:3000). Without this, Next blocks the dev scripts and HMR socket from that origin, so
  // pages never hydrate: lazy team crests stay as initials and client controls stay in their pending state.
  allowedDevOrigins: ["127.0.0.1", "[::1]", "10.0.2.2", "192.168.*.*"],
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
      "/en/account", "/en/subscribe", "/api/account/:path*", "/api/slips/:path*", "/r/:path*", "/s/:path*"];
    const publicCache = [["/flags/:file*", "public, max-age=2592000, stale-while-revalidate=86400"],
      ["/brand/:file*", "public, max-age=86400, stale-while-revalidate=604800"]] as const;
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

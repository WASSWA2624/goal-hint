import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Self-contained server bundle for cPanel/Passenger, enabled only by scripts/package-cpanel.py.
  ...(process.env.BUILD_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // Readable `file__Component` class names only in development; production emits bare `sc-` ids.
  compiler: { styledComponents: { displayName: process.env.NODE_ENV !== "production", ssr: true } },
  async redirects() {
    return [{ source: "/:path*", has: [{ type: "host", value: "www.goalhint.com" }],
      destination: "https://goalhint.com/:path*", permanent: true }];
  },
};

export default nextConfig;

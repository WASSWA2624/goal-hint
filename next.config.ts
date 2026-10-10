import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  compiler: { styledComponents: true },
  async redirects() {
    return [{ source: "/:path*", has: [{ type: "host", value: "www.goalhint.com" }],
      destination: "https://goalhint.com/:path*", permanent: true }];
  },
};

export default nextConfig;

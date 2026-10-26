import { createDiscoveryProxy } from "@/server/seo/proxy";

export const proxy = createDiscoveryProxy();

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|brand(?:/|$)|.*\\.).*)"],
};

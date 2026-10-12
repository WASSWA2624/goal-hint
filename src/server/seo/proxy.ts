import "server-only";
import { NextResponse, type NextRequest } from "next/server.js";
import { getLocaleRedirect } from "../../i18n/locales.ts";
import { getDiscoveryPolicy } from "./policy.ts";

// Attribution attached by search/social links is not application state. Remove only
// known keys so real filter errors still reach the route's strict validation.
const attributionKeys = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "utm_source_platform", "utm_creative_format", "utm_marketing_tactic", "gclid", "dclid", "gbraid", "wbraid", "fbclid", "msclkid"]);

export function createDiscoveryProxy(policy = getDiscoveryPolicy) {
  return (request: NextRequest) => {
    const pathname = getLocaleRedirect(request.nextUrl.pathname);
    const destination = request.nextUrl.clone();
    if (pathname) destination.pathname = pathname;
    let attribution = false;
    for (const key of [...destination.searchParams.keys()]) {
      if (!attributionKeys.has(key.toLowerCase())) continue;
      destination.searchParams.delete(key);
      attribution = true;
    }
    const response = pathname || attribution ? NextResponse.redirect(destination, pathname ? 307 : 308) : NextResponse.next();
    if (!policy().index) response.headers.set("X-Robots-Tag", "noindex, follow");
    return response;
  };
}

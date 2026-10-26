import "server-only";
import { NextResponse, type NextRequest } from "next/server.js";
import { isPrivatePage } from "../../domain/private-paths.ts";
import { getLocaleRedirect, isLocaleCaseVariant } from "../../i18n/locales.ts";
import { getDiscoveryPolicy } from "./policy.ts";

// Attribution attached by search/social links is not application state. Remove only
// known keys so real filter errors still reach the route's strict validation.
const attributionKeys = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "utm_source_platform", "utm_creative_format", "utm_marketing_tactic", "gclid", "dclid", "gbraid", "wbraid", "fbclid", "msclkid",
  // Share and click identifiers without an analytics network: stripped, never forwarded.
  "ttclid", "twclid", "li_fat_id", "igshid", "igsh", "mc_cid", "mc_eid", "yclid", "_gl", "srsltid"]);

const clickNetworks: Readonly<Record<string, "google" | "microsoft" | "meta">> = Object.freeze({
  gclid: "google", dclid: "google", gbraid: "google", wbraid: "google", msclkid: "microsoft", fbclid: "meta" });

/**
 * Campaign tags ride to consenting analytics in the redirect's fragment (`#gh_attr=…`), which browsers never
 * send to a server. Click identifiers are reduced to their ad network; the identifier itself is dropped.
 */
function attributionFragment(parameters: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const [key, value] of parameters) {
    const name = key.toLowerCase();
    if (name.startsWith("utm_") && ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].includes(name)
      && !kept.has(name) && value.trim()) kept.set(name, value.trim().slice(0, 100));
    else if (clickNetworks[name] && !kept.has("click")) kept.set("click", clickNetworks[name]);
  }
  return kept.size > 0 ? `gh_attr=${encodeURIComponent(kept.toString())}` : "";
}

export function createDiscoveryProxy(policy = getDiscoveryPolicy) {
  return (request: NextRequest) => {
    const pathname = getLocaleRedirect(request.nextUrl.pathname);
    const destination = request.nextUrl.clone();
    if (pathname) destination.pathname = pathname;
    let attribution = false;
    const fragment = attributionFragment(destination.searchParams);
    for (const key of [...destination.searchParams.keys()]) {
      if (!attributionKeys.has(key.toLowerCase())) continue;
      destination.searchParams.delete(key);
      attribution = true;
    }
    if (fragment && !/^\/en\/(?:account|subscribe)\/?$/u.test(destination.pathname)) destination.hash = fragment;
    // Unpublished languages stay temporary so a translation can replace them; case variants of a published locale move for good.
    const response = pathname || attribution ? NextResponse.redirect(destination, pathname && !isLocaleCaseVariant(request.nextUrl.pathname) ? 307 : 308)
      : NextResponse.next();
    // Owner dashboards and member pages (and their attribution redirects) are never indexed or followed, under any policy.
    if (isPrivatePage(request.nextUrl.pathname)) response.headers.set("X-Robots-Tag", "noindex, nofollow");
    else if (!policy().index) response.headers.set("X-Robots-Tag", "noindex, follow");
    return response;
  };
}

import { analyticsRules } from "./analytics-settings.ts";

/**
 * Private areas: the owner dashboards and the member account and Get access pages. They are never indexed, cached or
 * framed (`next.config.ts` adds the private headers to these paths and their APIs, `/api/admin/*` and `/api/account/*`).
 */
export const privatePaths = Object.freeze({
  analytics: analyticsRules.dashboardPath,
  admin: "/admin",
  account: "/en/account",
  subscribe: "/en/subscribe",
});

/** Owner-only pages: never counted by visitor analytics and disallowed in robots.txt. */
export const ownerPagePaths: readonly string[] = Object.freeze([privatePaths.analytics, privatePaths.admin]);
/**
 * Pages the proxy marks `noindex, nofollow`. Member pages stay crawlable in robots.txt, so crawlers can read that noindex.
 */
export const privatePagePaths: readonly string[] = Object.freeze(Object.values(privatePaths));

/** The path itself or anything below it; `/administrator` is not under `/admin`. */
export const isUnderPath = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);
export const isOwnerPage = (pathname: string) => ownerPagePaths.some((base) => isUnderPath(pathname, base));
export const isPrivatePage = (pathname: string) => privatePagePaths.some((base) => isUnderPath(pathname, base));

import "server-only";

import { cookies } from "next/headers.js";
import { connection } from "next/server.js";
import { getAnalyticsServices, loginNotice, type AnalyticsServices } from "../analytics/analytics-http.ts";
import { isSameOrigin, json } from "../http/private-http.ts";
import { verifyOwner, requireOwner, type Owner, type OwnerServices } from "./owner-auth.ts";

/**
 * The one admin guard. Every `/admin` page calls `adminPageGate` and every `/api/admin` route except login is wrapped in
 * `adminRoute`; tests/admin-routes.test.mjs checks both, so later pages and routes cannot forget it.
 */
export type AdminContext = Readonly<{ request: Request; owner: Owner; services: AnalyticsServices }>;
/** Sign-out's context: the session may already have ended, so there is no owner to hand over. */
export type SignOutContext = Readonly<{ request: Request; services: AnalyticsServices }>;
type AdminRouteOptions = Readonly<{ services?: OwnerServices }>;
type Route = (request: Request) => Promise<Response>;

/**
 * Owner session for every request; same-origin (Fetch Metadata, then Origin) for every request that is not a read.
 * `session: "optional"` is for sign-out alone (the route-guard test allows it nowhere else): still same-origin only, but
 * it runs without checking or extending the session, so signing out always clears the cookie, even after the session
 * has lapsed or while storage is failing.
 */
export function adminRoute(handler: (context: AdminContext) => Promise<Response>, options?: AdminRouteOptions): Route;
export function adminRoute(handler: (context: SignOutContext) => Promise<Response>, options: AdminRouteOptions & Readonly<{ session: "optional" }>): Route;
export function adminRoute(handler: (context: AdminContext) => Promise<Response>,
  { services = getAnalyticsServices, session }: AdminRouteOptions & Readonly<{ session?: "optional" }> = {}): Route {
  return async (request: Request): Promise<Response> => {
    // Checked first, so a cross-site request never reaches the database.
    if (request.method !== "GET" && request.method !== "HEAD" && !isSameOrigin(request)) {
      return json({ error: "forbidden", message: "Cross-site requests are refused." }, 403);
    }
    const resolved = await services();
    if (session === "optional") return (handler as (context: SignOutContext) => Promise<Response>)({ request, services: resolved });
    if (!resolved.auth) return json({ error: "unavailable", message: "Owner sign-in is unavailable." }, 503);
    const owner = await requireOwner(resolved, request);
    if (!owner) return json({ error: "unauthorized", message: "Your owner session has ended. Sign in again on /admin." }, 401);
    return handler({ request, owner, services: resolved });
  };
}

export type AdminPage =
  | Readonly<{ owner: Owner; services: AnalyticsServices }>
  | Readonly<{ owner: null; services: AnalyticsServices; login: ReturnType<typeof loginNotice> }>;

/**
 * The page side of the guard, as in `src/app/analytics/page.tsx`: render at request time, verify the owner session from
 * its cookie, otherwise return what the owner login shows.
 */
export async function adminPageGate(searchParams: Promise<Record<string, string | string[] | undefined>>,
  { services = getAnalyticsServices }: { services?: OwnerServices } = {}): Promise<AdminPage> {
  await connection();
  const resolved = await services();
  const owner = await verifyOwner(resolved, (await cookies()).get(resolved.config.cookies.session)?.value);
  if (owner) return { owner, services: resolved };
  return { owner: null, services: resolved, login: loginNotice(resolved, await searchParams) };
}

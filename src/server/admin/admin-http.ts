import "server-only";

import { autoRenewFor } from "../members/auto-renew.ts";
import { membersPurgeFor } from "../members/purge.ts";
import { cookies } from "next/headers.js";
import { connection } from "next/server.js";
import { getAnalyticsServices, type AnalyticsServices } from "../analytics/analytics-http.ts";
import { BodyDeadlineError, isSameOrigin, json, readLimitedBody } from "../http/private-http.ts";
import { memberCookieName } from "../members/member-sessions.ts";
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
    if (!resolved.database) {
      return json({ error: "unavailable", message: "Account sign-in is unavailable." }, 503);
    }
    const owner = await requireOwner(resolved, request);
    if (!owner) return json({ error: "unauthorized", message: "Sign in with an administrator account." }, 401);
    return handler({ request, owner, services: resolved });
  };
}

export type AdminPage =
  | Readonly<{ owner: Owner; services: AnalyticsServices }>
  | Readonly<{ owner: null; services: AnalyticsServices }>;

/**
 * The page side of the guard, as in `src/app/analytics/page.tsx`: render at request time, verify the owner session from
 * its account cookie, otherwise let the page redirect to the shared login.
 */
export async function adminPageGate(searchParams: Promise<Record<string, string | string[] | undefined>>,
  { services = getAnalyticsServices }: { services?: OwnerServices } = {}): Promise<AdminPage> {
  await connection();
  await searchParams;
  const resolved = await services();
  const jar = await cookies();
  const owner = await verifyOwner(resolved, jar.get(memberCookieName(resolved.config.production))?.value);
  if (owner) { if (resolved.database) { membersPurgeFor(resolved.database).maybePurge(); autoRenewFor(resolved.database).maybeSweep(); } return { owner, services: resolved }; }
  return { owner: null, services: resolved };
}

/** Owner actions send small JSON; a larger or slower body is refused before it is parsed. */
export const adminBodyRules = Object.freeze({ maximumBytes: 16_384, deadlineMs: 15_000 });

/**
 * The JSON object an owner action sent, or the response that refuses it. Requiring `application/json` also means a
 * cross-site page could only send it after a CORS preflight, behind the guard's same-origin check.
 */
export async function readJsonBody(request: Request): Promise<Readonly<{ body: Record<string, unknown> }> | Readonly<{ refusal: Response }>> {
  if (!/^application\/json\s*(;|$)/iu.test(request.headers.get("content-type") ?? "")) {
    return { refusal: json({ error: "invalid-request", message: "Send the change as JSON." }, 415) };
  }
  const tooLarge = { refusal: json({ error: "too-large", message: "The request is too large." }, 413) };
  if (Number(request.headers.get("content-length") ?? 0) > adminBodyRules.maximumBytes) return tooLarge;
  let bytes: Uint8Array | null;
  try { bytes = await readLimitedBody(request, adminBodyRules.maximumBytes, { deadlineMs: adminBodyRules.deadlineMs }); }
  catch (error) {
    if (error instanceof BodyDeadlineError) return { refusal: json({ error: "timeout", message: "The request took too long. Try again." }, 408) };
    // An aborted or broken upload is the sender's problem, never a server error.
    return { refusal: json({ error: "invalid-request", message: "The request did not arrive. Try again." }, 400) };
  }
  if (bytes === null) return tooLarge;
  try {
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (body !== null && typeof body === "object" && !Array.isArray(body)) return { body: body as Record<string, unknown> };
  } catch { /* Answered below. */ }
  return { refusal: json({ error: "invalid-request", message: "Send the change as a JSON object." }, 400) };
}

import "server-only";

import { privatePaths } from "../../domain/private-paths.ts";
import type { Admin, VerifyOptions } from "../analytics/analytics-auth.ts";
import { createLoginHandler, createLogoutHandler, getAnalyticsServices, requireAdmin, type AnalyticsServices,
  type SignInOptions } from "../analytics/analytics-http.ts";
import { ownerSignInAudit } from "./audit.ts";

/**
 * The owner is the analytics administrator: one login, session table, Strict cookie, 12 h / 2 h limits and the existing
 * `GOAL_HINT_ANALYTICS_ADMIN_*` keys, so the owner dashboard adds no env key.
 */
export type Owner = Admin;
export type OwnerServices = () => Promise<AnalyticsServices>;

/** Fixed owner routes: sign-in and sign-out always land on the dashboard, never on a URL taken from the request. */
export const ownerRoutes = Object.freeze({ home: privatePaths.admin, login: "/api/admin/login", logout: "/api/admin/logout" });

/** The owner named by a session token (Server Components read it from the cookie store), or null when absent or unavailable. */
export async function verifyOwner(services: AnalyticsServices, token: string | undefined, options?: VerifyOptions): Promise<Owner | null> {
  if (!services.auth) return null;
  try { return await services.auth.verify(token, options); } catch { return null; }
}

/** The owner signed in on this request, or null. `touch: false` checks without extending the session. */
export function requireOwner(services: AnalyticsServices, request: Request, options?: VerifyOptions): Promise<Owner | null> {
  return requireAdmin(services, request, options);
}

/** `POST /api/admin/login`: the analytics sign-in handler, landing on `/admin`, audited in OwnerAuditEvent by default. */
export function createOwnerLoginHandler({ services = getAnalyticsServices, audit = ownerSignInAudit(services, "admin") }:
  { services?: OwnerServices; audit?: SignInOptions["audit"] } = {}) {
  return createLoginHandler(services, { home: ownerRoutes.home, audit });
}

/** `POST /api/admin/logout`: deletes the session and lands on `/admin?login=signed-out`, audited by default. */
export function createOwnerLogoutHandler({ services = getAnalyticsServices, audit = ownerSignInAudit(services, "admin") }:
  { services?: OwnerServices; audit?: SignInOptions["audit"] } = {}) {
  return createLogoutHandler(services, { home: ownerRoutes.home, audit });
}

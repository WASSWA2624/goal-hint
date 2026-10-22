import "server-only";

import { privatePaths } from "../../domain/private-paths.ts";
import type { Admin, VerifyOptions } from "../analytics/analytics-auth.ts";
import { createLoginHandler, createLogoutHandler, getAnalyticsServices, requireAdmin, verifyAdminSession, type AnalyticsServices,
  type SignInOptions } from "../analytics/analytics-http.ts";
import { ownerSignInAudit } from "./audit.ts";

/**
 * Dashboards accept the existing analytics owner session or a currently allowlisted, verified member session.
 * The latter retains its own member cookie and uses the account ID as its audit actor.
 */
export type Owner = Admin;
export type OwnerServices = () => Promise<AnalyticsServices>;

/** Fixed owner routes: sign-in and sign-out always land on the dashboard, never on a URL taken from the request. */
export const ownerRoutes = Object.freeze({ home: privatePaths.admin, login: "/api/admin/login", logout: "/api/admin/logout" });

/** The owner named by a session token (Server Components read it from the cookie store), or null when absent or unavailable. */
export function verifyOwner(services: AnalyticsServices, token: string | undefined, options?: VerifyOptions, memberToken?: string): Promise<Owner | null> {
  return verifyAdminSession(services, token, memberToken, options);
}

/** The owner signed in on this request, or null. `touch: false` checks without extending the session. */
export function requireOwner(services: AnalyticsServices, request: Request, options?: VerifyOptions): Promise<Owner | null> {
  return requireAdmin(services, request, options);
}

/** `POST /api/admin/login`: configured phone or legacy owner sign-in, landing on `/admin`, audited by default. */
export function createOwnerLoginHandler({ services = getAnalyticsServices, audit = ownerSignInAudit(services, "admin"), memberAuth }:
  { services?: OwnerServices; audit?: SignInOptions["audit"]; memberAuth?: SignInOptions["memberAuth"] } = {}) {
  return createLoginHandler(services, { home: ownerRoutes.home, audit, memberAuth });
}

/** `POST /api/admin/logout`: deletes the session and lands on `/admin?login=signed-out`, audited by default. */
export function createOwnerLogoutHandler({ services = getAnalyticsServices, audit = ownerSignInAudit(services, "admin") }:
  { services?: OwnerServices; audit?: SignInOptions["audit"] } = {}) {
  return createLogoutHandler(services, { home: ownerRoutes.home, audit });
}

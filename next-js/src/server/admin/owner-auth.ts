import "server-only";

import { privatePaths } from "../../domain/private-paths.ts";
import type { Admin } from "../analytics/analytics-auth.ts";
import { createLoginHandler, createLogoutHandler, getAnalyticsServices, requireAdmin, verifyAdminSession, type AnalyticsServices,
  type SignInOptions } from "../analytics/analytics-http.ts";
import { ownerSignInAudit } from "./audit.ts";

/**
 * Dashboards accept a currently allowlisted, verified account session.
 * The account ID is the audit actor; legacy owner cookies cannot grant access.
 */
export type Owner = Admin;
export type OwnerServices = () => Promise<AnalyticsServices>;

/** Old API paths remain redirects/logout aliases; all authentication uses the account form. */
export const ownerRoutes = Object.freeze({ home: privatePaths.admin, login: "/api/admin/login", logout: "/api/admin/logout" });

/** The owner named by a session token (Server Components read it from the cookie store), or null when absent or unavailable. */
export function verifyOwner(services: AnalyticsServices, memberToken: string | undefined): Promise<Owner | null> {
  return verifyAdminSession(services, memberToken);
}

/** The administrator signed in on this request, or null. */
export function requireOwner(services: AnalyticsServices, request: Request): Promise<Owner | null> {
  return requireAdmin(services, request);
}

/** `POST /api/admin/login`: old bookmarks return to the single login without accepting credentials. */
export function createOwnerLoginHandler() {
  return createLoginHandler();
}

/** `POST /api/admin/logout`: ends account and legacy sessions and returns to the shared login. */
export function createOwnerLogoutHandler({ services = getAnalyticsServices, audit = ownerSignInAudit(services, "admin") }:
  { services?: OwnerServices; audit?: SignInOptions["audit"] } = {}) {
  return createLogoutHandler(services, { audit });
}

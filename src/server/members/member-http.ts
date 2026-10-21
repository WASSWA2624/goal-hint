import "server-only";

import { createPayments, type Payments } from "./payments.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { cookie, isSameOrigin, json, privateHeaders, readCookie, redirect } from "../http/private-http.ts";
import { createMemberSessions, memberCookieName, type MemberIdentity, type MemberSessions } from "./member-sessions.ts";
import { settingsServiceFor, type SettingsState } from "./settings.ts";
import { createAccessCodes, type AccessCodes } from "./access-codes.ts";
import { createMemberAuth, type MemberAuth } from "./member-auth.ts";

export const memberRefusal = "We couldn't complete this. Please contact us.";
export type MemberServices = Readonly<{ config: AnalyticsConfig; settings: SettingsState; sessions: MemberSessions | null; payments?: Payments | null; codes?: AccessCodes | null; auth?: MemberAuth | null }>;
export type MemberServicesSource = () => Promise<MemberServices>;

export async function getMemberServices(): Promise<MemberServices> {
  const { database, config } = await getAnalyticsServices();
  let keyed = true;
  try { config.key("member-readiness", "ready"); } catch { keyed = false; }
  return { config, settings: database ? await settingsServiceFor(database).current() : { settings: null, source: "unavailable" },
    sessions: database && keyed ? createMemberSessions({ database, config }) : null,
    payments: database && keyed ? createPayments({ database, config }) : null,
    codes: database && keyed ? createAccessCodes({ database, config }) : null,
    auth: database && keyed ? createMemberAuth({ database, config }) : null };
}

export type MemberContext = Readonly<{ request: Request; services: MemberServices; member: MemberIdentity | null }>;
type MemberRouteOptions = Readonly<{ services?: MemberServicesSource; access: "sign-in" | "member" | "unlocked" | "sign-out" }>;

/** One same-origin and mode guard for member writes; sign-out can always clear the browser cookie. */
export function memberRoute(handler: (context: MemberContext) => Promise<Response>, { services = getMemberServices, access }: MemberRouteOptions) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden", message: memberRefusal }, 403);
    try {
      const resolved = await services();
      if (access === "sign-out") return await handler({ request, services: resolved, member: null });
      if (resolved.settings.settings?.paywallMode === "off" && access === "member") return json({ error: "closed", message: "Subscriptions are not open yet." }, 403);
      if (!resolved.settings.settings || !resolved.sessions) return json({ error: "unavailable", message: "Member access is unavailable. Try again later." }, 503);
      const member = access === "sign-in" ? null : await resolved.sessions.verify(readCookie(request, memberCookieName(resolved.config.production)));
      if (access !== "sign-in" && !member || access === "unlocked" && (!member?.codeEnteredAt || member.blocked)) return json({ error: "forbidden", message: memberRefusal }, 403);
      return await handler({ request, services: resolved, member });
    } catch { return json({ error: "unavailable", message: "Member access is unavailable. Try again later." }, 503); }
  };
}

const wantsJson = (request: Request) => (request.headers.get("accept") ?? "").includes("application/json") || /^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "");

export function createMemberSignInHandler(services: MemberServicesSource = getMemberServices) {
  // Keep the legacy endpoint as an alias, without retaining number-only or subscription-code authentication.
  return async (request: Request) => (await import("./member-auth-http.ts")).createMemberAuthHandler("login", services)(request);
}

export function createMemberSignOutHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved }) => {
    const name = memberCookieName(resolved.config.production);
    try { await resolved.sessions?.signOut(readCookie(request, name)); } catch { /* Clear the local cookie even during a storage outage. */ }
    const cleared = cookie(resolved.config, name, "", 0, "Lax");
    const response = wantsJson(request) ? json({ next: "/en/account?status=signed-out", phone: null }, 200, { "Set-Cookie": cleared })
      : redirect("/en/account?status=signed-out", [cleared]);
    response.headers.set("Clear-Site-Data", '"cache"');
    return response;
  }, { services, access: "sign-out" });
}

export function createMemberDevicesHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ services: resolved, member }) => {
    if (!await resolved.sessions!.signOutOthers(member!)) return json({ error: "forbidden", message: memberRefusal }, 403);
    return redirect("/en/account?status=devices-signed-out");
  }, { services, access: "unlocked" });
}

// Page and API paths receive these headers from next.config.ts, including responses produced before a handler runs.
export { privateHeaders };

import "server-only";

import { createPayments, type Payments } from "./payments.ts";
import { getAnalyticsServices, type AnalyticsServices } from "../analytics/analytics-http.ts";
import { getAnalyticsConfig, type AnalyticsConfig } from "../analytics/analytics-config.ts";
import { signedOutPath } from "../../domain/member-navigation.ts";
import { cookie, isSameOrigin, json, privateHeaders, readCookie, redirect } from "../http/private-http.ts";
import { createMemberSessions, memberCookieName, type MemberIdentity, type MemberSessions } from "./member-sessions.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { settingsServiceFor, type SettingsState } from "./settings.ts";
import { createAccessCodes, type AccessCodes } from "./access-codes.ts";
import { createMemberAuth, type MemberAuth } from "./member-auth.ts";
import { createMemberPreferences, type MemberPreferences } from "./member-preferences.ts";
import { createPlansService } from "./plans.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { cheapestActivePlan, type SubscriptionOffer } from "../../domain/subscription-offer.ts";

export const memberRefusal = "We couldn't complete this. Please contact us.";
export type MemberServices = Readonly<{ config: AnalyticsConfig; settings: SettingsState; sessions: MemberSessions | null; payments?: Payments | null; codes?: AccessCodes | null; auth?: MemberAuth | null;
  preferences?: MemberPreferences | null;
  offer?: (() => Promise<SubscriptionOffer | null>) | null }>;
export type MemberServicesSource = () => Promise<MemberServices>;

export async function getMemberServices(): Promise<MemberServices> {
  const { database, config } = await getAnalyticsServices();
  let keyed = true;
  try { config.key("member-readiness", "ready"); } catch { keyed = false; }
  return { config, settings: database ? await settingsServiceFor(database).current() : { settings: null, source: "unavailable" },
    sessions: database && keyed ? createMemberSessions({ database, config }) : null,
    payments: database && keyed ? createPayments({ database, config }) : null,
    codes: database && keyed ? createAccessCodes({ database, config }) : null,
    auth: database && keyed ? createMemberAuth({ database, config }) : null,
    preferences: database && keyed ? createMemberPreferences({ database }) : null,
    offer: database ? () => readOffer(database) : null };
}

/** Every page view checks the session, so the cheapest plan is read at most once a minute; a failed read is retried next time. */
let cachedOffer: Readonly<{ until: number; offer: Promise<SubscriptionOffer | null> }> | null = null;
function readOffer(database: DatabaseRuntime): Promise<SubscriptionOffer | null> {
  const now = Date.now();
  if (cachedOffer && cachedOffer.until > now) return cachedOffer.offer;
  const offer = createPlansService(database).list().then(cheapestActivePlan);
  cachedOffer = { until: now + 60_000, offer };
  offer.catch(() => { if (cachedOffer?.offer === offer) cachedOffer = null; });
  return offer;
}

export type MemberContext = Readonly<{ request: Request; services: MemberServices; member: MemberIdentity | null }>;
/** "account" is "member" without the closed-sales refusal, for account settings a member must be able to change at any time. */
type MemberRouteOptions = Readonly<{ services?: MemberServicesSource; access: "sign-in" | "member" | "account" | "unlocked" | "sign-out" }>;

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

/** Both identities are cleared even if their storage is unavailable; old owner sessions never authorize access. */
export function createMemberSignOutHandler(services: MemberServicesSource = getMemberServices,
  legacySource: () => Promise<Pick<AnalyticsServices, "auth">> = getAnalyticsServices,
  configSource: () => Promise<AnalyticsConfig> = getAnalyticsConfig) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden", message: memberRefusal }, 403);
    let resolved: MemberServices | null = null;
    try { resolved = await services(); } catch { /* Configuration alone is enough to clear both cookies. */ }
    const config = resolved?.config ?? await configSource(), name = memberCookieName(config.production);
    try { await resolved?.sessions?.signOut(readCookie(request, name)); } catch { /* Cookie clearing survives a member storage outage. */ }
    const legacyToken = readCookie(request, config.cookies.session);
    if (legacyToken !== undefined) {
      try { await (await legacySource()).auth?.logout(legacyToken); } catch { /* Cookie clearing survives a legacy storage outage. */ }
    }
    // Preserve an explicit anonymous choice in demo mode, where the first cookie-free
    // visit otherwise selects the seeded member. A normal login replaces this cookie.
    const demo = isDevelopmentDemo();
    const next = signedOutPath, cleared = [cookie(config, name, demo ? "signed-out" : "", demo ? 34_560_000 : 0, "Lax"), cookie(config, config.cookies.session, "", 0)];
    const response = wantsJson(request) ? json({ next, phone: null }) : redirect(next);
    for (const value of cleared) response.headers.append("Set-Cookie", value);
    response.headers.set("Clear-Site-Data", '"cache"');
    return response;
  };
}

export function createMemberDevicesHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ services: resolved, member }) => {
    if (!await resolved.sessions!.signOutOthers(member!)) return json({ error: "forbidden", message: memberRefusal }, 403);
    return redirect("/en/account?status=devices-signed-out");
  }, { services, access: "unlocked" });
}

// Page and API paths receive these headers from next.config.ts, including responses produced before a handler runs.
export { privateHeaders };

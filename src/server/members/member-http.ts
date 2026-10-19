import "server-only";

import { memberNextPath } from "../../domain/member-navigation.ts";
import { normalizePhone } from "../../domain/phone.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { clientAddress, cookie, isSameOrigin, json, privateHeaders, readCookie, readLimitedBody, redirect } from "../http/private-http.ts";
import { createMemberSessions, memberCookieName, memberSessionRules, type MemberIdentity, type MemberSessions } from "./member-sessions.ts";
import { settingsServiceFor, type SettingsState } from "./settings.ts";

export const memberRefusal = "We couldn't complete this. Please contact us.";
export type MemberServices = Readonly<{ config: AnalyticsConfig; settings: SettingsState; sessions: MemberSessions | null }>;
export type MemberServicesSource = () => Promise<MemberServices>;

export async function getMemberServices(): Promise<MemberServices> {
  const { database, config } = await getAnalyticsServices();
  let keyed = true;
  try { config.key("member-readiness", "ready"); } catch { keyed = false; }
  return { config, settings: database ? await settingsServiceFor(database).current() : { settings: null, source: "unavailable" },
    sessions: database && keyed ? createMemberSessions({ database, config }) : null };
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
      if (resolved.settings.settings?.paywallMode === "off") return json({ error: "closed", message: "Subscriptions are not open yet." }, 403);
      if (!resolved.settings.settings || !resolved.sessions) return json({ error: "unavailable", message: "Member access is unavailable. Try again later." }, 503);
      const member = access === "sign-in" ? null : await resolved.sessions.verify(readCookie(request, memberCookieName(resolved.config.production)));
      if (access !== "sign-in" && !member || access === "unlocked" && (!member?.codeEnteredAt || member.blocked)) return json({ error: "forbidden", message: memberRefusal }, 403);
      return await handler({ request, services: resolved, member });
    } catch { return json({ error: "unavailable", message: "Member access is unavailable. Try again later." }, 503); }
  };
}

const wantsJson = (request: Request) => (request.headers.get("accept") ?? "").includes("application/json") || /^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "");

/** A bounded body, strict field whitelist, and no identity in any redirect. */
async function signInBody(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return null;
  const bytes = await readLimitedBody(request, 2048, { deadlineMs: 15_000 });
  if (!bytes) return null;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let body: Record<string, unknown>;
  if (/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) {
    const input: unknown = JSON.parse(text);
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    body = input as Record<string, unknown>;
  } else if (/^application\/x-www-form-urlencoded(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) {
    const parameters = new URLSearchParams(text);
    if ([...parameters.keys()].some((key) => parameters.getAll(key).length !== 1)) return null;
    body = Object.fromEntries(parameters);
  } else return null;
  return Object.keys(body).every((key) => ["phone", "destination", "return"].includes(key)) ? body : null;
}

export function createMemberSignInHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved }) => {
    let body;
    try { body = await signInBody(request); } catch { body = null; }
    if (!body) return json({ error: "invalid-request", message: memberRefusal }, 400);
    const phone = normalizePhone(body.phone);
    if (!phone) return wantsJson(request) ? json({ error: "invalid-phone", message: "Enter a valid phone number with its country code." }, 400)
      : redirect(memberNextPath(body.destination, body.return, "invalid-phone"));
    const name = memberCookieName(resolved.config.production);
    const result = await resolved.sessions!.signIn(phone, clientAddress(request.headers), readCookie(request, name));
    if (result.status === "busy") return json({ error: "busy", message: "Busy, try again later." }, 429, { "Retry-After": "3600" });
    const next = memberNextPath(body.destination, body.return);
    const sessionCookie = cookie(resolved.config, name, result.token, memberSessionRules.cookieSeconds, "Lax");
    return wantsJson(request) ? json({ next }, 200, { "Set-Cookie": sessionCookie }) : redirect(next, [sessionCookie]);
  }, { services, access: "sign-in" });
}

export function createMemberSignOutHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved }) => {
    const name = memberCookieName(resolved.config.production);
    try { await resolved.sessions?.signOut(readCookie(request, name)); } catch { /* Clear the local cookie even during a storage outage. */ }
    const response = redirect("/en/account?status=signed-out", [cookie(resolved.config, name, "", 0, "Lax")]);
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

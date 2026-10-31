import "server-only";
import { readReferralAttribution, referralCookieName } from "./referral-attribution.ts";

import { memberReturnPath } from "../../domain/member-navigation.ts";
import { adminLandingPath } from "../../domain/admin-navigation.ts";
import { noCredit, type SubscriptionSummary } from "../../domain/subscription-summary.ts";
import { clientAddress, cookie, isSameOrigin, json, readCookie, readLimitedBody } from "../http/private-http.ts";
import { getMemberServices, type MemberServices, type MemberServicesSource } from "./member-http.ts";
import type { AuthBinding, AuthFailure } from "./member-auth.ts";
import { memberCookieName, memberSessionRules } from "./member-sessions.ts";
import { adminSessionRules } from "../analytics/analytics-auth.ts";
import { isMemberAdminPhone } from "./member-admin.ts";

type AuthAction = "register" | "login" | "phone" | "password" | "forgot" | "reset" | "verification" | "verify" | "reset-code";
const fields: Readonly<Record<AuthAction, readonly string[]>> = {
  register: ["phone", "password", "return"], login: ["phone", "password", "return", "destination"],
  phone: ["phone", "currentPassword"], password: ["password", "currentPassword"],
  forgot: ["phone", "channel", "return"], reset: ["password", "return"],
  verification: ["channel", "return"], verify: ["code", "return", "whatsappNotifications"], "reset-code": ["phone", "code", "return"],
};

async function bodyOf(request: Request, allowed: readonly string[]): Promise<Record<string, unknown> | null> {
  const bytes = await readLimitedBody(request, 2048, { deadlineMs: 15_000 });
  if (!bytes) return null;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let body: unknown;
  if (/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) body = JSON.parse(text);
  else if (/^application\/x-www-form-urlencoded(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) {
    const parameters = new URLSearchParams(text);
    if ([...parameters.keys()].some((name) => parameters.getAll(name).length !== 1)) return null;
    body = Object.fromEntries(parameters);
  } else return null;
  return body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).every((field) => allowed.includes(field))
    ? body as Record<string, unknown> : null;
}

function failure(result: AuthFailure) {
  const status = { invalid: 400, unauthorized: 401, busy: 429, conflict: 409, unavailable: 503 }[result.status];
  return json({ error: result.status, message: result.message }, status, result.status === "busy" ? { "Retry-After": "60" } : {});
}

/** Auth remains available when sales are off. A verified session authorizes password changes; phone changes check its password.
 * Verification precedes member access; signed-out recovery grants a bounded reset-only cookie. All writes are same-origin. */
export function createMemberAuthHandler(action: AuthAction, source: MemberServicesSource = getMemberServices) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden", message: "This request must come from Goal Hint." }, 403);
    try {
      let body;
      try { body = await bodyOf(request, fields[action]); } catch { body = null; }
      if (!body) return json({ error: "invalid-request", message: "Check the form and try again." }, 400);
      if (action === "verify" && body.whatsappNotifications !== undefined && typeof body.whatsappNotifications !== "boolean")
        return json({ error: "invalid-request", message: "Choose a valid WhatsApp update preference." }, 400);
      const services = await source();
      if (!services.auth || !services.sessions) return json({ error: "unavailable", message: "Account access is unavailable. Try again later." }, 503);
      const memberName = memberCookieName(services.config.production), currentToken = readCookie(request, memberName);
      const binding: AuthBinding = { member: await services.sessions.verify(currentToken) }, address = clientAddress(request.headers);
      if ((action === "forgot" || action === "reset-code") && binding.member)
        return json({ error: "signed-in", message: "Use Change password in Account while signed in." }, 409);
      if (action === "forgot" || action === "verification") {
        const result = action === "forgot" ? await services.auth.requestPasswordReset(body.phone, address, body.channel)
          : await services.auth.requestVerification(body.channel, currentToken, address);
        return result.status === "requested" ? json(result) : failure(result);
      }
      const result = action === "login" ? await services.auth.login(body.phone, body.password, address, currentToken)
        : action === "register" ? await services.auth.register(body.phone, body.password, binding, address,
          readReferralAttribution(services.config, readCookie(request, referralCookieName(services.config.production)), Date.now())?.code)
        : action === "verify" ? await services.auth.verifyAccount(body.code, currentToken, address, body.whatsappNotifications === true)
        : action === "reset-code" ? await services.auth.verifyPasswordReset(body.phone, body.code, address)
        : action === "phone" ? await services.auth.changePhone(body.phone, body.currentPassword, binding)
        : action === "reset" ? await services.auth.resetPassword(body.password, currentToken, address)
        : await services.auth.changePassword(body.password, binding);
      if (result.status !== "authenticated") return failure(result);
      // Authentication finishes at home; restricted sessions complete their required step first.
      const returnTo = ["register", "login", "verify", "reset"].includes(action) ? "/en" : memberReturnPath(body.return);
      const restrictedPath = (view: string) => `/en/account?${new URLSearchParams({ view, ...(returnTo ? { return: returnTo } : {}) })}`;
      const next = result.requiresPasswordChange ? restrictedPath("new-password")
        : result.requiresVerification ? restrictedPath("verify")
        : result.administrator ? adminLandingPath
        : returnTo ?? (action === "phone" ? "/en/account?status=phone-changed"
        : action === "password" ? "/en/account?status=password-changed" : "/en/account");
      const response = json({ next, phone: result.phone, ...(result.requiresPasswordChange ? { requiresPasswordChange: true } : {}),
        ...(result.requiresVerification ? { requiresVerification: true } : {}),
        ...(result.trial ? { trial: result.trial } : {}),
        ...(typeof result.otherDeviceSignedOut === "boolean" ? { otherDeviceSignedOut: result.otherDeviceSignedOut } : {}) });
      response.headers.append("Set-Cookie", cookie(services.config, memberName, result.token, result.requiresPasswordChange ? 900 : memberSessionRules.cookieSeconds, "Lax"));
      if (action === "register" && readCookie(request, referralCookieName(services.config.production)) !== undefined)
        response.headers.append("Set-Cookie", cookie(services.config, referralCookieName(services.config.production), "", 0, "Lax"));
      response.headers.append("Set-Cookie", cookie(services.config, services.config.cookies.session, "", 0));
      if (result.administrator && !result.requiresPasswordChange && !result.requiresVerification)
        response.headers.append("Set-Cookie", cookie(services.config, services.config.cookies.exclude, "1", adminSessionRules.excludeMaxAgeSeconds));
      return response;
    } catch { return json({ error: "unavailable", message: "Account access is unavailable. Try again later." }, 503); }
  };
}

export function createMemberSessionHandler(source: MemberServicesSource = getMemberServices) {
  return async (request: Request): Promise<Response> => {
    try {
      const services: MemberServices = await source();
      if (!services.sessions) return json({ phone: null, error: "unavailable" }, 503);
      const member = await services.sessions.verify(readCookie(request, memberCookieName(services.config.production)));
      const administrator = !!member && !member.blocked && member.administrator === true && isMemberAdminPhone(member.phone);
      const salesOpen = !!services.settings?.settings && services.settings.settings.paywallMode !== "off";
      const subscription: SubscriptionSummary = { activeUntil: null, paymentPending: false,
        canSubscribe: salesOpen && !member?.blocked && !administrator, ...noCredit };
      // Only a visitor or member without access who can subscribe reads the cheapest plan, for the access bar's offer.
      const withOffer = async (summary: SubscriptionSummary): Promise<SubscriptionSummary> => {
        const offer = !summary.activeUntil && summary.canSubscribe && services.offer ? await services.offer().catch(() => null) : null;
        return offer ? { ...summary, offer } : summary;
      };
      if (!member || member.blocked || administrator) return json({ phone: member?.phone ?? null, administrator, subscription: await withOffer(subscription) });
      if (!services.codes) return json({ phone: null, error: "unavailable" }, 503);
      // A chain that ended (or ends within the lead) renews from credit on this request when auto-renewal is on.
      try { await services.codes.renewDue(member.accountId, { prefer: [member.tokenHash] }); } catch { /* The summary below still answers. */ }
      const status = await services.codes.subscriptionStatus(member);
      // The verified session may have been removed or blocked while its subscription was being read.
      if (!status) return json({ phone: null, administrator: false, subscription: { activeUntil: null, paymentPending: false, canSubscribe: false, ...noCredit } });
      return json({ phone: member.phone, administrator, subscription: await withOffer({ ...subscription, ...status }) });
    } catch { return json({ phone: null, error: "unavailable" }, 503); }
  };
}

import "server-only";

import { memberReturnPath } from "../../domain/member-navigation.ts";
import { clientAddress, cookie, isSameOrigin, json, readCookie, readLimitedBody } from "../http/private-http.ts";
import { getMemberServices, type MemberServices, type MemberServicesSource } from "./member-http.ts";
import type { AuthBinding, AuthFailure } from "./member-auth.ts";
import { memberCookieName, memberSessionRules } from "./member-sessions.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import { requireOwner, type OwnerServices } from "../admin/owner-auth.ts";

type AuthAction = "register" | "login" | "phone" | "password" | "forgot" | "reset" | "verification" | "verify" | "reset-code";
const fields: Readonly<Record<AuthAction, readonly string[]>> = {
  register: ["phone", "password", "return"], login: ["phone", "password", "return", "destination"],
  phone: ["phone", "currentPassword"], password: ["password", "currentPassword"],
  forgot: ["phone", "channel", "return"], reset: ["password", "return"],
  verification: ["channel", "return"], verify: ["code", "return"], "reset-code": ["phone", "code", "return"],
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

/** Auth remains available when subscription sales are off. Profile changes require the current password;
 * verification is required before member access, and recovery grants a bounded reset-only cookie. All writes are same-origin. */
export function createMemberAuthHandler(action: AuthAction, source: MemberServicesSource = getMemberServices) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden", message: "This request must come from Goal Hint." }, 403);
    try {
      let body;
      try { body = await bodyOf(request, fields[action]); } catch { body = null; }
      if (!body) return json({ error: "invalid-request", message: "Check the form and try again." }, 400);
      const services = await source();
      if (!services.auth || !services.sessions) return json({ error: "unavailable", message: "Account access is unavailable. Try again later." }, 503);
      const memberName = memberCookieName(services.config.production), currentToken = readCookie(request, memberName);
      const binding: AuthBinding = { member: await services.sessions.verify(currentToken) }, address = clientAddress(request.headers);
      if (action === "forgot" || action === "verification") {
        const result = action === "forgot" ? await services.auth.requestPasswordReset(body.phone, address, body.channel)
          : await services.auth.requestVerification(body.channel, currentToken, address);
        return result.status === "requested" ? json(result) : failure(result);
      }
      const result = action === "login" ? await services.auth.login(body.phone, body.password, address, currentToken)
        : action === "register" ? await services.auth.register(body.phone, body.password, binding, address)
        : action === "verify" ? await services.auth.verifyAccount(body.code, currentToken, address)
        : action === "reset-code" ? await services.auth.verifyPasswordReset(body.phone, body.code, address)
        : action === "phone" ? await services.auth.changePhone(body.phone, body.currentPassword, binding)
        : action === "reset" ? await services.auth.resetPassword(body.password, currentToken, address)
        : await services.auth.changePassword(body.password, body.currentPassword, binding);
      if (result.status !== "authenticated") return failure(result);
      const returnTo = memberReturnPath(body.return);
      const restrictedPath = (view: string) => `/en/account?${new URLSearchParams({ view, ...(returnTo ? { return: returnTo } : {}) })}`;
      const next = result.administrator ? "/admin" : result.requiresPasswordChange ? restrictedPath("new-password")
        : result.requiresVerification ? restrictedPath("verify")
        : memberReturnPath(body.return) ?? (body.destination === "subscribe" ? "/en/subscribe"
        : action === "phone" ? "/en/account?status=phone-changed" : action === "password" || action === "reset" ? "/en/account?status=password-changed" : "/en/account");
      const response = json({ next, phone: result.phone, ...(result.requiresPasswordChange ? { requiresPasswordChange: true } : {}),
        ...(result.requiresVerification ? { requiresVerification: true } : {}),
        ...(typeof result.otherDeviceSignedOut === "boolean" ? { otherDeviceSignedOut: result.otherDeviceSignedOut } : {}) });
      response.headers.append("Set-Cookie", cookie(services.config, memberName, result.token, result.requiresPasswordChange ? 900 : memberSessionRules.cookieSeconds, "Lax"));
      return response;
    } catch { return json({ error: "unavailable", message: "Account access is unavailable. Try again later." }, 503); }
  };
}

export function createMemberSessionHandler(source: MemberServicesSource = getMemberServices, ownerSource: OwnerServices = getAnalyticsServices) {
  return async (request: Request): Promise<Response> => {
    try {
      const services: MemberServices = await source();
      if (!services.sessions) return json({ phone: null, error: "unavailable" }, 503);
      const member = await services.sessions.verify(readCookie(request, memberCookieName(services.config.production)));
      const administrator = !!await requireOwner(await ownerSource(), request, { touch: false });
      return json({ phone: member?.phone ?? null, administrator });
    } catch { return json({ phone: null, error: "unavailable" }, 503); }
  };
}

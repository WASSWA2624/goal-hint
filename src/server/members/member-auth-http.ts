import "server-only";

import { randomBytes } from "node:crypto";
import { memberReturnPath } from "../../domain/member-navigation.ts";
import { clientAddress, cookie, isSameOrigin, json, readCookie, readLimitedBody } from "../http/private-http.ts";
import { getMemberServices, type MemberServices, type MemberServicesSource } from "./member-http.ts";
import type { AuthBinding, AuthFailure, VerificationPurpose } from "./member-auth.ts";
import { memberCookieName, memberSessionRules, validMemberToken } from "./member-sessions.ts";

export const memberVerificationCookieName = (production: boolean) => `${production ? "__Host-" : ""}goal-hint-verification`;
type AuthAction = "verification" | "confirm" | "register" | "login" | "phone" | "password";
const fields: Readonly<Record<AuthAction, readonly string[]>> = {
  verification: ["purpose", "phone", "channel"], confirm: ["challengeId", "code"], register: ["phone", "password", "verificationToken", "return"],
  login: ["phone", "password", "verificationToken", "return", "destination"], phone: ["phone", "verificationToken"], password: ["phone", "password", "verificationToken"],
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

/** Auth remains available when subscription sales are off; all writes are bounded, same-origin and uncached. */
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
      const member = await services.sessions.verify(currentToken), anonymousName = memberVerificationCookieName(services.config.production);
      let anonymousToken = readCookie(request, anonymousName), setAnonymous = false;
      if (!member && action === "verification" && !validMemberToken(anonymousToken)) { anonymousToken = randomBytes(32).toString("base64url"); setAnonymous = true; }
      const binding: AuthBinding = { member, ...(anonymousToken ? { anonymousToken } : {}) }, address = clientAddress(request.headers);
      let response: Response;
      if (action === "verification") {
        if (!["register", "reset", "phone", "password", "login"].includes(body.purpose as string)) return json({ error: "invalid", message: "Choose a valid verification action." }, 400);
        const result = await services.auth.requestCode(body.purpose as VerificationPurpose, body.phone, binding, address, body.channel);
        response = result.status === "sent" ? json({ challengeId: result.challengeId, channel: result.channel, expiresAt: result.expiresAt.toISOString(), resendAt: result.resendAt.toISOString() }) : failure(result);
        if (result.status === "sent" && !member) setAnonymous = true;
      } else if (action === "confirm") {
        const result = await services.auth.confirmCode(body.challengeId, body.code, binding, address);
        response = result.status === "verified" ? json({ verificationToken: result.verificationToken, expiresAt: result.expiresAt.toISOString() }) : failure(result);
      } else {
        if (action === "login" && "password" in body && "verificationToken" in body) return json({ error: "invalid", message: "Use a password or a verification code to log in." }, 400);
        const result = action === "login" ? "verificationToken" in body
          ? await services.auth.loginWithCode(body.phone, body.verificationToken, binding, address, currentToken)
          : await services.auth.login(body.phone, body.password, address, currentToken)
          : action === "register" ? await services.auth.register(body.phone, body.password, body.verificationToken, binding)
          : action === "phone" ? await services.auth.changePhone(body.phone, body.verificationToken, binding)
          : await services.auth.changePassword(body.password, body.verificationToken, binding, body.phone);
        if (result.status !== "authenticated") response = failure(result);
        else {
          const next = memberReturnPath(body.return) ?? (body.destination === "subscribe" ? "/en/subscribe"
            : action === "phone" ? "/en/account?status=phone-changed" : action === "password" ? "/en/account?status=password-changed" : "/en/account");
          response = json({ next, phone: result.phone });
          response.headers.append("Set-Cookie", cookie(services.config, memberName, result.token, memberSessionRules.cookieSeconds, "Lax"));
          response.headers.append("Set-Cookie", cookie(services.config, anonymousName, "", 0, "Strict"));
        }
      }
      if (setAnonymous) response.headers.append("Set-Cookie", cookie(services.config, anonymousName, anonymousToken!, 600, "Strict"));
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
      return json({ phone: member?.phone ?? null });
    } catch { return json({ phone: null, error: "unavailable" }, 503); }
  };
}

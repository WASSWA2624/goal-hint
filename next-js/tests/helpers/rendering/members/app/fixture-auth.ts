import { normalizePhone } from "@/domain/phone";
import { createMemberAuthHandler, createPasswordRecoveryHandler } from "@/server/members/member-auth-http";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureMemberSessions, restoreFixtureSession } from "./fixture-admin";
import { fixtureAdminPassword, fixtureAdminPhone, fixtureTokens } from "./fixture-identity";
import { fixtureRegistrationTrial } from "./fixture-subscription";
export { fixtureTokens } from "./fixture-identity";

type FixtureAction = "register" | "login" | "verification" | "verify" | "reset-code" | "reset" | "phone" | "password";
export const fixtureScenarios = ["success", "send-failed", "rate-limited", "invalid-code", "unavailable", "denied", "missing", "blocked", "pending-verification", "password-reset", "automatic-trial", "duplicate-phone", "existing-request"] as const;

function fixtureScenario(request: Request) {
  return request.headers.get("x-member-fixture-scenario")
    ?? request.headers.get("cookie")?.match(/(?:^|;\s*)member-fixture-scenario=([^;]+)/u)?.[1]
    ?? "success";
}
const config = { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } };

export function fixturePasswordRecoveryHandler(action: "request" | "validate" | "redeem") {
  return async (request: Request) => {
    const scenario = fixtureScenario(request);
    if (scenario === "unavailable" || scenario === "send-failed") return new Response(JSON.stringify({ message: "Synthetic account access is unavailable. Try again." }),
      { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    const fakeToken = "p".repeat(43);
    const unusable = { status: "unusable", message: "This reset link has expired, was replaced, or has already been used." };
    const active = (token: unknown) => token === fakeToken && !request.headers.get("cookie")?.includes("member-fixture-reset-completed=1");
    const source = async () => ({ config, sessions: fixtureMemberSessions, passwordRecovery: {
      async request(phone: unknown) {
        if (scenario === "rate-limited") return { status: "busy", message: "Too many attempts. Please wait before trying again." };
        if (!normalizePhone(phone)) return { status: "invalid", message: "Enter your registered number." };
        return scenario === "existing-request" ? { status: "existing" } : { status: "requested" };
      },
      async validate(token: unknown) { return active(token) ? { status: "valid" } : unusable; },
      async redeem(token: unknown, password: unknown, confirm: unknown) {
        if (!active(token)) return unusable;
        if (!password || password !== confirm) return { status: "invalid", message: "The passwords do not match." };
        return { status: "completed", message: "Password changed successfully" };
      },
    } }) as unknown as MemberServices;
    const response = await createPasswordRecoveryHandler(action, source)(request);
    if (response.ok && action === "redeem") response.headers.append("Set-Cookie", "member-fixture-reset-completed=1; Path=/; SameSite=Lax");
    return response;
  };
}

/** Only the isolated rendering app imports this adapter. It never creates accounts, writes a database or sends messages. */
export function fixtureAuthHandler(action: FixtureAction) {
  return async (request: Request) => {
    const scenario = fixtureScenario(request);
    const unavailable = () => ({ status: "unavailable", message: "Synthetic account access is unavailable. Try again." });
    const invalid = () => ({ status: "invalid", message: "That code is invalid or has expired. Please try again." });
    const authenticated = (fields: Record<string, unknown> = {}) => {
      const result = { status: "authenticated", token: fixtureTokens.authenticated,
        accountId: "00000000-0000-4000-8000-000000000101", phone: "256700000101", ...fields };
      restoreFixtureSession(result.token); return result;
    };
    const verify = (code: unknown, reset = false) => scenario === "unavailable" ? unavailable()
      : scenario === "invalid-code" || code !== "123456" ? invalid()
      : authenticated(reset ? { token: fixtureTokens.reset, requiresPasswordChange: true } : {});
    const source = async () => ({ config,
      sessions: fixtureMemberSessions,
      auth: {
        async register() { return scenario === "unavailable" ? unavailable()
          : scenario === "duplicate-phone" ? { status: "conflict", message: "This phone number already has an account. Log in to continue." }
          : authenticated({ token: fixtureTokens.registered,
          ...(scenario === "automatic-trial" ? { trial: { ...fixtureRegistrationTrial, active: true } } : {}) }); },
        async login(phone: unknown, password: unknown) {
          if (scenario === "unavailable") return unavailable();
          if (scenario === "rate-limited") return { status: "busy", message: "Synthetic sign-in requests are limited. Try again later." };
          if (["denied", "missing", "blocked"].includes(scenario)) return { status: "unauthorized", message: "The phone number or password is incorrect." };
          if (scenario === "pending-verification") return authenticated({ token: fixtureTokens.pending, requiresVerification: true });
          if (scenario === "password-reset") return authenticated({ token: fixtureTokens.reset, requiresPasswordChange: true });
          if (normalizePhone(phone) === fixtureAdminPhone) return password === fixtureAdminPassword
            ? authenticated({ token: fixtureTokens.administrator, accountId: "00000000-0000-4000-8000-000000000991", phone: fixtureAdminPhone, administrator: true })
            : { status: "unauthorized", message: "The phone number or password is incorrect." };
          return authenticated({ otherDeviceSignedOut: false });
        },
        async requestVerification() { return { status: "invalid", message: "Use a code you already received or choose Forgot password to recover your account." }; },
        async verifyAccount(code: unknown, token: unknown) {
          return token === fixtureTokens.pending ? verify(code) : { status: "unauthorized", message: "Return to login to continue." };
        },
        async verifyPasswordReset(_phone: unknown, code: unknown) { return verify(code, true); },
        async resetPassword() { return scenario === "unavailable" ? unavailable() : authenticated(); },
        async changePassword(_password: unknown, binding: { member: unknown }) {
          return !binding.member ? { status: "unauthorized", message: "Log in to change your password." }
            : scenario === "unavailable" ? unavailable() : authenticated();
        },
        async changePhone(phone: unknown, current: unknown, binding: { member: unknown }) {
          if (!binding.member || current !== "Synthetic current password") return { status: "unauthorized", message: "Your current password is incorrect." };
          if (scenario === "unavailable") return unavailable();
          return authenticated({ phone: normalizePhone(phone), token: fixtureTokens.pending, requiresVerification: true });
        },
      },
    }) as unknown as MemberServices;
    const response = await createMemberAuthHandler(action, source)(request);
    if (response.ok && action === "register") {
      const state = scenario === "automatic-trial" ? "registration-trial" : "registration-no-trial";
      response.headers.append("Set-Cookie", `member-fixture-subscription=${state}; Path=/; SameSite=Lax`);
    }
    return response;
  };
}

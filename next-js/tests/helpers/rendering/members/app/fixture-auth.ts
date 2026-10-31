import { normalizePhone } from "@/domain/phone";
import { supportedMessageChannels, type MessageChannel } from "@/domain/member-verification";
import { createMemberAuthHandler } from "@/server/members/member-auth-http";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureMemberSessions, restoreFixtureSession } from "./fixture-admin";
import { fixtureAdminPassword, fixtureAdminPhone, fixtureTokens } from "./fixture-identity";
import { fixtureRegistrationTrial } from "./fixture-subscription";
export { fixtureTokens } from "./fixture-identity";

type FixtureAction = "register" | "login" | "verification" | "verify" | "forgot" | "reset-code" | "reset" | "phone" | "password";
export const fixtureScenarios = ["success", "send-failed", "rate-limited", "invalid-code", "unavailable", "denied", "missing", "blocked", "pending-verification", "password-reset", "automatic-trial"] as const;

/** Only the isolated rendering app imports this adapter. It never creates accounts, writes a database or sends messages. */
export function fixtureAuthHandler(action: FixtureAction) {
  return async (request: Request) => {
    const scenario = request.headers.get("x-member-fixture-scenario")
      ?? request.headers.get("cookie")?.match(/(?:^|;\s*)member-fixture-scenario=([^;]+)/u)?.[1]
      ?? "success";
    const unavailable = () => ({ status: "unavailable", message: "Synthetic account access is unavailable. Try again." });
    const invalid = () => ({ status: "invalid", message: "That code is invalid or has expired. Please try again." });
    const authenticated = (fields: Record<string, unknown> = {}) => {
      const result = { status: "authenticated", token: fixtureTokens.authenticated,
        accountId: "00000000-0000-4000-8000-000000000101", phone: "256700000101", ...fields };
      restoreFixtureSession(result.token); return result;
    };
    const send = (phone: unknown, channel: unknown) => {
      if (scenario === "unavailable") return unavailable();
      if (scenario === "send-failed") return { status: "unavailable", message: "We couldn't send your code. Please try again later or contact the admin." };
      if (scenario === "rate-limited") return { status: "busy", message: "You can request up to three messages within 24 hours. Please wait or contact the admin for assistance." };
      const canonical = normalizePhone(phone);
      if (!canonical || !supportedMessageChannels(canonical).includes(channel as MessageChannel)) return { status: "invalid", message: "Enter your registered number and choose an available delivery method." };
      return { status: "requested", message: "If this number has an eligible account, a code has been sent through your selected channel." };
    };
    const verify = (code: unknown, reset = false) => scenario === "unavailable" ? unavailable()
      : scenario === "invalid-code" || code !== "123456" ? invalid()
      : authenticated(reset ? { token: fixtureTokens.reset, requiresPasswordChange: true }
        : scenario === "automatic-trial" ? { trial: { ...fixtureRegistrationTrial, active: true } } : {});
    const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } },
      sessions: fixtureMemberSessions,
      auth: {
        async register() { return scenario === "unavailable" ? unavailable() : authenticated({ token: fixtureTokens.pending, requiresVerification: true,
          ...(scenario === "automatic-trial" ? { trial: { ...fixtureRegistrationTrial, active: false } } : {}) }); },
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
        async requestVerification(channel: unknown) { return send("256700000101", channel); },
        async requestPasswordReset(phone: unknown, _address: string, channel: unknown) { return send(phone, channel); },
        async verifyAccount(code: unknown) { return verify(code); },
        async verifyPasswordReset(_phone: unknown, code: unknown) { return verify(code, true); },
        async resetPassword() { return scenario === "unavailable" ? unavailable() : authenticated(); },
        async changePassword(_password: unknown, current: unknown, binding: { member: unknown }) {
          return !binding.member || current !== "Synthetic current password" ? { status: "unauthorized", message: "Your current password is incorrect." }
            : scenario === "unavailable" ? unavailable() : authenticated();
        },
        async changePhone(phone: unknown, current: unknown, binding: { member: unknown }) {
          return !binding.member || current !== "Synthetic current password" ? { status: "unauthorized", message: "Your current password is incorrect." }
            : scenario === "unavailable" ? unavailable() : authenticated({ token: fixtureTokens.pending, phone: normalizePhone(phone), requiresVerification: true });
        },
      },
    }) as unknown as MemberServices;
    const response = await createMemberAuthHandler(action, source)(request);
    if (response.ok && scenario === "automatic-trial" && (action === "register" || action === "verify"))
      response.headers.append("Set-Cookie", "member-fixture-subscription=registration-trial; Path=/; SameSite=Lax");
    return response;
  };
}

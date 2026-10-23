import { normalizePhone } from "@/domain/phone";
import { supportedMessageChannels, type MessageChannel } from "@/domain/member-verification";
import { createMemberAuthHandler } from "@/server/members/member-auth-http";
import type { MemberServices } from "@/server/members/member-http";

type FixtureAction = "register" | "login" | "verification" | "verify" | "forgot" | "reset-code" | "reset";
export const fixtureTokens = { pending: "v".repeat(43), reset: "r".repeat(43), authenticated: "a".repeat(43) };
export const fixtureScenarios = ["success", "send-failed", "rate-limited", "invalid-code", "unavailable"] as const;

/** Only the isolated rendering app imports this adapter. It never creates accounts, writes a database or sends messages. */
export function fixtureAuthHandler(action: FixtureAction) {
  return (request: Request) => {
    const scenario = request.headers.get("x-member-fixture-scenario")
      ?? request.headers.get("cookie")?.match(/(?:^|;\s*)member-fixture-scenario=([^;]+)/u)?.[1]
      ?? "success";
    const unavailable = () => ({ status: "unavailable", message: "Synthetic account access is unavailable. Try again." });
    const invalid = () => ({ status: "invalid", message: "That code is invalid or has expired. Please try again." });
    const authenticated = (fields: Record<string, unknown> = {}) => ({ status: "authenticated", token: fixtureTokens.authenticated,
      accountId: "00000000-0000-4000-8000-000000000101", phone: "256700000101", ...fields });
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
      : authenticated(reset ? { token: fixtureTokens.reset, requiresPasswordChange: true } : {});
    const source = async () => ({ config: { production: false, cookies: { secure: false } },
      sessions: { async verify() { return null; } },
      auth: {
        async register() { return scenario === "unavailable" ? unavailable() : authenticated({ token: fixtureTokens.pending, requiresVerification: true }); },
        async login() { return scenario === "unavailable" ? unavailable() : authenticated({ otherDeviceSignedOut: false }); },
        async requestVerification(channel: unknown) { return send("256700000101", channel); },
        async requestPasswordReset(phone: unknown, _address: string, channel: unknown) { return send(phone, channel); },
        async verifyAccount(code: unknown) { return verify(code); },
        async verifyPasswordReset(_phone: unknown, code: unknown) { return verify(code, true); },
        async resetPassword() { return scenario === "unavailable" ? unavailable() : authenticated(); },
      },
    }) as unknown as MemberServices;
    return createMemberAuthHandler(action, source)(request);
  };
}

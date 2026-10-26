import type { AuthBinding } from "@/server/members/member-auth";
import { createMemberAuthHandler } from "@/server/members/member-auth-http";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureMemberSessions, restoreFixtureSession } from "./fixture-admin";
import { fixtureTokens } from "./fixture-identity";

/** Scripted data boundary for transport tests; never changes a real account. */
export function fixtureAccountChange(action: "phone" | "password") {
  const authenticated = (binding: AuthBinding, phone: unknown = binding.member?.phone) => {
    if (!binding.member) return { status: "unauthorized", message: "Sign in to continue." };
    restoreFixtureSession(fixtureTokens.authenticated);
    return { status: "authenticated", token: fixtureTokens.authenticated,
      accountId: binding.member.accountId, phone };
  };
  const services = async () => ({
    config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } },
    sessions: fixtureMemberSessions,
    auth: {
      async changePhone(phone: unknown, _password: unknown, binding: AuthBinding) { return authenticated(binding, phone); },
      async changePassword(_password: unknown, _current: unknown, binding: AuthBinding) { return authenticated(binding); },
    },
  }) as unknown as MemberServices;
  return createMemberAuthHandler(action, services);
}

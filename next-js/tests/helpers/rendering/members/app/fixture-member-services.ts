import { cookies } from "next/headers";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureTokens, fixtureAdminPhone } from "./fixture-identity";
import { fixtureSubscriptionPeriods, fixtureSubscriptionStatus, subscriptionScenarios } from "./fixture-subscription";
import { fixtureDashboard } from "./fixture-dashboard";
import { fixtureNotifications } from "./fixture-notifications";

export function fixtureServices(state: string) {
  const scenario = state === "ended" ? "expired" : state === "signed-in" ? "free"
    : ["queued", "dashboard-unavailable", "subscription-unavailable", "referral-empty", "referral-unavailable", "notifications-empty", "notifications-unavailable"].includes(state) ? "active" : state;
  const unlocked = ["active", "manual", "trial", "pending-renewal", "expired", "off-active", "registration-trial", "off-trial-active"].includes(scenario), at = Date.now();
  return async () => {
    const consent = (await cookies()).get("member-fixture-whatsapp")?.value;
    return { config: { production: false },
    settings: { settings: state === "unavailable" ? null : { ...defaultSubscriptionSettings, paywallMode: scenario.startsWith("off") ? "off" : "on",
      allowUnsubscribedMembers: scenario === "member-free", trialDays: scenario === "trial-disabled" ? 0 : 30,
      ...(state === "support" ? { supportContacts: [
        { id: "synthetic-support", label: "Account support", network: "other", phone: "256700000101", calls: true, whatsapp: true, enabled: true, primary: true },
        { id: "synthetic-secondary", label: "Registration and verification support", network: "other", phone: "256700000102", calls: true, whatsapp: false, enabled: true, primary: false },
      ] } : {}) } },
    sessions: { async verify() { if (state === "session-unavailable") throw new Error("Synthetic session read failure"); return [...subscriptionScenarios.filter(value => value !== "off"), "blocked", "administrator", "history"].includes(scenario)
      ? { accountId: "00000000-0000-4000-8000-000000000101", tokenHash: "synthetic", phone: state === "administrator" ? fixtureAdminPhone : "256700000101", administrator: state === "administrator", blocked: state === "blocked", codeEnteredAt: unlocked ? new Date(at) : null, whatsappNotificationsAt: consent === "on" ? new Date(at) : null } : null; } },
    auth: { async passwordResetSession() { if (state === "reset-unavailable") throw new Error("Synthetic reset read failure"); return state === "password-reset" ? { phone: "256700000101" } : null; },
      async verificationSession() { if (state === "verification-unavailable") throw new Error("Synthetic verification read failure"); return ["unverified", "sms-only", "unsupported"].includes(state) ? { phone: state === "unsupported" ? "5511999999999" : state === "sms-only" ? "447700900123" : "256700000101" } : null; } },
    codes: { async subscriptionStatus() { if (state === "subscription-unavailable") throw new Error("Synthetic unavailable subscription"); return fixtureSubscriptionStatus(scenario); },
      async accountView() { const codes = fixtureSubscriptionPeriods(scenario);
        if (state === "queued") codes.push({ ...codes[0]!, id: "synthetic-queued", planName: "Next package", startsAt: codes[0]!.endsAt, endsAt: new Date(+codes[0]!.endsAt + 7 * 86_400_000) });
        return { codes, devices: [{ tokenHash: "synthetic", lastSeenAt: new Date(at) }] }; } },
    dashboard: { async read() { if (state === "dashboard-unavailable") throw new Error("Synthetic unavailable history"); return fixtureDashboard(scenario); } },
    notifications: fixtureNotifications(state),
    referrals: { async read() {
      if (state === "referral-unavailable") throw new Error("Synthetic unavailable referrals");
      const empty = state === "referral-empty";
      return { code: "a".repeat(32), verified: empty ? 0 : 3, earnedDays: empty ? 0 : 3, remainingMs: empty ? 0 : 2 * 86_400_000 + 5 * 3_600_000,
        history: empty ? [] : Array.from({ length: 4 }, (_, index) => ({ id: `synthetic-referral-${index}`, registeredAt: new Date(at - (index + 1) * 86_400_000).toISOString(),
          rewardedAt: index === 0 ? null : new Date(at - index * 86_400_000).toISOString(), status: index === 0 ? "pending" : "rewarded" })) };
    } },
    payments: { async view() { return { acceptedTerms: unlocked,
      status: fixtureSubscriptionStatus(scenario).paymentPending ? { reference: "PFAKE", status: "pending", planName: "Weekly", priceUgx: 5000,
        submittedAt: new Date(at).toISOString(), endsAt: null, rejectText: null, rejectReason: null } : null }; } },
  } as unknown as MemberServices;
  };
}
export const fixtureStates = ["signed-out", "support", "signed-in", "unavailable", "session-unavailable", "reset-unavailable", "verification-unavailable", "ended", "blocked", "administrator", "unverified", "sms-only", "unsupported", "password-reset", "queued", "history", "dashboard-unavailable", "subscription-unavailable", "referral-empty", "referral-unavailable", "notifications-empty", "notifications-unavailable", ...subscriptionScenarios];

export async function fixtureState(parameters: Record<string, string | string[] | undefined>) {
  const jar = await cookies(), token = jar.get("goal-hint-member")?.value;
  const subscriptionState = jar.get("member-fixture-subscription")?.value;
  const cookieState = token === fixtureTokens.reset ? "password-reset" : token === fixtureTokens.pending ? "unverified"
    : token === fixtureTokens.administrator ? "administrator" : token === fixtureTokens.authenticated ? subscriptionState ?? "signed-in" : "signed-out";
  const state = typeof parameters.state === "string" ? parameters.state : parameters.status === "code-accepted" ? "active" : cookieState;
  return fixtureStates.includes(state) ? state : "signed-out";
}

import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureMemberSessions } from "./fixture-admin";

export const subscriptionScenarios = ["free", "active", "manual", "trial", "pending", "pending-renewal", "expired", "off", "off-active", "registration-trial"] as const;
export type SubscriptionScenario = (typeof subscriptionScenarios)[number];
// Route modules can compile independently; anchor API and HTML expiry to the same UTC day.
export const fixtureSubscriptionEnd = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000 + 7 * 86_400_000 + 10 * 3_600_000).toISOString();
const registrationTrialStart = Math.floor(Date.now() / 86_400_000) * 86_400_000;
export const fixtureRegistrationTrial = Object.freeze({ days: 2,
  startsAt: new Date(registrationTrialStart).toISOString(), endsAt: new Date(registrationTrialStart + 2 * 86_400_000).toISOString() });
const activeScenarios: readonly string[] = ["active", "manual", "trial", "pending-renewal", "off-active", "registration-trial"];

export function subscriptionScenario(value: unknown): SubscriptionScenario {
  return subscriptionScenarios.find(scenario => scenario === value) ?? "free";
}

export function subscriptionScenarioFromHeaders(headers: Headers): SubscriptionScenario {
  return subscriptionScenario(headers.get("x-subscription-fixture-state")
    ?? headers.get("cookie")?.match(/(?:^|;\s*)member-fixture-subscription=([^;]+)/u)?.[1]);
}

export function fixtureSubscriptionStatus(scenario: string) {
  return { activeUntil: scenario === "registration-trial" ? fixtureRegistrationTrial.endsAt : activeScenarios.includes(scenario) ? fixtureSubscriptionEnd : null,
    paymentPending: ["pending", "pending-renewal"].includes(scenario), creditUgx: 0, autoRenew: false, renewsFromCredit: false,
    ...(scenario === "expired" ? { expired: true } : {}) };
}

export function fixtureSubscriptionPeriods(scenario: string) {
  if (!activeScenarios.includes(scenario) && scenario !== "expired") return [];
  const registrationTrial = scenario === "registration-trial", days = registrationTrial ? fixtureRegistrationTrial.days : 7;
  const endsAt = new Date(registrationTrial ? fixtureRegistrationTrial.endsAt : scenario === "expired" ? Date.now() - 86_400_000 : fixtureSubscriptionEnd);
  return [{ id: "synthetic-subscription", planName: registrationTrial || scenario === "trial" ? "Free trial" : "Weekly", durationDays: days,
    extensionDays: 0, revokedAt: null, startsAt: new Date(+endsAt - days * 86_400_000), endsAt }];
}

/** Real HTTP/session adapters, scripted subscription records; no application database or messaging. */
export function fixtureSubscriptionServices(scenario: SubscriptionScenario): MemberServices {
  return { config: { production: false }, sessions: fixtureMemberSessions,
    settings: { settings: { ...defaultSubscriptionSettings, paywallMode: scenario.startsWith("off") ? "off" : "test" }, source: "stored" },
    codes: { async subscriptionStatus() { return fixtureSubscriptionStatus(scenario); } },
  } as unknown as MemberServices;
}

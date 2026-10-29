import type { SubscriptionSummary } from "@/domain/subscription-summary";

export const bannerScenarios = ["signed-out", "member", "active", "pending", "expired", "active-pending", "sales-closed", "pending-closed", "active-closed", "no-price", "price-changed", "failure"] as const;
export type BannerScenario = (typeof bannerScenarios)[number];

export function bannerScenario(value: unknown): BannerScenario {
  return bannerScenarios.find((scenario) => scenario === value) ?? "signed-out";
}

/** Synthetic prices deliberately differ from the gallery offer to detect production fallbacks. */
export function bannerSession(scenario: BannerScenario) {
  const active = ["active", "active-pending", "active-closed"].includes(scenario);
  const subscription: SubscriptionSummary = {
    activeUntil: active ? new Date(Date.now() + 3 * 86_400_000).toISOString() : null,
    paymentPending: ["pending", "active-pending", "pending-closed"].includes(scenario),
    canSubscribe: !scenario.endsWith("closed"), creditUgx: 0, autoRenew: false, renewsFromCredit: false,
    ...(scenario !== "no-price" && !active ? { offer: { priceUgx: scenario === "price-changed" ? 2_750 : 1_750, durationDays: 1 } } : {}),
    ...(scenario === "expired" ? { expired: true } : {}),
  };
  return { phone: scenario === "signed-out" || scenario === "sales-closed" ? null : "256700000001", administrator: false, subscription };
}

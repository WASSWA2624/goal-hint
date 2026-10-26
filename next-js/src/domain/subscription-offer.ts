import type { SubscriptionPlanView } from "./subscription-plans.ts";

export type SubscriptionOffer = Readonly<Pick<SubscriptionPlanView, "priceUgx" | "durationDays">>;

/** Lowest purchase price; ties keep the owner's plan order. Never invent a public price. */
export function cheapestActivePlan(plans: readonly SubscriptionPlanView[]): SubscriptionOffer | null {
  const plan = plans.reduce<SubscriptionPlanView | null>((best, plan) => plan.active && (!best || plan.priceUgx < best.priceUgx) ? plan : best, null);
  return plan ? { priceUgx: plan.priceUgx, durationDays: plan.durationDays } : null;
}

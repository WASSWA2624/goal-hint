import type { SubscriptionSummary } from "./subscription-summary.ts";

export type DesktopSubscriptionBannerState = "signed-out" | "unsubscribed" | "active" | "pending" | "expired";

/** No private status or acquisition action is shown until the session has been confirmed. */
export function desktopSubscriptionBannerState(signedIn: boolean, subscription: SubscriptionSummary | null, now: number): DesktopSubscriptionBannerState | null {
  if (!subscription) return null;
  if (!signedIn) return subscription.canSubscribe ? "signed-out" : null;
  const expiry = subscription.activeUntil ? Date.parse(subscription.activeUntil) : NaN;
  if (expiry > now) return "active";
  if (subscription.paymentPending) return "pending";
  if (!subscription.canSubscribe) return null;
  return subscription.expired || Number.isFinite(expiry) && expiry <= now ? "expired" : "unsubscribed";
}

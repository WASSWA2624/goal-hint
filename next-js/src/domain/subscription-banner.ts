import type { SubscriptionSummary } from "./subscription-summary.ts";
import { memberNextPath, memberReturnPath } from "./member-navigation.ts";
import { resolveLocale } from "../i18n/locales.ts";

export type SubscriptionBannerState = "signed-out" | "unsubscribed" | "active" | "pending" | "expired";

/** No private status or acquisition action is shown until the session has been confirmed. */
export function subscriptionBannerState(signedIn: boolean, subscription: SubscriptionSummary | null, now: number): SubscriptionBannerState | null {
  if (!subscription) return null;
  if (!signedIn) return subscription.canSubscribe ? "signed-out" : null;
  const expiry = subscription.activeUntil ? Date.parse(subscription.activeUntil) : NaN;
  if (expiry > now) return "active";
  if (subscription.paymentPending) return "pending";
  if (!subscription.canSubscribe) return null;
  return subscription.expired || Number.isFinite(expiry) && expiry <= now ? "expired" : "unsubscribed";
}

/** Both responsive banners preserve the same validated return destination and existing account views. */
export function subscriptionBannerLinks(locale: string, pathname: string) {
  const base = `/${resolveLocale(locale)}`, account = `${base}/account`, subscribe = `${base}/subscribe`;
  const returnTo = memberReturnPath(pathname);
  const auth = (view: "login" | "register") => `${account}?${new URLSearchParams({ view, ...(returnTo ? { return: returnTo } : {}) })}`;
  return { account, subscribe, signIn: auth("login"), signUp: auth("register"),
    payment: `${memberNextPath("subscribe", returnTo)}#report`, plans: `${memberNextPath("subscribe", returnTo)}#plans` } as const;
}

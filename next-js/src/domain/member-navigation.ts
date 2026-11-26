import { reviewReturnPath } from "./payment-alerts.ts";
import { adminLandingPath } from "./admin-navigation.ts";

/** One phone-and-password sign-in page for every account role. */
export const memberLoginPath = "/en/account?view=login";
/** Authentication completes on the same matches page as the app's home entry. */
export const memberHomePath = "/en/matches";
/** Ordinary logout keeps members and administrators browsing Matches with visitor access. */
export const signedOutPath = memberHomePath;
export const logoutUnconfirmedStatus = "logout-unconfirmed";

export type MemberAuthView = "login" | "register" | "forgot" | "verify" | "new-password";

/** Use one canonical authentication URL and carry only a validated local journey. */
export function memberAuthPath(view: MemberAuthView = "login", returnTo?: unknown, checkout = false): string {
  const query = new URLSearchParams({ view });
  addReturn(query, returnTo, checkout);
  return `/en/account?${query}`;
}

/** Ordinary authentication finishes at home. Explicit checkout, sharing and review journeys keep their destination. */
export function memberLandingPath(administrator = false, returnTo?: unknown, checkout = false): string {
  if (checkout) {
    const target = subscriptionReturnPath(returnTo);
    return target ? administrator ? target : memberNextPath("subscribe", target, undefined, true) : administrator ? adminLandingPath : memberHomePath;
  }
  return administrator ? reviewReturnPath(returnTo) ?? adminLandingPath : sharedSlipReturnPath(returnTo) ?? memberHomePath;
}

/** Only known feeds, canonical matches/shared slips, or a validated payment review can be carried through authentication. */
export function memberReturnPath(value: unknown): string | null {
  const review = reviewReturnPath(value);
  return review ?? subscriptionReturnPath(value);
}

/** A subscription journey can return only to public or subscriber features. */
export function subscriptionReturnPath(value: unknown): string | null {
  return typeof value === "string" && value.length <= 512 && !/\s/u.test(value) &&
    (["/en", memberHomePath, "/en/best-slips", "/en/slips"].includes(value) || /^\/en\/best-slips\/\d{4}-\d{2}-\d{2}\/[1-9]\d{0,2}$/u.test(value) || sharedSlipReturnPath(value) || matchReturnPath(value)) ? value : null;
}

export function matchReturnPath(value: unknown): string | null {
  return typeof value === "string" && value.length <= 512 && /^\/en\/matches\/[A-Za-z0-9_-]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) ? value : null;
}

/** Shared tokens are opaque, canonical paths only; no queries, escapes or external origins. */
export function sharedSlipReturnPath(value: unknown): string | null {
  return typeof value === "string" && /^\/s\/[a-f0-9]{32}$/u.test(value) ? value : null;
}

/** Purge drafts left behind by older payment forms. */
export const paymentDraftStoragePrefix = "goal-hint-payment-draft:";

export function memberNextPath(destination: unknown, returnTo: unknown, status?: string, checkout = false): string {
  const query = new URLSearchParams();
  addReturn(query, returnTo, destination === "subscribe" && checkout);
  if (status) query.set("status", status);
  return `/en/${destination === "subscribe" ? "subscribe" : "account"}${query.size ? `?${query}` : ""}`;
}

export function memberAuthReturnFields(returnTo: string | null, checkout: boolean) {
  return { ...(returnTo ? { return: returnTo } : {}), ...(checkout ? { checkout: "1" } : {}) };
}

export function memberSignOutToLoginPath(checkoutReturn?: unknown): `/api/account/sign-out?${string}` {
  const query = new URLSearchParams({ destination: "login" });
  addReturn(query, checkoutReturn, true);
  return `/api/account/sign-out?${query}`;
}

function addReturn(query: URLSearchParams, returnTo: unknown, checkout: boolean) {
  const safeReturn = checkout ? subscriptionReturnPath(returnTo) : memberReturnPath(returnTo);
  if (!safeReturn) return;
  query.set("return", safeReturn);
  if (checkout) query.set("checkout", "1");
}

import type { SubscriptionOffer } from "@/domain/subscription-offer";
import type { SubscriptionSummary } from "@/domain/subscription-summary";
import { startRequestDeadline } from "../../domain/request-deadline.ts";

/** Client-only account state. Public page HTML and browser storage never contain it. */
let phone: string | null = null;
let administrator = false;
let subscription: SubscriptionSummary | null = null;
let pending: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export const getMemberSessionSnapshot = (): string | null => phone;
export const getServerMemberSessionSnapshot = (): null => null;
export const getAdminSessionSnapshot = (): boolean => administrator;
export const getServerAdminSessionSnapshot = (): false => false;
export const getSubscriptionSnapshot = (): SubscriptionSummary | null => subscription;
export const getServerSubscriptionSnapshot = (): null => null;
/** Slip publication and re-sharing require the member's current, unexpired access period. */
export const getSlipSharingSnapshot = (): boolean => phone !== null
  && !!subscription?.activeUntil && Date.parse(subscription.activeUntil) > Date.now();

function readSubscription(value: unknown): SubscriptionSummary | null {
  if (!value || typeof value !== "object" || !("activeUntil" in value) || !("paymentPending" in value) || !("canSubscribe" in value)
    || typeof value.paymentPending !== "boolean" || typeof value.canSubscribe !== "boolean"
    || value.activeUntil !== null && (typeof value.activeUntil !== "string" || !Number.isFinite(Date.parse(value.activeUntil)))) return null;
  // Credit fields default when absent, so an older server during a deploy never blanks the whole summary.
  const creditUgx = "creditUgx" in value && Number.isSafeInteger(value.creditUgx) ? value.creditUgx as number : 0;
  const autoRenew = "autoRenew" in value && value.autoRenew === true, renewsFromCredit = autoRenew && "renewsFromCredit" in value && value.renewsFromCredit === true;
  const offer = "offer" in value ? readOffer(value.offer) : null;
  const now = Date.now(), activeUntil = value.activeUntil && Date.parse(value.activeUntil) > now ? value.activeUntil : null;
  const expired = !activeUntil && (("expired" in value && value.expired === true)
    || (value.activeUntil !== null && Date.parse(value.activeUntil) <= now));
  return { activeUntil, paymentPending: value.paymentPending, canSubscribe: value.canSubscribe, creditUgx, autoRenew, renewsFromCredit,
    ...(offer ? { offer } : {}), ...(expired ? { expired: true } : {}) };
}

function readOffer(value: unknown): SubscriptionOffer | null {
  if (!value || typeof value !== "object" || !("priceUgx" in value) || !("durationDays" in value)) return null;
  const { priceUgx, durationDays } = value;
  return Number.isSafeInteger(priceUgx) && Number.isSafeInteger(durationDays) && (priceUgx as number) > 0 && (durationDays as number) > 0
    ? { priceUgx: priceUgx as number, durationDays: durationDays as number } : null;
}

function publish() { for (const listener of listeners) listener(); }

/** One timer serves all headers: pending approvals are rechecked, and expiry never waits for navigation. */
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = undefined;
  if (!listeners.size || !subscription) return;
  const expiresIn = subscription.activeUntil ? Math.max(0, Date.parse(subscription.activeUntil) - Date.now()) : Infinity;
  const delay = Math.min(expiresIn, subscription.paymentPending ? 20_000 : Infinity);
  if (!Number.isFinite(delay)) return;
  refreshTimer = setTimeout(() => {
    if (subscription?.activeUntil && Date.parse(subscription.activeUntil) <= Date.now()) {
      subscription = { ...subscription, activeUntil: null, expired: true };
      publish();
    }
    if (typeof document === "undefined" || document.visibilityState === "visible") void refreshMemberSession();
    else scheduleRefresh();
  }, Math.min(delay, 2_147_483_647));
}

/** Desktop and phone headers share one in-flight request, including React's development remounts. */
export function refreshMemberSession(): Promise<void> {
  if (pending) return pending;
  pending = Promise.resolve().then(async () => {
    const controller = new AbortController(), clearDeadline = startRequestDeadline(controller);
    try {
      const response = await fetch("/api/account/session", {
        cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal,
      });
      if (!response.ok) return;
      const session: unknown = await response.json();
      if (!session || typeof session !== "object" || !("phone" in session) ||
        session.phone !== null && typeof session.phone !== "string") return;
      const nextAdministrator = "administrator" in session && session.administrator === true;
      const nextSubscription = readSubscription("subscription" in session ? session.subscription : null);
      if (phone === session.phone && administrator === nextAdministrator
        && subscription?.activeUntil === nextSubscription?.activeUntil
        && subscription?.paymentPending === nextSubscription?.paymentPending
        && subscription?.expired === nextSubscription?.expired
        && subscription?.canSubscribe === nextSubscription?.canSubscribe
        && subscription?.creditUgx === nextSubscription?.creditUgx && subscription?.autoRenew === nextSubscription?.autoRenew
        && subscription?.renewsFromCredit === nextSubscription?.renewsFromCredit
        && subscription?.offer?.priceUgx === nextSubscription?.offer?.priceUgx
        && subscription?.offer?.durationDays === nextSubscription?.offer?.durationDays) return;
      phone = session.phone;
      administrator = nextAdministrator;
      subscription = nextSubscription;
      publish();
    } catch { /* A temporary network failure preserves the last confirmed identity. */ }
    finally { clearDeadline(); pending = null; scheduleRefresh(); }
  });
  return pending;
}

const recheckSession = () => { void refreshMemberSession(); };
const onRestore = (event: PageTransitionEvent) => { if (event.persisted) recheckSession(); };
const onVisible = () => { if (document.visibilityState === "visible") recheckSession(); };

export function subscribeMemberSession(listener: () => void): () => void {
  const browser = window;
  listeners.add(listener);
  if (listeners.size === 1) {
    browser.addEventListener("focus", recheckSession);
    browser.addEventListener("pageshow", onRestore);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    recheckSession();
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size) return;
    browser.removeEventListener("focus", recheckSession);
    browser.removeEventListener("pageshow", onRestore);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  };
}

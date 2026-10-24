import type { SubscriptionSummary } from "@/domain/subscription-summary";

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

function readSubscription(value: unknown): SubscriptionSummary | null {
  if (!value || typeof value !== "object" || !("activeUntil" in value) || !("paymentPending" in value) || !("canSubscribe" in value)
    || typeof value.paymentPending !== "boolean" || typeof value.canSubscribe !== "boolean"
    || value.activeUntil !== null && (typeof value.activeUntil !== "string" || !Number.isFinite(Date.parse(value.activeUntil)))) return null;
  return { activeUntil: value.activeUntil && Date.parse(value.activeUntil) > Date.now() ? value.activeUntil : null,
    paymentPending: value.paymentPending, canSubscribe: value.canSubscribe };
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
      subscription = { ...subscription, activeUntil: null };
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
    try {
      const response = await fetch("/api/account/session", {
        cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" },
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
        && subscription?.canSubscribe === nextSubscription?.canSubscribe) return;
      phone = session.phone;
      administrator = nextAdministrator;
      subscription = nextSubscription;
      publish();
    } catch { /* A temporary network failure preserves the last confirmed identity. */ }
    finally { pending = null; scheduleRefresh(); }
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

import { accountNotificationRules } from "../../domain/account-notifications.ts";
import { startRequestDeadline } from "../../domain/request-deadline.ts";
import { getAdminSessionSnapshot, getMemberSessionSnapshot, subscribeMemberSession } from "./member-session";

let unread: number | null = null, identity: string | null = null, generation = 0;
let pending: Promise<void> | null = null, controller: AbortController | null = null, timer: ReturnType<typeof setTimeout> | undefined;
let unsubscribeSession: (() => void) | undefined;
const listeners = new Set<() => void>();
export const getNotificationUnread = () => unread;
export const getServerNotificationUnread = () => null;
function publish(value: number | null) { if (unread !== value) { unread = value; for (const listener of listeners) listener(); } }

/** One private request/timer serves every header/sidebar. No private notification state enters browser storage. */
export function refreshNotificationUnread(): Promise<void> {
  if (!identity || getAdminSessionSnapshot() || document.visibilityState === "hidden") return Promise.resolve();
  if (pending) return pending;
  const epoch = generation, request = new AbortController(); controller = request;
  const clearDeadline = startRequestDeadline(request);
  pending = (async () => {
    try {
      const response = await fetch("/api/account/notifications?summary=1", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: request.signal });
      if (epoch !== generation) return;
      if (response.status === 403) { publish(null); return; }
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (epoch === generation && body && typeof body === "object" && "unread" in body && Number.isSafeInteger(body.unread) && (body.unread as number) >= 0) publish(body.unread as number);
    } catch { /* Keep the last confirmed count during a temporary outage. */ }
    finally {
      clearDeadline();
      if (epoch === generation) {
        pending = null; controller = null; clearTimeout(timer);
        if (listeners.size && identity && document.visibilityState !== "hidden") timer = setTimeout(() => { void refreshNotificationUnread(); }, accountNotificationRules.pollMs);
      }
    }
  })();
  return pending;
}

function sessionChanged() {
  const next = getAdminSessionSnapshot() ? null : getMemberSessionSnapshot();
  if (identity !== next) {
    identity = next; generation++; controller?.abort(); controller = null; pending = null; clearTimeout(timer); publish(null);
  }
  if (identity) void refreshNotificationUnread();
}
const onVisible = () => { if (document.visibilityState === "visible") void refreshNotificationUnread(); else clearTimeout(timer); };
const onFocus = () => { void refreshNotificationUnread(); };

export function subscribeNotificationUnread(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    unsubscribeSession = subscribeMemberSession(sessionChanged);
    window.addEventListener("focus", onFocus); window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisible); sessionChanged();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    unsubscribeSession?.(); unsubscribeSession = undefined;
    window.removeEventListener("focus", onFocus); window.removeEventListener("pageshow", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
    generation++; controller?.abort(); controller = null; pending = null; clearTimeout(timer); identity = null; unread = null;
  };
}

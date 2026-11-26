import { adminPasswordRequestsApi } from "../../domain/admin-password-requests.ts";
import { startRequestDeadline } from "../../domain/request-deadline.ts";

let count: number | null = null;
let active: AbortController | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

export const getPendingPasswordRequestsSnapshot = () => count;
export const getServerPendingPasswordRequestsSnapshot = () => null;

function publish(next: number | null) {
  if (next === count) return;
  count = next;
  for (const listener of listeners) listener();
}

/** Both admin menus share one quiet request and retain the last confirmed count on a connection failure. */
export async function refreshPendingPasswordRequests(force = false) {
  if (!listeners.size || active && !force) return;
  active?.abort();
  const controller = new AbortController();
  const clearDeadline = startRequestDeadline(controller);
  active = controller;
  try {
    const response = await fetch(`${adminPasswordRequestsApi}?count=1`, { cache: "no-store", signal: controller.signal });
    if (active !== controller) return;
    if (response.status === 401 || response.status === 403) { publish(null); return; }
    if (!response.ok) return;
    const { pendingCount } = await response.json();
    if (active === controller && Number.isSafeInteger(pendingCount) && pendingCount >= 0) publish(pendingCount);
  } catch { /* A later poll can recover without interrupting the active admin screen. */ }
  finally {
    clearDeadline();
    if (active === controller) active = null;
  }
}

const recheck = () => { if (document.visibilityState === "visible") void refreshPendingPasswordRequests(); };

export function subscribePendingPasswordRequests(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    timer = setInterval(recheck, 15_000);
    recheck();
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size) return;
    window.removeEventListener("focus", recheck);
    document.removeEventListener("visibilitychange", recheck);
    clearInterval(timer);
    active?.abort();
    active = null;
    count = null;
  };
}

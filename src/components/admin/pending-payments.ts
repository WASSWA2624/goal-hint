/** Private count shared by admin headers and the queue. No browser storage or public HTML. */
let count: number | null = null;
let pending: Promise<void> | null = null;
let controller: AbortController | null = null;
let generation = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

export const getPendingPaymentsSnapshot = (): number | null => count;
export const getServerPendingPaymentsSnapshot = (): null => null;
const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function publish(value: number | null) {
  if (count === value) return;
  count = value;
  for (const listener of listeners) listener();
}

/** A server-rendered admin queue can initialize the count, but never replace a newer poll. */
export function seedPendingPayments(value: number) {
  if (count === null && listeners.size && validCount(value)) publish(value);
}

/** A completed decision invalidates any count request that began before the payment changed. */
export function refreshPendingPayments(force = false): Promise<void> {
  if (!listeners.size) return Promise.resolve();
  if (force) {
    generation += 1;
    controller?.abort();
    pending = null;
  }
  if (pending) return pending;
  const version = generation;
  const requestController = new AbortController();
  controller = requestController;
  const request = Promise.resolve().then(async () => {
    try {
      const response = await fetch("/api/admin/payments?count=1", {
        cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: requestController.signal,
      });
      if (version !== generation || !listeners.size) return;
      if (response.status === 401 || response.status === 403) { publish(null); return; }
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (version === generation && listeners.size && body && typeof body === "object" && "pendingCount" in body && validCount(body.pendingCount)) publish(body.pendingCount);
    } catch { /* Keep the last confirmed count through a temporary network failure. */ }
    finally {
      if (pending === request) { pending = null; controller = null; }
    }
  });
  pending = request;
  return request;
}

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
const recheck = () => { if (visible()) void refreshPendingPayments(); };
const onRestore = (event: PageTransitionEvent) => { if (event.persisted) recheck(); };

/** Mount only for verified admins; one poll serves desktop, mobile and the admin workspace. */
export function subscribePendingPayments(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", onRestore);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", recheck);
    timer = setInterval(recheck, 30_000);
    recheck();
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size) return;
    window.removeEventListener("focus", recheck);
    window.removeEventListener("pageshow", onRestore);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", recheck);
    clearInterval(timer); timer = undefined;
    generation += 1;
    controller?.abort(); controller = null; pending = null; count = null;
  };
}

import type { CheckoutView } from "../../domain/checkout.ts";
import { startRequestDeadline } from "../../domain/request-deadline.ts";

/** Revalidate completed writes with a fresh, bounded GET while background reads are paused. */
export async function revalidateCheckout(options: { pause(): () => void; accept(view: CheckoutView): void }): Promise<CheckoutView> {
  const resume = options.pause(), request = new AbortController();
  const clearDeadline = startRequestDeadline(request);
  try {
    const response = await fetch("/api/account/checkout", { cache: "no-store", credentials: "same-origin", signal: request.signal });
    request.signal.throwIfAborted();
    if (!response.ok) throw new Error("Status could not refresh. Your request is kept.");
    const next: CheckoutView = await response.json();
    request.signal.throwIfAborted();
    options.accept(next);
    return next;
  } finally { clearDeadline(); resume(); }
}

/** Keep lifecycle events on one background read, separate from explicit post-mutation reads. */
export function createCheckoutRefresh(options: { accept(view: CheckoutView): void; unauthorized(): void }) {
  let pending: Promise<void> | null = null, controller: AbortController | null = null;
  let stopped = false, paused = 0;
  const cancel = () => { controller?.abort(); controller = null; pending = null; };
  const refresh = (): Promise<void> => {
    if (stopped || paused) return Promise.resolve();
    if (pending) return pending;
    const request = new AbortController(); controller = request;
    // Use the same bounded account-read policy as the shared session header.
    const clearDeadline = startRequestDeadline(request);
    pending = Promise.resolve().then(async () => {
      try {
        request.signal.throwIfAborted();
        const response = await fetch("/api/account/checkout", { cache: "no-store", credentials: "same-origin", signal: request.signal });
        request.signal.throwIfAborted();
        if (response.status === 401 || response.status === 403) { options.unauthorized(); return; }
        if (!response.ok) return;
        const view: CheckoutView = await response.json();
        request.signal.throwIfAborted();
        options.accept(view);
      } catch { /* Keep the current checkout and its draft until a later scheduled read succeeds. */ }
      finally {
        clearDeadline();
        if (controller === request) { controller = null; pending = null; }
      }
    });
    return pending;
  };
  return {
    refresh,
    /** A completed mutation must fetch anew; an older poll must never replace its result. */
    pause() {
      paused++; cancel();
      let released = false;
      return () => { if (!released) { released = true; paused--; } };
    },
    stop() { stopped = true; cancel(); },
  };
}

import type { LiveReport } from "../../../domain/analytics.ts";

/** The three live displays share one private poll without rerendering the report charts and tables. */
let report: LiveReport | null = null;
let pending: Promise<void> | null = null;
let controller: AbortController | null = null;
let generation = 0;
let expired = false;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

export const getLiveReportSnapshot = (): LiveReport | null => report;
export const getLiveVisitorsSnapshot = (): number | null => report?.visitors ?? null;
export const getServerLiveSnapshot = (): null => null;

function publish(value: LiveReport | null) {
  report = value;
  for (const listener of listeners) listener();
}

export function refreshLiveReport(): Promise<void> {
  if (!listeners.size || expired || document.visibilityState !== "visible") return Promise.resolve();
  if (pending) return pending;
  const version = generation;
  const requestController = new AbortController();
  controller = requestController;
  const current = () => version === generation && !requestController.signal.aborted && listeners.size > 0;
  const request = Promise.resolve().then(async () => {
    try {
      if (!current()) return;
      const response = await fetch("/api/analytics/live", {
        cache: "no-store", credentials: "same-origin", signal: requestController.signal,
      });
      if (!current()) return;
      if (response.status === 401) {
        expired = true;
        publish(null);
        window.location.reload();
        return;
      }
      if (!response.ok) return;
      const body = await response.json() as LiveReport;
      if (current()) publish(body);
    } catch { /* Keep the last confirmed live values through a temporary network failure. */ }
    finally {
      if (pending === request) { pending = null; controller = null; }
    }
  });
  pending = request;
  return request;
}

const recheck = () => { void refreshLiveReport(); };

/** Private data and pending requests are discarded as soon as the analytics screen unmounts. */
export function subscribeLiveReport(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", recheck);
    timer = setInterval(recheck, 15_000);
    recheck();
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size) return;
    document.removeEventListener("visibilitychange", recheck);
    clearInterval(timer); timer = undefined;
    generation += 1;
    controller?.abort(); controller = null; pending = null; report = null; expired = false;
  };
}

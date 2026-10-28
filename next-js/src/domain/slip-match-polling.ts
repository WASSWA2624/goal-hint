import { slipMatchRefreshResponseSchema, slipMatchRefreshRules, slipMatchSelectionKey, type SlipMatchRefreshResponse } from "./slip-match-refresh.ts";
import type { RefreshEnvironment } from "./live-refresh.ts";

export const slipMatchPollingRules = Object.freeze({ maximumRetryMs: 120_000, maximumResponseBytes: 524_288 });

/** HTTP failures have distinct access-withdrawal and bounded-retry behavior. */
export class SlipMatchPollingError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  constructor(status: number, retryAfterMs: number | null = null) {
    super("Slip observations could not be refreshed.");
    this.name = "SlipMatchPollingError"; this.status = status; this.retryAfterMs = retryAfterMs;
  }
}

function retryAfter(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const duration = /^\d+$/u.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(duration) ? Math.max(0, duration) : null;
}

/** A refresh carries observation-only fields and cannot introduce another original selection. */
export async function readSlipMatchObservations(body: string, allowed: ReadonlySet<string>, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<SlipMatchRefreshResponse> {
  const response = await fetcher("/api/slips/match-states", { method: "POST", body, signal, cache: "no-store", credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" } });
  if (!response.ok) throw new SlipMatchPollingError(response.status, retryAfter(response));
  const text = await response.text(), maximum = slipMatchPollingRules.maximumResponseBytes;
  if (text.length > maximum || text.length * 3 > maximum && new TextEncoder().encode(text).length > maximum) throw new SlipMatchPollingError(0);
  const data = slipMatchRefreshResponseSchema.parse(JSON.parse(text));
  return { asOf: data.asOf, states: data.states.filter((state) => allowed.has(slipMatchSelectionKey(state))) };
}

export type SlipMatchPollingEnvironment = Omit<RefreshEnvironment, "now">;

/** One serial, cancellable batch for an immutable cohort; resuming never rebuilds its slips. */
export function startSlipMatchPolling(options: Readonly<{
  enabled: boolean;
  read(signal: AbortSignal): Promise<SlipMatchRefreshResponse>;
  accept(data: SlipMatchRefreshResponse): void;
  revoke(): void;
}>, environment: SlipMatchPollingEnvironment): () => void {
  if (!options.enabled) return () => {};
  let stopped = false, withdrawn = false, failures = 0, acceptedAt = -Infinity;
  let timer: unknown, deadline: unknown, active: AbortController | null = null;
  const clearWait = () => { if (timer !== undefined) environment.cancel(timer); timer = undefined; };
  const clearDeadline = () => { if (deadline !== undefined) environment.cancel(deadline); deadline = undefined; };
  const abort = () => {
    const previous = active; active = null; clearDeadline(); previous?.abort();
  };
  const retryDelay = (cause?: unknown) => {
    const normal = slipMatchRefreshRules.intervalMs * 2 ** Math.min(Math.max(failures - 1, 0), 3);
    const requested = cause instanceof SlipMatchPollingError ? cause.retryAfterMs ?? 0 : 0;
    return Math.min(slipMatchPollingRules.maximumRetryMs, Math.max(normal, requested));
  };
  const arm = (delay: number) => {
    clearWait();
    if (stopped || withdrawn || !environment.available()) return;
    timer = environment.schedule(() => { timer = undefined; void tick(); }, delay);
  };
  const tick = async () => {
    clearWait();
    if (stopped || withdrawn || active || !environment.available()) return;
    const request = new AbortController(); active = request;
    deadline = environment.schedule(() => {
      if (active !== request) return;
      abort(); failures++; arm(retryDelay());
    }, slipMatchRefreshRules.requestDeadlineMs);
    let delay: number = slipMatchRefreshRules.intervalMs;
    try {
      const data = await options.read(request.signal);
      if (stopped || active !== request || request.signal.aborted || !environment.available()) return;
      if (data.asOf < acceptedAt) throw new SlipMatchPollingError(0);
      acceptedAt = data.asOf; failures = 0; options.accept(data);
    } catch (cause) {
      if (stopped || active !== request || request.signal.aborted || !environment.available()) return;
      if (cause instanceof SlipMatchPollingError && (cause.status === 401 || cause.status === 403)) {
        withdrawn = true; clearWait(); options.revoke();
      } else { failures++; delay = retryDelay(cause); }
    } finally {
      // A timed-out or paused request may resolve after its replacement; it owns no timers or state.
      if (active === request) { active = null; clearDeadline(); arm(delay); }
    }
  };
  const unlisten = environment.listen(() => {
    if (stopped || withdrawn) return;
    if (environment.available()) void tick(); else { clearWait(); abort(); }
  });
  void tick();
  return () => { stopped = true; clearWait(); abort(); unlisten(); };
}

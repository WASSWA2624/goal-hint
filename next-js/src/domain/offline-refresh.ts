export const offlineRefreshRules = Object.freeze({ minimumGapMs: 2_000, hintFreshMs: 60_000, quietMs: 300_000,
  retryMs: [5_000, 15_000, 30_000, 60_000] as readonly number[] });
export const offlineFailureCodes = ["network-unreachable", "network-timeout", "preparation-timeout", "server-unavailable",
  "rate-limited", "authentication-required", "unexpected-response", "response-policy", "invalid-bundle", "invalid-snapshot",
  "integrity-failure", "older-version", "size-limit", "storage-unavailable", "storage-or-network-unavailable",
  "cache-unavailable", "corrupt-cache", "expired", "canceled", "preparation-busy", "coordination-unavailable",
  "worker-unavailable"] as const;
export type OfflineFailure = typeof offlineFailureCodes[number];
export const offlineVersionPattern = /^[a-f0-9]{64}$/u;
const failures = new Set<string>(offlineFailureCodes);
export type OfflineReply = Readonly<{ ok: boolean; version?: string; refreshed?: boolean; retained?: boolean; activated?: boolean;
  error?: OfflineFailure; updateError?: OfflineFailure; retryAfterSeconds?: number }>;
export type OfflineCache = Readonly<{ version: string }>;
export type OfflineConnection = "unknown" | "checking" | "reachable" | "offline" | "unreachable" | "unusable" | "authentication-required";
export type OfflineRefreshState = Readonly<{ phase: "idle" | "checking" | "waiting" | "paused"; connection: OfflineConnection;
  cache: OfflineCache | null; problem: OfflineFailure | null; retryAt: number | null; failures: number; attempts: number }>;

export class OfflineRefreshError extends Error {
  readonly code: OfflineFailure;
  constructor(code: OfflineFailure) { super(code); this.code = code; }
}

/** Only these public, finite fields cross from the worker into UI state. */
export function readOfflineReply(value: unknown): OfflineReply {
  if (!value || typeof value !== "object" || !("ok" in value) || typeof value.ok !== "boolean") throw new OfflineRefreshError("unexpected-response");
  const raw = value as Record<string, unknown>;
  if (raw.ok && (raw.kind !== "connection-page" || typeof raw.version !== "string" || !offlineVersionPattern.test(raw.version))) {
    throw new OfflineRefreshError("unexpected-response");
  }
  const result: { -readonly [Key in keyof OfflineReply]: OfflineReply[Key] } = { ok: raw.ok as boolean };
  if (typeof raw.version === "string" && offlineVersionPattern.test(raw.version)) result.version = raw.version;
  for (const key of ["refreshed", "retained", "activated"] as const) if (raw[key] !== undefined) {
    if (typeof raw[key] !== "boolean") throw new OfflineRefreshError("unexpected-response");
    result[key] = raw[key];
  }
  for (const key of ["error", "updateError"] as const) if (raw[key] !== undefined) {
    if (typeof raw[key] !== "string") throw new OfflineRefreshError("unexpected-response");
    result[key] = failures.has(raw[key]) ? raw[key] as OfflineFailure : "unexpected-response";
  }
  if (Number.isInteger(raw.retryAfterSeconds) && (raw.retryAfterSeconds as number) >= 1 && (raw.retryAfterSeconds as number) <= 300) {
    result.retryAfterSeconds = raw.retryAfterSeconds as number;
  }
  return result;
}

export const initialOfflineRefreshState: OfflineRefreshState = Object.freeze({ phase: "idle", connection: "unknown",
  cache: null, problem: null, retryAt: null, failures: 0, attempts: 0 });

const cacheFrom = (reply: OfflineReply): OfflineCache | null => reply.ok && reply.version ? { version: reply.version } : null;
function connectionFor(problem: OfflineFailure, onlineHint: boolean, previous: OfflineConnection): OfflineConnection {
  if (problem === "authentication-required") return "authentication-required";
  if (["network-unreachable", "network-timeout", "preparation-timeout", "server-unavailable", "worker-unavailable"].includes(problem)) return onlineHint ? "unreachable" : "offline";
  if (["unexpected-response", "response-policy", "invalid-bundle", "invalid-snapshot", "integrity-failure", "older-version"].includes(problem)) return "unusable";
  return previous === "checking" ? "unknown" : previous;
}

export type OfflineRefreshEnvironment = Readonly<{ now(): number; visible(): boolean; onlineHint(): boolean;
  schedule(callback: () => void, delay: number): unknown; cancel(timer: unknown): void; listen(callback: () => void): () => void }>;

/** One visible-document loop. Network flags are hints; only verified reads establish reachability. */
export function startOfflineRefresh(options: {
  inspect(signal: AbortSignal): Promise<OfflineReply>;
  prepare(signal: AbortSignal): Promise<OfflineReply>;
  publish(state: OfflineRefreshState): void;
}, environment: OfflineRefreshEnvironment) {
  let state = initialOfflineRefreshState;
  let stopped = false, running = false, inspected = false;
  let timer: unknown, operation: AbortController | undefined;
  let lastStart = -Infinity, lastSuccess = -Infinity, due = environment.now();
  let wasVisible = environment.visible(), wasOnline = environment.onlineHint();
  const emit = (patch: Partial<OfflineRefreshState>) => {
    if (stopped) return;
    state = { ...state, ...patch };
    options.publish(state);
  };
  const cancelTimer = () => { if (timer !== undefined) environment.cancel(timer); timer = undefined; };
  const arm = () => {
    cancelTimer();
    if (stopped || running || !environment.visible()) return;
    const now = environment.now(), next = Math.max(due, lastStart + offlineRefreshRules.minimumGapMs);
    timer = environment.schedule(() => {
      timer = undefined;
      if (environment.now() < next) arm();
      else void tick();
    }, Math.max(0, next - now));
  };
  const tick = async () => {
    cancelTimer();
    if (stopped || running || !environment.visible()) return;
    if (environment.now() < Math.max(due, lastStart + offlineRefreshRules.minimumGapMs)) { arm(); return; }
    running = true;
    const controller = new AbortController(); operation = controller;
    let canceled = false;
    try {
      if (!inspected) {
        try {
          const existing = await options.inspect(controller.signal);
          if (stopped || controller.signal.aborted) return;
          inspected = true;
          emit({ cache: cacheFrom(existing) });
        } catch {
          if (stopped || controller.signal.aborted) return;
          inspected = true;
        }
      }
      if (stopped || controller.signal.aborted || !environment.visible()) return;
      lastStart = environment.now();
      emit({ phase: "checking", connection: "checking", retryAt: null, attempts: state.attempts + 1 });
      const reply = await options.prepare(controller.signal);
      if (stopped || controller.signal.aborted) return;
      const cache = cacheFrom(reply);
      emit({ cache });
      const problem = reply.updateError ?? reply.error;
      if (!reply.ok || reply.refreshed === false || reply.retained || problem) {
        throw reply.retryAfterSeconds === undefined ? new OfflineRefreshError(problem ?? "unexpected-response")
          : new RetryAfterFailure(problem ?? "unexpected-response", reply.retryAfterSeconds);
      }
      if (!cache) throw new OfflineRefreshError("cache-unavailable");
      lastSuccess = environment.now(); due = lastSuccess + offlineRefreshRules.quietMs;
      emit({ phase: "idle", connection: "reachable", problem: null, failures: 0, retryAt: due });
    } catch (error) {
      if (stopped || controller.signal.aborted) { canceled = true; return; }
      const problem = error instanceof OfflineRefreshError ? error.code : "network-unreachable";
      const count = Math.min(state.failures + 1, offlineRefreshRules.retryMs.length + 1);
      let delay = offlineRefreshRules.retryMs[count - 1] ?? offlineRefreshRules.quietMs;
      if (error instanceof RetryAfterFailure) {
        delay = Math.max(delay, error.seconds * 1_000);
      }
      due = environment.now() + delay;
      emit({ phase: "waiting", connection: connectionFor(problem, environment.onlineHint(), state.connection), problem, failures: count, retryAt: due });
    } finally {
      running = false; operation = undefined;
      if (!stopped) {
        if (controller.signal.aborted || canceled) {
          due = Math.max(due, lastStart + offlineRefreshRules.minimumGapMs);
          emit({ phase: environment.visible() ? "idle" : "paused", retryAt: null });
        }
        arm();
      }
    }
  };
  const unlisten = environment.listen(() => {
    if (stopped) return;
    const visible = environment.visible(), online = environment.onlineHint();
    const resumed = visible && !wasVisible, connectionChanged = online !== wasOnline;
    wasVisible = visible; wasOnline = online;
    if (!visible) {
      cancelTimer(); operation?.abort(); emit({ phase: "paused", retryAt: null }); return;
    }
    if (running) return;
    if (state.failures === 0 && (resumed || connectionChanged) && environment.now() - lastSuccess >= offlineRefreshRules.hintFreshMs) due = environment.now();
    if (state.phase === "paused") emit({ phase: state.failures ? "waiting" : "idle", retryAt: due });
    arm();
  });
  emit({ phase: environment.visible() ? "idle" : "paused" });
  arm();
  return () => { stopped = true; cancelTimer(); operation?.abort(); unlisten(); };
}

class RetryAfterFailure extends OfflineRefreshError {
  readonly seconds: number;
  constructor(code: OfflineFailure, seconds: number) { super(code); this.seconds = seconds; }
}

import "server-only";

import { monitoringFail, monitoringRef } from "./monitoring-contract.ts";

export type ReadFamily = "feed" | "detail" | "revision" | "performance" | "other";
export type CacheOutcome = "hit" | "miss" | "unavailable";
const families: readonly ReadFamily[] = ["feed", "detail", "revision", "performance", "other"];
const buckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 15_000, 60_000, Infinity];
type Series = { count: number; totalMs: number; histogram: number[] };
let active: ReturnType<typeof createServerMeasurements> | undefined;

/** Explicit local/private installation only. Public processes start with measurement disabled. */
export async function installServerMeasurements(options: Readonly<{ evidenceRef: string; retentionMs: number;
  verifyPolicy(): boolean | Promise<boolean> }>) {
  if (await options.verifyPolicy() !== true) monitoringFail("unauthorized");
  const collector = createServerMeasurements(options.retentionMs);
  if (!monitoringRef.safeParse(options.evidenceRef).success || active) monitoringFail("invalid-input");
  active = collector;
  return Object.freeze({ read: collector.read, close() { if (active === collector) active = undefined; collector.clear(); } });
}

/** Fixed 5 families × (HTTP success/failure + cache hit/miss/unavailable), never URLs or visitors. */
export function createServerMeasurements(retentionMs: number, now = Date.now) {
  if (!Number.isInteger(retentionMs) || retentionMs < 1000 || retentionMs > 86_400_000) monitoringFail("invalid-input");
  let startedAt = now(); const series = new Map<string, Series>();
  const clear = () => { series.clear(); startedAt = now(); };
  const prune = () => { if (now() < startedAt || now() - startedAt >= retentionMs) clear(); };
  function record(family: ReadFamily, outcome: "success" | "failure" | CacheOutcome, durationMs: number) {
    if (!families.includes(family) || !["success", "failure", "hit", "miss", "unavailable"].includes(outcome) ||
      !Number.isFinite(durationMs) || durationMs < 0) return;
    prune(); const key = `${family}:${outcome}`;
    const value = series.get(key) ?? { count: 0, totalMs: 0, histogram: buckets.map(() => 0) };
    if (value.count >= 1_000_000_000) return; // Saturate rather than overflow or allocate more series.
    value.count++; value.totalMs += Math.min(durationMs, 86_400_000);
    value.histogram[buckets.findIndex((upper) => durationMs <= upper)]!++;
    series.set(key, value);
  }
  return Object.freeze({ record, clear,
    read() { prune(); return { kind: "process-window" as const, startedAt, throughAt: now(), retentionMs,
      series: [...series].map(([key, value]) => ({ key, ...value, histogram: [...value.histogram] })),
      // The open-ended bucket is represented as null in JSON; these are not field CWV percentiles.
      upperBoundsMs: buckets.map((v) => Number.isFinite(v) ? v : null) }; },
  });
}
export function observeCache(family: ReadFamily, outcome: CacheOutcome, durationMs: number) {
  active?.record(family, outcome, durationMs);
}
export function withServerMeasurement<Args extends unknown[]>(family: ReadFamily, handler: (...args: Args) => Promise<Response>) {
  return (...args: Args): Promise<Response> => {
    const collector = active;
    if (!collector) return handler(...args);
    const started = performance.now();
    return handler(...args).then((response) => { collector.record(family, response.status >= 500 ? "failure" : "success", performance.now() - started); return response; },
      (error: unknown) => { collector.record(family, "failure", performance.now() - started); throw error; });
  };
}

import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type ReportingDateRange } from "../../domain/calendar.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { observeCache, type CacheOutcome, type ReadFamily } from "../monitoring/server-measurements.ts";

export const publicCacheRules = Object.freeze({ mutableMs: 5000, immutableMs: 6 * 60 * 60 * 1000,
  // A year-long feed range (366 days plus two zone-window days) keeps one date tag per day beside the global tags.
  maximumBytes: 1024 * 1024, maximumTags: 380, maximumPending: 128, recoveryBatch: 100 });
export type CacheDescriptor<T> = Readonly<{ key: string; tags: readonly string[]; lifetimeMs: number;
  deadlineAt: number; kind?: ReadFamily; validUntil?: () => number; parse(value: unknown): T }>;
export type CacheSnapshot = Readonly<{ generations: Readonly<Record<string, string>>; value: unknown; createdAt: number | null; expiresAt: number | null }>;
export type PublicCacheStore = Readonly<{
  lookup(key: string, tags: readonly string[]): Promise<CacheSnapshot>;
  fill(key: string, tags: readonly string[], generations: Readonly<Record<string, string>>, value: unknown, createdAt: number, expiresAt: number): Promise<boolean>;
  reconcile(limit?: number): Promise<Readonly<{ acknowledged: number; removed: number }>>;
}>;
export type PublicResponseCache = ReturnType<typeof createPublicResponseCache>;
type CompletedRead = Readonly<{ value: unknown; expiresAt: number }>;
type PendingRead = Readonly<{ startedAt: number; result: Promise<CompletedRead> }>;
export type PublicReadCoordinator = Readonly<{
  pending: Map<string, PendingRead>; context: AsyncLocalStorage<ReadonlySet<string>>;
}>;

/** Only unfinished work is shared. Successful values and errors leave on settlement. */
export function createPublicReadCoordinator(): PublicReadCoordinator {
  return { pending: new Map(), context: new AsyncLocalStorage() };
}

function waitForPending(read: PendingRead, maximumWaitMs: number): Promise<CompletedRead | null> {
  if (maximumWaitMs <= 0) return Promise.resolve(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.min(maximumWaitMs, 2_147_483_647));
  });
  return Promise.race([read.result.catch(() => null), expired]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** One canonical, versioned key contract. Callers supply already validated queries.
 * The EAT day is part of every mutable key, including explicit historical reads:
 * their current run/window envelope changes at midnight. */
export function publicCacheDescriptor<T>(input: Readonly<{ kind: "feed" | "detail" | "performance" | "revision";
  locale: string; query: unknown; scope?: unknown; now: number; fixtureId?: string;
  range?: ReportingDateRange; deadlineAt?: number; parse(value: unknown): T }>): CacheDescriptor<T> {
  const immutable = input.kind === "revision", today = getReportingDate(utcInstantFromEpochMilliseconds(input.now));
  const tags = immutable ? [] : ["global:catalog", "global:progress"];
  if (input.fixtureId && !immutable) tags.push(`fixture:${input.fixtureId.toLowerCase()}`);
  if (input.range && !immutable) for (let day = 0; day < input.range.dayCount; day++) tags.push(`date:${addReportingDays(input.range.startDate, day)}`);
  if (tags.length > publicCacheRules.maximumTags) throw new RangeError("Public cache scope exceeds its bound.");
  const midnight = validateReportingDateRange(today, today, 1).window.endExclusive;
  return { kind: input.kind, key: evidenceFingerprint({ contract: "public-response-v1", kind: input.kind, locale: input.locale,
    query: input.query, scope: input.scope ?? null, day: immutable ? null : today }), tags: Object.freeze([...new Set(tags)].sort()),
  lifetimeMs: immutable ? publicCacheRules.immutableMs : publicCacheRules.mutableMs,
  deadlineAt: Math.min(input.deadlineAt ?? Number.MAX_SAFE_INTEGER, immutable ? Number.MAX_SAFE_INTEGER : midnight), parse: input.parse };
}

/** No error/negative caching, process-local authority or background forecast work.
 * A failed probe disables filling for that read. A failed fill still returns the
 * successful bounded database read. Original response/source clocks are retained. */
export function createPublicResponseCache(store: PublicCacheStore, now = Date.now,
  onRead: (family: ReadFamily, outcome: CacheOutcome, durationMs: number) => void = observeCache,
  coordinator = createPublicReadCoordinator()) {
  return Object.freeze({ async read<T>(descriptor: CacheDescriptor<T>, load: () => Promise<T>): Promise<T> {
    const start = performance.now(); let outcome: CacheOutcome = "miss";
    const emit = () => { try { onRead(descriptor.kind ?? "other", outcome, performance.now() - start); } catch { /* Observability cannot break a public read. */ } };
    let snapshot: CacheSnapshot | undefined;
    try {
      snapshot = await store.lookup(descriptor.key, descriptor.tags);
      const at = now();
      if (snapshot.createdAt !== null && snapshot.createdAt <= at && at - snapshot.createdAt < descriptor.lifetimeMs &&
        snapshot.expiresAt !== null && snapshot.expiresAt > at && at < descriptor.deadlineAt &&
        Buffer.byteLength(JSON.stringify(snapshot.value), "utf8") <= publicCacheRules.maximumBytes) {
        try { const value = freezeEvidence(descriptor.parse(snapshot.value)); outcome = "hit"; emit(); return value; } catch { /* Corrupt/obsolete cache data is disposable. */ }
      }
    } catch { outcome = "unavailable"; }
    const startedAt = now();
    // Every caller probes MySQL first. Changed generations, query/policy keys or
    // deadlines cannot join older work; an outage never becomes an in-memory hit.
    const flightKey = snapshot ? evidenceFingerprint({ key: descriptor.key, tags: descriptor.tags, generations: snapshot.generations,
      lifetimeMs: descriptor.lifetimeMs, deadlineAt: descriptor.deadlineAt }) : null;
    const owned = coordinator.context.getStore();
    const shared = flightKey && !owned?.has(flightKey) ? coordinator.pending.get(flightKey) : undefined;
    try {
      if (shared && shared.startedAt <= startedAt && startedAt - shared.startedAt < descriptor.lifetimeMs) {
        // Errors remain owned by their loader/bundle so endpoint-specific error
        // classes and recovery are preserved for every caller.
        const waitUntil = Math.min(shared.startedAt + descriptor.lifetimeMs, descriptor.deadlineAt,
          descriptor.validUntil?.() ?? Number.MAX_SAFE_INTEGER);
        const completed = await waitForPending(shared, waitUntil - now()), at = now();
        if (completed && shared.startedAt <= at && at - shared.startedAt < descriptor.lifetimeMs && at < completed.expiresAt &&
          at < descriptor.deadlineAt && at < (descriptor.validUntil?.() ?? Number.MAX_SAFE_INTEGER)) {
          try { const value = freezeEvidence(descriptor.parse(completed.value)); emit(); return value; }
          catch { /* Different/obsolete parsers retain the ordinary stored-read fallback. */ }
        }
      }
      const read = async (): Promise<CompletedRead> => {
        const value = await load();
        // Keep the original observation budget, including time spent loading.
        // Slow reads remain uncacheable rather than being retimestamped as fresh.
        const expiresAt = Math.min(startedAt + descriptor.lifetimeMs, descriptor.deadlineAt, descriptor.validUntil?.() ?? Number.MAX_SAFE_INTEGER);
        if (snapshot && now() < expiresAt && Buffer.byteLength(JSON.stringify(value), "utf8") <= publicCacheRules.maximumBytes) {
          try { await store.fill(descriptor.key, descriptor.tags, snapshot.generations, value, startedAt, expiresAt); } catch { /* Best effort cache only. */ }
        }
        return { value, expiresAt };
      };
      let completed: CompletedRead;
      if (flightKey && !owned?.has(flightKey) && coordinator.pending.size < publicCacheRules.maximumPending) {
        // A loader may deliberately make a nested read of the same key after
        // materializing data. Its own async context must not await itself.
        const result = Promise.resolve().then(() => coordinator.context.run(new Set([...(owned ?? []), flightKey]), read));
        const pending: PendingRead = { startedAt, result: result.finally(() => {
          if (coordinator.pending.get(flightKey) === pending) coordinator.pending.delete(flightKey);
        }) };
        coordinator.pending.set(flightKey, pending);
        completed = await pending.result;
      } else completed = await read();
      emit(); return completed.value as T;
    } catch (error) { emit(); throw error; }
  }, reconcile: store.reconcile.bind(store) });
}

import "server-only";

import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type ReportingDateRange } from "../../domain/calendar.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { observeCache, type CacheOutcome, type ReadFamily } from "../monitoring/server-measurements.ts";

export const publicCacheRules = Object.freeze({ mutableMs: 5000, immutableMs: 6 * 60 * 60 * 1000,
  maximumBytes: 1024 * 1024, maximumTags: 34, recoveryBatch: 100 });
export type CacheDescriptor<T> = Readonly<{ key: string; tags: readonly string[]; lifetimeMs: number;
  deadlineAt: number; kind?: ReadFamily; validUntil?: () => number; parse(value: unknown): T }>;
export type CacheSnapshot = Readonly<{ generations: Readonly<Record<string, string>>; value: unknown; createdAt: number | null; expiresAt: number | null }>;
export type PublicCacheStore = Readonly<{
  lookup(key: string, tags: readonly string[]): Promise<CacheSnapshot>;
  fill(key: string, tags: readonly string[], generations: Readonly<Record<string, string>>, value: unknown, createdAt: number, expiresAt: number): Promise<boolean>;
  reconcile(limit?: number): Promise<Readonly<{ acknowledged: number; removed: number }>>;
}>;
export type PublicResponseCache = ReturnType<typeof createPublicResponseCache>;

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
  onRead: (family: ReadFamily, outcome: CacheOutcome, durationMs: number) => void = observeCache) {
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
    const startedAt = now(); let value: T;
    try { value = await load(); } catch (error) { emit(); throw error; }
    const expiresAt = Math.min(startedAt + descriptor.lifetimeMs, descriptor.deadlineAt, descriptor.validUntil?.() ?? Number.MAX_SAFE_INTEGER);
    if (snapshot && now() < expiresAt && Buffer.byteLength(JSON.stringify(value), "utf8") <= publicCacheRules.maximumBytes) {
      try { await store.fill(descriptor.key, descriptor.tags, snapshot.generations, value, startedAt, expiresAt); } catch { /* Best effort cache only. */ }
    }
    emit(); return value;
  }, reconcile: store.reconcile.bind(store) });
}

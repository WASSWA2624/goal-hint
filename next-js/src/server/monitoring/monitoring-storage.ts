import "server-only";

import { storageHealthSchema, type StorageHealthEvidence } from "../database/storage-contract.ts";

/** Optional trusted operator source: exact thresholds and measurement provenance need independent approval. */
export type StorageMonitoringSource = Readonly<{ read(): Promise<unknown>; verify(evidence: StorageHealthEvidence): boolean }>;

export function approvedStorageHealth(input: unknown, at: number, maximumAgeMs: number, verify?: StorageMonitoringSource["verify"]): StorageHealthEvidence | null {
  try {
    if (!Number.isSafeInteger(at) || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0) return null;
    const result = storageHealthSchema.safeParse(input);
    if (!result.success || result.data.measuredAt > at || at - result.data.measuredAt > maximumAgeMs) return null;
    const approval: unknown = verify?.(result.data);
    if (approval !== true) { void Promise.resolve(approval).catch(() => {}); return null; }
    return result.data;
  } catch { return null; }
}

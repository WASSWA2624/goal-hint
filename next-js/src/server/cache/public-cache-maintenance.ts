import "server-only";

import type { PublicCacheStore } from "./public-cache.ts";

type MaintenanceResult = Awaited<ReturnType<PublicCacheStore["reconcile"]>>;
const maximumPasses = 1000;

export class CacheMaintenanceLimitError extends Error {
  constructor(totals: MaintenanceResult) {
    super(`Cache maintenance reached ${maximumPasses} passes (${totals.acknowledged} acknowledged, ${totals.removed} removed). Run again to continue the backlog.`);
    this.name = "CacheMaintenanceLimitError";
  }
}

/** Reuse one runtime/pool while keeping every maintenance transaction bounded. */
export async function reconcilePublicCache(store: Pick<PublicCacheStore, "reconcile">,
  options: Readonly<{ limit?: number; all?: boolean }> = {}): Promise<MaintenanceResult> {
  const totals = { acknowledged: 0, removed: 0 };
  for (let pass = 0; pass < (options.all ? maximumPasses : 1); pass++) {
    const result = await store.reconcile(options.limit);
    totals.acknowledged += result.acknowledged;
    totals.removed += result.removed;
    if (!options.all || result.acknowledged === 0 && result.removed === 0) return totals;
  }
  throw new CacheMaintenanceLimitError(totals);
}

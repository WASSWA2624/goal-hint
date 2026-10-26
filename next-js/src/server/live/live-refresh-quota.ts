import "server-only";

import type { RefreshStore } from "../refresh/refresh-mysql-store.ts";
import { FOOTBALL_PREPARATION_REQUESTS } from "./live-plan.ts";

type RecoveryStore = Pick<RefreshStore, "publication" | "outcome" | "intent" | "stage">;

/** Started stages cannot dispatch again, even when their original result is uncertain. */
export async function remainingLiveRefreshRequests(store: RecoveryStore, jobId: string, preparationEnabled = true): Promise<number> {
  const [publication, outcome] = await Promise.all([store.publication(jobId), store.outcome(jobId)]);
  if (publication !== null || outcome !== null) return 0;

  const [intent, fallback, observation] = await Promise.all([
    store.intent(jobId), store.stage(jobId, "fallback", "started"), store.stage(jobId, "observation", "started"),
  ]);
  const preparation = preparationEnabled && intent === null ? await store.stage(jobId, "preparation", "started") : null;
  const historyRequests = preparationEnabled && intent === null && preparation === null ? FOOTBALL_PREPARATION_REQUESTS : 0;
  const fallbackRequests = fallback === null ? intent?.plan.fallback.bounds?.maxRequests ?? (intent === null ? 1 : 0) : 0;
  const observationRequests = observation === null ? intent?.plan.observation.bounds.maxRequests ?? 1 : 0;
  return historyRequests + fallbackRequests + observationRequests;
}

/** Recovery consumes no provider quota; pending calls preserve the ordinary reserve. */
export async function canRunLiveRefresh(options: Readonly<{
  store: RecoveryStore; jobId: string; primaryEnabled: boolean; floor: number; remaining(): Promise<number>;
}>): Promise<boolean> {
  // AI capability does not control structured football collection.
  const requests = await remainingLiveRefreshRequests(options.store, options.jobId, true);
  return requests === 0 || await options.remaining() >= options.floor + requests;
}

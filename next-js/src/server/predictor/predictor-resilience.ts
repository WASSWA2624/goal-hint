import "server-only";

import type { CostJobPolicy, CostRequest } from "../cost-control/cost-contract.ts";
import { costFingerprint } from "../cost-control/cost-input.ts";

export const predictorResilience = Object.freeze({
  callTimeoutMs: 60_000, transientRetries: 1, consecutiveProviderFailures: 5, openMs: 10 * 60_000,
});

export type PredictorAttempt = Readonly<{ attemptId: string; dispatched: 0 | 1; requestCountUnknown: boolean; reason: string | null }>;

export const predictorRetryAttemptId = (primaryAttemptId: string): string =>
  costFingerprint({ retryOf: primaryAttemptId, ordinal: 1, version: 1 });

/** A separate durable reservation for the same owning model pin. */
export function predictorRetryRequest(request: CostRequest): CostRequest {
  return Object.freeze({ ...request, attemptId: predictorRetryAttemptId(request.attemptId) });
}

export function permitsPredictorRetry(job: CostJobPolicy, request: CostRequest): boolean {
  return job.requestLimit >= 2 && request.maximum.requests === 1 && request.timeoutMs <= predictorResilience.callTimeoutMs &&
    request.maximum.inputTokens <= Math.floor(job.inputTokenLimit / 2) &&
    request.maximum.outputTokens <= Math.floor(job.outputTokenLimit / 2) &&
    request.maximum.billedUnits <= Math.floor(job.billedUnitLimit / 2);
}

type ProviderOutcome = "success" | "failure" | "neutral";

/** One shared instance per provider runtime. Epochs fence late results across trips
 * and recovery. A half-open circuit admits exactly one provider dispatch. */
export function createPredictorCircuitBreaker(now: () => number) {
  let failures = 0, openUntil: number | null = null, probing = false, generation = 0;
  return Object.freeze({
    begin(): Readonly<{ finish(outcome: ProviderOutcome): void }> | null {
      const halfOpen = openUntil !== null;
      if (halfOpen && (now() < openUntil! || probing)) return null;
      if (halfOpen) probing = true;
      let finished = false;
      const startedGeneration = generation;
      return Object.freeze({ finish(outcome) {
        if (finished) return;
        finished = true;
        if (generation !== startedGeneration) return;
        if (halfOpen) probing = false;
        if (outcome === "success") {
          failures = 0;
          openUntil = null;
          if (halfOpen) generation++;
        } else if (outcome === "failure") {
          failures++;
          if (halfOpen || failures >= predictorResilience.consecutiveProviderFailures) {
            openUntil = now() + predictorResilience.openMs; generation++;
          }
        }
      } });
    },
  });
}

import "server-only";

import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { ValidatedIntelligenceForecast } from "./intelligence-contract.ts";
import { classifyObservationChange, DEFAULT_MONITORING_POLICY, type MonitoringObservation, type MonitoringPolicy } from "./monitoring.ts";
import { ShadowStoreError, type ShadowStore, type ShadowRevisionBody } from "./shadow-store.ts";

export type ShadowObservationInput = Readonly<{
  checkId: string; fixtureId: string; checkedAt: number; observation: MonitoringObservation | null;
  modelVersion: string; dependencyHash: string; evaluate(): Promise<ValidatedIntelligenceForecast>;
  executionDeadlineAt?: number; beforeRecord?(): Promise<void>;
}>;
/** Offline/archive integration boundary. The callback must be local computation;
 * this module does not initialize credentials, dispatch providers or publish. */
export function createShadowIntelligenceService(options: Readonly<{
  store: ShadowStore; mode?: "off" | "shadow"; policy?: MonitoringPolicy;
}>) {
  const policy = options.policy ?? DEFAULT_MONITORING_POLICY;
  return Object.freeze({ async observe(input: ShadowObservationInput) {
    if (options.mode !== "shadow") return { status: "disabled" } as const;
    if (!/^[a-f0-9]{64}$/u.test(input.dependencyHash)) throw new ShadowStoreError("invalid-input");
    const requestHash = evidenceFingerprint({ checkId: input.checkId, fixtureId: input.fixtureId, checkedAt: input.checkedAt,
      observation: input.observation, modelVersion: input.modelVersion, dependencyHash: input.dependencyHash,
      executionDeadlineAt: input.executionDeadlineAt ?? null, policy });
    const replay = await options.store.check(input.checkId);
    if (replay) {
      if (replay.requestHash !== requestHash || replay.fixtureId !== input.fixtureId) throw new ShadowStoreError("conflicting-check");
      return { status: "recorded", receipt: replay } as const;
    }
    const previous = await options.store.read(input.fixtureId);
    // Compare movements to the last forecast, so several small checks cannot hide cumulative drift.
    let change = classifyObservationChange(previous?.latest?.body.observation ?? previous?.observation ?? null, input.observation, input.checkedAt, policy);
    const freshness = classifyObservationChange(previous?.observation ?? null, input.observation, input.checkedAt, policy);
    if (freshness.severity === "unavailable") change = freshness;
    const observation = change.severity === "unavailable" ? null : input.observation;
    const cutoffLocked = observation !== null && input.checkedAt >= observation.kickoffAt - 5 * 60_000;
    const modelChanged = previous?.latest !== null && previous?.latest !== undefined && previous.latest.modelVersion !== input.modelVersion;
    const dependenciesChanged = previous?.latest !== null && previous?.latest !== undefined && previous.latest.body.dependencyHash !== input.dependencyHash;
    const availability = cutoffLocked ? "cutoff-locked" : change.severity === "unavailable" ? "unavailable" : change.suspend ? "suspended" : "available";
    const recovering = previous !== null && previous.availability !== "available" && availability === "available";
    const outcome = cutoffLocked ? "cutoff-locked" : (modelChanged || dependenciesChanged) && !change.suspend ? "model-changed" : change.severity;
    let revision: Readonly<{ semanticHash: string; modelVersion: string; body: ShadowRevisionBody }> | null = null;
    if (observation && !cutoffLocked && (change.recomputeLocal || modelChanged || dependenciesChanged || recovering)) {
      const assessed = await input.evaluate();
      const { hash: assessedHash, ...assessedBody } = assessed;
      if (assessed.fixtureId !== input.fixtureId || assessed.mode !== "shadow" || assessed.publish !== false || assessed.forecastAt > input.checkedAt)
        throw new ShadowStoreError("invalid-input");
      if (evidenceFingerprint(assessedBody) !== assessedHash) throw new ShadowStoreError("invalid-input");
      const withheld = { ...assessedBody, decision: "withhold" as const, probabilities: null, oddsValue: null,
        reasons: [...new Set([...assessed.reasons, ...change.reasons])] };
      const forecast = change.suspend ? { ...withheld, hash: evidenceFingerprint(withheld) } : assessed;
      const body: ShadowRevisionBody = { forecast, observation, change, policyVersion: policy.version, dependencyHash: input.dependencyHash };
      // Model and meaningful evidence define a version. Check/receipt clocks never do.
      revision = { semanticHash: evidenceFingerprint({ observationHash: change.hash, modelVersion: input.modelVersion,
        dependencyHash: input.dependencyHash, decision: forecast.decision, probabilities: forecast.probabilities, reasons: forecast.reasons, policy }), modelVersion: input.modelVersion, body };
    }
    await input.beforeRecord?.();
    const receipt = await options.store.record({
      check: { id: input.checkId, fixtureId: input.fixtureId, checkedAt: input.checkedAt, requestHash, outcome },
      expectedObservationHash: previous?.observationHash ?? null, expectedLatestRevisionId: previous?.latest?.id ?? null,
      observation, observationHash: change.hash, availability, revision,
      ...(input.executionDeadlineAt === undefined ? {} : { executionDeadlineAt: input.executionDeadlineAt }),
    });
    return { status: "recorded", receipt } as const;
  } });
}

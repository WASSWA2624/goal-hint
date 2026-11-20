import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { captureLocalForecasts } from "../src/server/intelligence/local-forecast-shadow.ts";
import { createShadowIntelligenceService } from "../src/server/intelligence/shadow-service.ts";
import { createMysqlShadowStore } from "../src/server/intelligence/shadow-store.ts";
import { catalogFixture } from "./helpers/catalog-fixtures.mjs";
import { shadowObservation } from "./helpers/intelligence-shadow-fixtures.mjs";
import { withPredictionPipeline } from "./prediction-pipeline.mjs";

test("a bounded local forecast sweep records stale-evidence abstentions privately and refuses a changed schedule", { timeout: 420_000 }, async (t) => {
  await withPredictionPipeline(t, async (pipeline) => {
    // Use the usual fixture import harness, then align this isolated fixture with the real sweep clock.
    await pipeline.cohort("2026-10-09", pipeline.first, { rows: [catalogFixture(4000, { kickoff: "2026-10-12T12:00:00Z" })], claim: false });
    const original = await pipeline.catalog.fixtureByProviderId(4000);
    const now = Date.now(), kickoff = new Date(now + 8 * 60 * 60_000);
    await pipeline.a.query((tx) => tx.footballFixture.update({ where: { id: original.id }, data: { kickoff,
      retrievedAt: new Date(now - 3 * 60 * 60_000) } }));
    await pipeline.instance.executeAdmin(`
      GRANT SELECT, INSERT, UPDATE (latestRevisionId, latestEligibleRevisionId, lastCheckedAt, checks,
        lastObservationJson, lastObservationHash, availability) ON goal_hint_test.IntelligenceShadowState TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.IntelligenceShadowRevision TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.IntelligenceShadowCheck TO 'cutoff_app'@'127.0.0.1';`);
    pipeline.setTime(now);
    const initialPublished = await pipeline.a.query((tx) => tx.predictionSet.count());
    const result = await captureLocalForecasts(pipeline.a, 1);
    assert.deepEqual(result, { selected: 1, recorded: 1, estimated: 0, eligible: 0, abstained: 1,
      staleSchedule: 1, reused: 0, cutoff: 0, failed: 0 });
    const store = createMysqlShadowStore(pipeline.a);
    const state = await store.read(original.id);
    assert.equal(state.checks, 1n);
    const { forecast, observation } = state.latest.body;
    assert.equal(forecast.publish, false);
    assert.equal(forecast.decision, "withhold");
    assert.ok(forecast.reasons.includes("stored-schedule-stale"));
    assert.ok(forecast.components.local.reasons.includes("insufficient-point-in-time-history"));
    assert.equal(observation.observedAt, now - 3 * 60 * 60_000);
    assert.equal((await captureLocalForecasts(pipeline.a, 1)).selected, 0);

    const following = now + 6 * 60 * 60_000 + 60_000;
    pipeline.setTime(following);
    const wall = t.mock.method(Date, "now", () => following);
    try {
      const recheck = await captureLocalForecasts(pipeline.a, 1);
      assert.equal(recheck.recorded, 1);
      assert.equal(recheck.reused, 1);
    } finally { wall.mock.restore(); }
    assert.equal((await store.read(original.id)).latest.id, state.latest.id);

    const current = await pipeline.a.query((tx) => tx.footballFixture.findUniqueOrThrow({ where: { id: original.id } }));
    const service = createShadowIntelligenceService({ store, mode: "shadow" });
    const checkedAt = following + 1;
    const request = { checkId: evidenceFingerprint({ resumedCheck: original.id }), fixtureId: original.id, checkedAt,
      modelVersion: state.latest.modelVersion, dependencyHash: state.latest.body.dependencyHash,
      observation: shadowObservation({ fixtureId: original.id, kickoffAt: kickoff.getTime(), receivedAt: following, observedAt: following }),
      executionDeadlineAt: kickoff.getTime() - 5 * 60_000, target: { fixtureVersion: current.dataVersion, kickoffAt: kickoff.getTime() },
      async evaluate() { return forecast; },
    };
    const peer = createShadowIntelligenceService({ store: createMysqlShadowStore(pipeline.b), mode: "shadow" });
    const [first, duplicate] = await Promise.all([service.observe(request), peer.observe(request)]);
    assert.deepEqual(duplicate, first);
    const checkId = evidenceFingerprint({ newSchedule: original.id });
    await assert.rejects(service.observe({ ...request, checkId, checkedAt: following + 2,
      target: { ...request.target, fixtureVersion: current.dataVersion + 1n } }));
    assert.equal(await store.check(checkId), null);
    assert.equal((await store.read(original.id)).checks, 3n);
    assert.equal(await pipeline.a.query((tx) => tx.predictionSet.count()), initialPublished);
  }, { migrationTimeoutMs: 240_000 });
});

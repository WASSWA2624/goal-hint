import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { MARKET_REGISTRY_VERSION } from "../src/domain/market-registry.ts";
import { createFootballCatalogImporter } from "../src/server/football/catalog-service.ts";
import { JobQueueError } from "../src/server/jobs/job-contract.ts";
import { createMysqlJobQueue } from "../src/server/jobs/job-mysql-store.ts";
import { createJobRegistry, defineJob } from "../src/server/jobs/job-registry.ts";
import { createJobWorker } from "../src/server/jobs/job-worker.ts";
import { createForecastRecovery } from "../src/server/refresh/forecast-recovery.ts";
import { refreshPayload } from "../src/server/refresh/refresh-input.ts";
import { createMysqlRefreshStore } from "../src/server/refresh/refresh-mysql-store.ts";
import { createMysqlDailySelectionStore } from "../src/server/selection/selection-mysql-store.ts";
import { createDailySelectionService } from "../src/server/selection/selection-service.ts";
import { catalogFixture, catalogResponse, createSyntheticCatalogAdapter } from "./helpers/catalog-fixtures.mjs";
import { evidenceHash } from "./helpers/evidence-fixtures.mjs";
import { catalogSelectionAuthority, selectionAuthority, selectionPolicy } from "./helpers/selection-fixtures.mjs";
import { withPredictionPipeline } from "./prediction-pipeline.mjs";

const total = 1_001, prefix = 47, badRank = 5, type = "prediction.daily-refresh";
const earliestId = 5000n;

/** The workload exercises production persistence and leases with an
 * inexpensive synthetic abstention in place of numerical computation. */
function cohortWorker(db, database, queue, owner) {
  const store = createMysqlRefreshStore(database, queue);
  const definition = defineJob({ type, handlerVersion: 1, payload: refreshPayload,
    async handle(payload, { lease }) {
      const failed = payload.rank === badRank;
      let reused = false;
      if (!failed) {
        const prior = await store.stage(lease.jobId, "fallback", "completed");
        reused = prior !== null;
        const value = { materialKey: lease.job.envelope.idempotencyKey, outcome: "unsupported-synthetic-market" };
        if (prior) assert.deepEqual(prior.value, value);
        else {
          assert.equal(await store.start(lease, "fallback"), true);
          await store.complete(lease, "fallback", value);
        }
      }
      await store.finish(lease, { ...lease.job.envelope.refresh, jobId: lease.jobId, at: db.now(),
        outcome: failed ? "failed" : "unavailable", reason: failed ? "synthetic-fixture-failed" : "unsupported-synthetic-market",
        revisionId: null, publicationId: null, costs: { ai: null, research: null },
        phases: failed ? {} : { fallback: reused ? "reused" : "completed" } });
      return failed ? { status: "failed", reason: "non-retryable", retryable: false } : { status: "succeeded" };
    },
  });
  const registry = createJobRegistry([definition]);
  return { store, registry, worker: createJobWorker({ queue, registry, ownerId: evidenceHash(owner) }) };
}

test("1,001 sealed fixture jobs preserve durable progress across a worker restart", { timeout: 900_000 }, async (t) => {
  await withPredictionPipeline(t, async (db) => {
    const setupAt = performance.now();
    // Reuse the reviewed publication harness to establish one real immutable
    // forecast. The scale workload below exercises durable outcomes.
    await db.cohort("2026-10-09", db.first, { rows: [catalogFixture(4000, { kickoff: "2026-10-12T12:00:00Z" })] });
    const seed = await db.setup(4000);
    const publication = await db.publisher.publish(seed.input, seed.lease);
    const replayed = await db.publisher.publish(seed.input, seed.lease);
    assert.equal(publication.refresh.outcome, "published");
    assert.equal(replayed.revision.id, publication.revision.id);

    await db.instance.executeAdmin(`
      GRANT SELECT ON goal_hint_test.FixtureFacts TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.SelectionFixtureInput TO 'cutoff_app'@'127.0.0.1';`);
    const canonical = await db.a.query((tx) => tx.footballFixture.findUniqueOrThrow({ where: { id: seed.fixture.id } }));
    const fixtures = Array.from({ length: total }, (_, index) => ({ ...canonical, id: randomUUID(), activeCycleId: null,
      dataVersion: 1n, externalId: earliestId + BigInt(index), kickoff: new Date(canonical.kickoff.getTime() + index * 60_000) }));
    for (let index = 0; index < fixtures.length; index += 250) {
      await db.a.query((tx) => tx.footballFixture.createMany({ data: fixtures.slice(index, index + 250) }));
    }
    const guard = { forecast: { type, concurrency: 1 } };
    const queueA = createMysqlJobQueue(db.a, guard), queueB = createMysqlJobQueue(db.b, guard);
    const selection = createMysqlDailySelectionStore(db.a, queueA, { hourly: { localEvidence: false } });
    const provider = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, []) });
    provider.clock.value = db.now();
    const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: db.catalog,
      authority: catalogSelectionAuthority, clock: provider.clock });
    const base = selectionPolicy();
    const select = createDailySelectionService({ importer, store: selection, authority: selectionAuthority(), cutoff: db.first,
      reconcileHourly: async () => fixtures.map(({ id }) => id),
      policy: { ...base, importDays: 1, maxFixtures: 2_000, refreshCapacity: 1,
        forecastLifecycle: { engineVersion: evidenceHash("acceptance-coordinated-forecast"), marketRegistryVersion: MARKET_REGISTRY_VERSION },
        refresh: { ...base.refresh, type, timeoutMs: 60_000, leaseMs: 15_000, fallbackReserveMs: 20_000,
          maxAttempts: 3, backoff: { baseMs: 100, maxMs: 100 } } },
    });
    const hour = Math.floor(db.now() / 3_600_000) * 3_600_000;
    const selected = await select.runHourly(hour);
    assert.equal(selected.status, "committed");
    assert.equal(selected.total, total);
    const manifest = (await selection.inspect(selected.runId)).manifest;
    assert.equal(manifest.entries.length, total);
    assert.equal(new Set(manifest.entries.map(({ fixtureId }) => fixtureId)).size, total);
    assert.equal(new Set(manifest.entries.map(({ envelope }) => envelope.idempotencyKey)).size, total);
    t.diagnostic(`Seeded, selected and enqueued ${total} fixture jobs in ${Math.round(performance.now() - setupAt)} ms.`);

    db.setTime(Math.max(db.now(), ...manifest.entries.map(({ envelope }) => envelope.notBefore)) + 1);
    const workAt = performance.now();
    const original = cohortWorker(db, db.a, queueA, "cohort-worker-before-interruption");
    const standby = cohortWorker(db, db.b, queueB, "cohort-worker-standby");
    const jobIdAt = async (rank) => (await db.a.query((tx) => tx.runFixture.findFirstOrThrow({ where: { runId: selected.runId, rank } }))).jobId;
    for (let index = 0; index < prefix; index++) assert.equal(await original.worker.runOnce(), true);
    const progress = await selection.progress(selected.runId);
    assert.equal(progress.terminal, prefix);
    assert.equal(progress.completed, prefix - 1);
    assert.equal((await original.store.outcome(await jobIdAt(badRank))).outcome, "failed");
    assert.equal((await original.store.outcome(await jobIdAt(badRank + 1))).outcome, "unavailable");
    assert.equal(await original.store.outcome(await jobIdAt(prefix)), null);

    const interrupted = await queueA.claim(evidenceHash("cohort-interrupted-lease"), original.registry.types);
    assert.ok(interrupted);
    assert.equal(interrupted.job.envelope.payload.rank, prefix);
    assert.equal(await original.store.start(interrupted, "fallback"), true);
    await original.store.complete(interrupted, "fallback", { materialKey: interrupted.job.envelope.idempotencyKey,
      outcome: "unsupported-synthetic-market" });
    const sealedAt = (await original.store.stage(interrupted.jobId, "fallback", "completed")).at;
    assert.equal(await standby.worker.runOnce(), false, "one live lease occupies the forecast lane");

    // The harness controls time inside transactions. Give the scanner the
    // same controlled UTC clock for its reads.
    const recovery = createForecastRecovery({ database: { query: (operation) => db.b.transaction(operation),
      transaction: db.b.transaction }, queue: queueB, jobType: type });
    const intact = await recovery.run();
    assert.equal(intact.active, 1);
    assert.equal(intact.retried, 0);
    assert.equal((await queueA.inspect(interrupted.jobId)).fence, interrupted.fence);
    db.setTime(interrupted.leaseExpiresAt + 1);
    const recovered = await recovery.run();
    assert.equal(recovered.retried, 1);
    assert.equal(recovered.failed, 0);
    await assert.rejects(queueA.acknowledge(interrupted), (error) => error instanceof JobQueueError && error.reason === "lost-lease");
    db.setTime(Math.max(db.now(), (await queueB.inspect(interrupted.jobId)).availableAt + 1));

    const resumed = cohortWorker(db, db.b, queueB, "cohort-worker-after-interruption");
    for (let index = prefix; index < total; index++) {
      assert.equal(await resumed.worker.runOnce(), true, `resumed claim ${index}`);
      if ((index + 1) % 200 === 0) {
        const partial = await selection.progress(selected.runId);
        assert.equal(partial.terminal, index + 1);
        assert.equal(partial.completed, index);
      }
    }
    assert.equal(await resumed.worker.runOnce(), false);
    const final = await selection.progress(selected.runId);
    assert.deepEqual({ total: final.total, terminal: final.terminal, completed: final.completed },
      { total, terminal: total, completed: total - 1 });
    assert.equal((await resumed.store.stage(interrupted.jobId, "fallback", "completed")).at, sealedAt);
    assert.equal((await resumed.store.outcome(interrupted.jobId)).phases.fallback, "reused");
    assert.equal((await queueB.attempts(interrupted.jobId)).length, 2);
    assert.equal((await queueB.enqueue(manifest.entries[prefix].envelope)).id, interrupted.jobId);
    assert.equal(await resumed.worker.runOnce(), false);
    assert.deepEqual(await recovery.run(), { restored: 0, retried: 0, completed: 0, failed: 0, pending: 0, active: 0, lagMs: 0, hasMore: false });
    const counts = await db.b.query(async (tx) => ({
      fixtures: await tx.footballFixture.count({ where: {
        provider: "api-football", externalId: { gte: earliestId, lt: earliestId + BigInt(total) },
      } }),
      jobs: await tx.durableJob.count({ where: { refreshRunId: selected.runId, type } }),
      outcomes: await tx.predictionRefreshOutcome.count(),
      revisions: await tx.predictionSet.count(),
      publishedCohortRevisions: await tx.predictionSet.count({ where: { runId: selected.runId } }),
    }));
    assert.deepEqual(counts, { fixtures: total, jobs: total, outcomes: total, revisions: 1, publishedCohortRevisions: 0 });
    t.diagnostic(`Drained ${total} terminal fixture jobs in ${Math.round(performance.now() - workAt)} ms. One real forecast replay was verified separately.`);
  }, { migrationTimeoutMs: 240_000 });
});

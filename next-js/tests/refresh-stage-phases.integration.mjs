import test from 'node:test';
import assert from 'node:assert/strict';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { refreshHarness } from './helpers/refresh-fixtures.mjs';
import { createPredictionRefreshService } from '../src/server/refresh/refresh-service.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { createJobRegistry } from '../src/server/jobs/job-registry.ts';
import { evidenceHash } from './helpers/evidence-fixtures.mjs';

// Every phase the refresh service writes must pass the deployed stage check.
test('preparation and empty-evidence stages persist through the deployed stage check', { timeout: 300000 }, async (t) => {
  await withPredictionPipeline(t, async (db) => {
    const scenarios = [{}, {}], h = await refreshHarness(db, scenarios);
    await t.test('preparation and evidence-empty start and complete as sealed stages', async () => {
      const lease = await db.queue.claim(evidenceHash('stage-phase-worker'), h.jobs.types);
      for (const [phase, value] of [['preparation', { status: 'prepared' }], ['evidence-empty', { status: 'denied', reason: 'unavailable' }]]) {
        assert.equal(await h.store.start(lease, phase), true, `${phase} started`);
        await h.store.complete(lease, phase, value);
        const stored = await h.store.stage(lease.jobId, phase, 'completed');
        assert.equal(stored.phase, phase); assert.deepEqual(stored.value, value);
      }
    });
    await t.test('an AI-enabled refresh with bounded preparation publishes', async () => {
      let prepared = 0;
      const service = createPredictionRefreshService({ ...h.serviceOptions, async prepare() { prepared++; } });
      const worker = createJobWorker({ queue: db.queue, registry: createJobRegistry([service.definition]), ownerId: evidenceHash('prepared-worker') });
      h.source.clock.value = db.now(); await worker.runOnce();
      const outcome = await service.outcome(await h.jobIdAt(1));
      assert.ok(outcome); assert.equal(outcome.outcome, 'published'); assert.equal(outcome.phases.preparation, 'prepared'); assert.equal(prepared, 1);
    });
  });
});

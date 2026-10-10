import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { recoveryHarness, recoveryPolicy, recoveryAuthority } from './helpers/recovery-fixtures.mjs';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { createJobRegistry } from '../src/server/jobs/job-registry.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { createRecoveryWatchdog } from '../src/server/recovery/recovery-service.ts';
import { createMysqlDailySelectionStore } from '../src/server/selection/selection-mysql-store.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createDailySelectionService } from '../src/server/selection/selection-service.ts';
import { parseSelectionPolicy } from '../src/server/selection/selection-input.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createResultSyncService } from '../src/server/results/result-sync-service.ts';
import { RecoveryError } from '../src/server/recovery/recovery-input.ts';
import { JobQueueError } from '../src/server/jobs/job-contract.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createMysqlJobQueue } from '../src/server/jobs/job-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { jobEnvelope } from './helpers/job-fixtures.mjs';
import { selectionPolicy, selectionAuthority, catalogSelectionAuthority, degradedAction, SELECTION_FOR } from './helpers/selection-fixtures.mjs';
import { catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { lifecyclePolicy, lifecycleAuthority } from './helpers/lifecycle-fixtures.mjs';
import { resultPolicy, resultAuthority, resultProvider, resultHash } from './helpers/result-sync-fixtures.mjs';

const day = 86_400_000;
test('private watchdog recovery invariants on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const first = await p.setup(3000), failed = await p.setup(3005), crashed = await p.setup(3002), earlyFailed = await p.setup(3001);
    const h = await recoveryHarness(p), originalNow = p.now();
    await promisify(execFile)(process.execPath, ['--conditions=react-server', 'scripts/database.mjs', 'verify'],
      { env: p.env, windowsHide: true, timeout: 60_000 });
    const counts = () => p.a.query(async (tx) => ({ jobs: await tx.durableJob.count(), events: await tx.durableJobEvent.count(),
      runs: await tx.dailyRun.count(), imports: await tx.footballImport.count(), audit: await tx.recoveryAudit.count(),
      versions: (await tx.durableJob.aggregate({ _sum: { version: true } }))._sum.version }));

    await t.test('dry runs perform no writes or provider calls; permissions and reviewed approval fail closed', async () => {
      const before = await counts(), network = h.provider.network?.length;
      for (const scope of ['runs','jobs','locks','results','settlement']) {
        try { await h.watchdog.inspect(scope); } catch (error) { t.diagnostic(`Failed inspection scope: ${scope}`); throw error; }
      }
      const singleConnection = createDatabase(parseRuntimePolicy({ ...p.env, GOAL_HINT_DATABASE_POOL_LIMIT: '1' }));
      try {
        const queue = createMysqlJobQueue(singleConnection);
        const singlePoolWatchdog = createRecoveryWatchdog({ database: singleConnection, queue, policy: h.policy,
          authority: recoveryAuthority(), services: { ...h.services,
            settlement: createMarketSettlementService({ database: singleConnection, queue }) } });
        assert.equal((await singlePoolWatchdog.inspect('settlement')).scope, 'settlement');
      } finally { await singleConnection.disconnect(); }
      assert.deepEqual(await counts(), before); assert.equal(h.provider.network?.length, network);
      const denied = createRecoveryWatchdog({ database: p.a, queue: p.queue, policy: h.policy,
        services: h.services, authority: recoveryAuthority({ verifyPlan: () => false }) });
      await assert.rejects(denied.enqueue(h.plan([{ kind: 'job', jobId: failed.lease.jobId, expectedVersion: failed.lease.job.version }])), RecoveryError);
      assert.deepEqual(await counts(), before);
      const stale = h.plan([{ kind: 'job', jobId: failed.lease.jobId, expectedVersion: failed.lease.job.version }],
        { plannedAt: p.now() - 2000, expiresAt: p.now() });
      await assert.rejects(h.watchdog.enqueue(stale), RecoveryError); assert.deepEqual(await counts(), before);
    });
    await t.test('published stale jobs return their existing revision; duplicate repair deliveries and stale owners cannot republish', async () => {
      const publication = await p.publisher.publish(first.input, first.lease);
      assert.equal(publication.refresh.outcome, 'published');
      p.setTime(first.lease.leaseExpiresAt + 1);
      const job = await p.queue.inspect(first.lease.jobId), plan = h.plan([{ kind: 'job', jobId: job.id, expectedVersion: job.version }]);
      const [a, b] = await Promise.all([h.watchdog.enqueue(plan), h.watchdog.enqueue(plan)]); assert.equal(a.jobId, b.jobId);
      const other = createJobWorker({ queue: p.otherQueue, registry: createJobRegistry([h.watchdog.definition]), ownerId: evidenceFingerprint('other-watchdog') });
      await Promise.all([h.worker.runOnce(), other.runOnce()]);
      assert.equal((await p.queue.inspect(a.jobId)).state, 'succeeded');
      assert.equal((await p.queue.inspect(job.id)).state, 'succeeded');
      await assert.rejects(p.queue.acknowledge(first.lease), (error) => error instanceof JobQueueError && error.reason === 'lost-lease');
      assert.equal(await p.a.query((tx) => tx.predictionSet.count({ where: { fixtureId: first.fixture.id } })), 1);
      const audit = await h.watchdog.audit(a.jobId); assert.equal(audit.records.length, 2);
      assert.equal(audit.records.find((row) => row.phase === 'intent').body.previous.job.state, 'running');
      assert.equal(audit.records.find((row) => row.phase === 'outcome').body.outcome.state, 'succeeded');
      assert.equal(audit.records.find((row) => row.phase === 'outcome').body.outcome.publication.revisionId, publication.revision.id);
      assert.equal(JSON.stringify(audit).includes('envelopeJson'), false);
    });
    await t.test('worker crashes retain original job identity, attempts, bounded jitter and attempt cap', async () => {
      const before = await p.queue.inspect(failed.lease.jobId);
      const repaired = await h.repair([{ kind: 'job', jobId: before.id, expectedVersion: before.version }]);
      assert.equal((await p.queue.inspect(repaired.jobId)).state, 'succeeded');
      const pending = await p.queue.inspect(before.id);
      assert.equal(pending.state, 'pending'); assert.equal(pending.attemptCount, before.attemptCount);
      assert.deepEqual(pending.envelope, before.envelope);
      assert.ok(pending.availableAt >= p.now() + before.envelope.backoff.baseMs / 2);
      assert.ok(pending.availableAt < p.now() + before.envelope.backoff.baseMs);
      await assert.rejects(p.queue.renew(failed.lease), JobQueueError);
      const live = await p.queue.inspect(crashed.lease.jobId);
      // A stale planned version cannot change a job after another worker/recovery wins.
      await h.repair([{ kind: 'job', jobId: live.id, expectedVersion: Math.max(1, live.version - 1) }]);
      assert.deepEqual(await p.queue.inspect(live.id), live);
    });
    await t.test('failed work can only resume the original eligible job; cutoff makes it terminal', async () => {
      // Use a still-eligible long-dated member, with a fresh original lease.
      p.setTime(p.now() + 1000);
      const lease = await p.queue.claim(evidenceFingerprint('retry-failed-worker'), [{ type: first.lease.job.envelope.type, handlerVersion: 1 }]);
      assert.ok(lease);
      const terminal = await p.queue.retry(lease, 'handler-failed', false);
      if (terminal.attemptCount < terminal.envelope.maxAttempts) {
        await h.repair([{ kind: 'job', jobId: terminal.id, expectedVersion: terminal.version }]);
        const resumed = await p.queue.inspect(terminal.id);
        assert.equal(resumed.state, 'pending'); assert.equal(resumed.attemptCount, terminal.attemptCount);
        assert.equal(resumed.id, terminal.id);
      }
      p.setTime(first.cycle.cutoffAt);
      const expired = await p.queue.inspect(earlyFailed.lease.jobId);
      await h.repair([{ kind: 'job', jobId: expired.id, expectedVersion: expired.version }]);
      assert.ok(['expired','failed'].includes((await p.queue.inspect(expired.id)).state));
      const late = await p.publisher.publish(earlyFailed.input, earlyFailed.lease);
      assert.notEqual(late.refresh.outcome, 'published');
      assert.equal(await p.a.query((tx) => tx.predictionSet.count({ where: { fixtureId: earlyFailed.fixture.id } })), 0);
    });
    await t.test('reviewed repair never resets an exhausted original attempt budget', async () => {
      const job = await p.queue.enqueue(jobEnvelope({ type: 'test.recovery-cap', notBefore: p.now(), expiresAt: p.now() + 60_000, maxAttempts: 1 }));
      const lease = await p.queue.claim(evidenceFingerprint('exhausted-worker'), [{ type: job.envelope.type, handlerVersion: 1 }]);
      const failed = await p.queue.retry(lease, 'handler-failed', false);
      await h.repair([{ kind: 'job', jobId: failed.id, expectedVersion: failed.version }]);
      const result = await p.queue.inspect(failed.id);
      assert.equal(result.state, 'failed'); assert.equal(result.attemptCount, 1); assert.deepEqual(result.envelope, failed.envelope);
      assert.equal(result.terminalReason, 'attempts-exhausted');
    });
    await t.test('late locks reconstruct the accepted revision and remain immutable under duplicate repairs', async () => {
      const action = { kind: 'cutoff', fixtureId: first.fixture.id, cycleId: first.cycle.id };
      await h.repair([action]); const before = await p.totals(first);
      assert.equal(before.cycle.state, 'closed'); assert.ok(before.cycle.lockedSetId);
      p.setTime(p.now() + 1); await h.repair([action]);
      assert.deepEqual(await p.totals(first), before);
      const scan = await h.watchdog.inspect('locks');
      assert.ok(scan.draft.actions.some((row) => row.cycleId === crashed.cycle.id));
      assert.ok(!scan.draft.actions.some((row) => row.cycleId === first.cycle.id));
    });
    await t.test('watchdog crash after a canonical commit resumes idempotently and records failure/outcome', async () => {
      let fail = true;
      const crashHarness = await recoveryHarness(p, { services: { cutoff: { async close(target) {
        const result = await p.first.close(target); if (fail) { fail = false; throw new Error('synthetic-private-payload'); } return result;
      } } } });
      const job = await crashHarness.watchdog.enqueue(crashHarness.plan([{ kind: 'cutoff', fixtureId: crashed.fixture.id, cycleId: crashed.cycle.id }]));
      await crashHarness.worker.runOnce();
      assert.equal((await p.queue.inspect(job.jobId)).state, 'pending');
      const committed = await p.totals(crashed);
      p.setTime(p.now() + 200); await crashHarness.worker.runOnce();
      assert.equal((await p.queue.inspect(job.jobId)).state, 'succeeded');
      assert.deepEqual(await p.totals(crashed), committed);
      const audit = await crashHarness.watchdog.audit(job.jobId);
      assert.deepEqual(audit.records.map((row) => row.phase).sort(), ['failure','intent','outcome']);
      assert.equal(JSON.stringify(audit).includes('synthetic-private-payload'), false);
      await assert.rejects(p.a.query((tx) => tx.recoveryAudit.deleteMany()));
      await assert.rejects(p.a.query((tx) => tx.recoveryAudit.updateMany({ data: { phase: 'outcome' } })));
    });
    await t.test('a stale watchdog owner cannot execute or append audit after takeover', async () => {
      const target = await p.queue.inspect(first.lease.jobId);
      p.setTime(p.now() + 1);
      const plan = h.plan([{ kind: 'job', jobId: target.id, expectedVersion: target.version }]);
      const job = await h.watchdog.enqueue(plan), types = [{ type: h.watchdog.definition.type, handlerVersion: 1 }];
      const old = await p.queue.claim(evidenceFingerprint('lost-watchdog'), types);
      assert.equal(old.jobId, job.jobId);
      p.setTime(old.leaseExpiresAt);
      assert.equal(await p.queue.claim(evidenceFingerprint('replacement-watchdog'), types), null);
      p.setTime(p.now() + 200);
      const replacement = await p.queue.claim(evidenceFingerprint('replacement-watchdog'), types);
      assert.ok(replacement.fence > old.fence);
      const before = await h.watchdog.audit(job.jobId);
      const context = (lease) => ({ lease, signal: new AbortController().signal, checkpoint: async () => {},
        deadlineAt: lease.deadlineAt, primaryDeadlineAt: lease.deadlineAt, remainingMs: () => 30_000, recordUsage: async () => {} });
      await assert.rejects(h.watchdog.definition.handle(plan, context(old)), JobQueueError);
      assert.deepEqual(await h.watchdog.audit(job.jobId), before);
      assert.equal((await h.watchdog.definition.handle(plan, context(replacement))).status, 'succeeded');
      await p.queue.acknowledge(replacement);
    });
    await t.test('settlement recovery leaves unresolved results pending and preserves locked forecasts', async () => {
      const before = await p.totals(first);
      await h.repair([{ kind: 'settlement', fixtureId: first.fixture.id }]);
      const rows = await h.services.settlement.settleFixture(first.fixture.id);
      assert.ok(rows);
      assert.equal(await p.a.query((tx) => tx.fixtureResult.count({ where: { fixtureId: first.fixture.id } })), 0);
      const revisions = await p.a.query((tx) => tx.marketSettlementRevision.findMany({ where: { cycleId: first.cycle.id } }));
      assert.equal(revisions.length, 4); assert.ok(revisions.every((row) => row.body.status === 'pending'));
      assert.equal((await p.totals(first)).cycle.lockedSetId, before.cycle.lockedSetId);
    });
    await t.test('confirmed provider-ID mappings are audited; conflicting identities are held, never merged by name', async () => {
      const action = { kind: 'mapping', externalId: 999999, candidateExternalId: first.fixture.homeExternalIds[0],
        evidenceRef: 'synthetic-confirmed-mapping', sourceRef: 'synthetic-authoritative-provider-ids',
        observedAt: p.now(), retentionEvidenceRef: 'synthetic-retention' };
      const result = await h.repair([action]);
      const audit = await h.watchdog.audit(result.jobId);
      assert.equal(audit.records.find((row) => row.phase === 'outcome').body.outcome.status, 'resolved');
      p.setTime(p.now() + 1);
      const conflicting = await h.repair([{ ...action, candidateExternalId: first.fixture.awayExternalIds[0], observedAt: p.now() }]);
      const conflict = await h.watchdog.audit(conflicting.jobId);
      assert.equal(conflict.records.find((row) => row.phase === 'outcome').body.outcome.reason, 'conflicting-mapping');
      const identity = await p.a.query((tx) => tx.footballTeamProvider.findUnique({ where: {
        provider_externalId: { provider: 'api-football', externalId: 999999n } } }));
      assert.equal(identity.teamId, first.fixture.homeTeamId);
    });
    await t.test('missed EAT cron is detected independently and repaired once without public reads', async () => {
      p.setTime(SELECTION_FOR + day + 60_000); h.provider.clock.value = p.now();
      const scan = await h.watchdog.inspect('runs');
      assert.equal(scan.draft.actions.length, 1); assert.equal(scan.draft.actions[0].scheduledFor, SELECTION_FOR + day);
      const plan = { ...scan.draft, actor: 'synthetic-operator', reason: 'missed-cron', approvalRef: 'synthetic-review' };
      const a = await h.watchdog.enqueue(plan); await h.worker.runOnce();
      assert.equal((await p.queue.inspect(a.jobId)).state, 'succeeded');
      assert.equal((await h.watchdog.inspect('runs')).draft, null);
      assert.equal(await p.a.query((tx) => tx.dailyRun.count({ where: { eatDate: new Date('2026-10-10T00:00:00Z') } })), 1);
    });
    await t.test('an interrupted import resumes the original receipt before manifest dispatch', async () => {
      p.setTime(SELECTION_FOR + 2 * day + 60_000); h.provider.clock.value = p.now();
      const raw = parseSelectionPolicy(selectionPolicy()), lease = await h.selectionStore.acquire('2026-10-11', raw, evidenceFingerprint('import-crash-owner'));
      const pending = await h.selectionStore.beginImport(lease, '2026-10-11', raw), request = pending.request;
      const importer = createFootballCatalogImporter({ adapter: h.provider.adapter, store: p.catalog,
        authority: catalogSelectionAuthority, clock: { now: p.now } });
      await importer.import(request); // Crash before finishImport/commit.
      await h.selectionStore.release(lease);
      const scan = await h.watchdog.inspect('runs'); await h.repair(scan.draft.actions);
      const row = await p.a.query((tx) => tx.dailyRunImport.findUnique({ where: { id: request.id } }));
      assert.ok(row.finishedAt); assert.equal(row.failure, null);
      const state = await h.selectionStore.inspect(lease.runId);
      assert.equal(state.manifest.partial, false); assert.ok(state.manifest.coverage.every((entry) => entry.status === 'complete'));
      assert.equal(await p.a.query((tx) => tx.dailyRunImport.count({ where: { runId: lease.runId, eatDate: new Date('2026-10-11T00:00:00Z') } })), 1);
    });
    await t.test('failed imports remain incomplete; sealed degraded manifests never admit late discoveries', async () => {
      p.setTime(SELECTION_FOR + 3 * day + 60_000);
      const raw = parseSelectionPolicy(selectionPolicy()), store = createMysqlDailySelectionStore(p.a, p.queue);
      const lease = await store.acquire('2026-10-12', raw, evidenceFingerprint('degraded-owner'));
      await store.release(lease);
      const broken = await recoveryHarness(p, { services: { selection: (policy) => createDailySelectionService({ policy,
        authority: selectionAuthority(), store, cutoff: p.first, importer: { import() { throw new Error('synthetic-outage'); } } }) } });
      const failureJob = await broken.repair([{ kind: 'selection', scheduledFor: SELECTION_FOR + 3 * day, selectionHash: evidenceFingerprint(raw) }]);
      assert.equal((await store.inspect(lease.runId)).manifest, null);
      assert.equal((await p.queue.inspect(failureJob.jobId)).state, 'pending');
      const owner = await store.acquire('2026-10-12', raw, evidenceFingerprint('reviewed-degradation-owner'));
      const sealed = await store.commit(owner, raw, degradedAction); await store.release(owner);
      assert.equal(sealed.partial, true); assert.ok(sealed.coverage.every((entry) => entry.status !== 'complete'));
      const provider = createSyntheticCatalogAdapter({ rows: [catalogFixture(99001, { kickoff: '2026-10-12T12:00:00Z' })] });
      provider.clock.value = p.now();
      await createFootballCatalogImporter({ adapter: provider.adapter, store: p.catalog, authority: catalogSelectionAuthority, clock: provider.clock })
        .import(catalogRequest({ kind: 'fixtures', query: { date: '2026-10-12' } }, p.now()));
      await h.repair([{ kind: 'selection', scheduledFor: SELECTION_FOR + 3 * day, selectionHash: evidenceFingerprint(raw) }]);
      assert.deepEqual((await store.inspect(lease.runId)).manifest, sealed);
      assert.equal(await p.a.query((tx) => tx.runFixture.count({ where: { runId: lease.runId } })), sealed.entries.length);
      const late = await p.catalog.fixtureByProviderId(99001);
      assert.ok(!sealed.entries.some((entry) => entry.fixtureId === late.id));
    });
    await t.test('unresolved result recovery uses the existing fenced poller and quota gateway without fabricating FT', async () => {
      p.setTime(originalNow);
      const accountId = resultHash('watchdog-results'), row = catalogFixture(99500, { kickoff: new Date(p.now() - 120_000).toISOString() });
      const provider = createSyntheticCatalogAdapter({ rows: [row] }); provider.clock.value = p.now() - 61_000;
      await createFootballCatalogImporter({ adapter: provider.adapter, store: p.catalog, authority: catalogSelectionAuthority, clock: provider.clock })
        .import(catalogRequest({ kind: 'fixtures', query: { fixtureId: 99500 } }, provider.clock.value));
      await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
      const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
      const store = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
      const source = resultProvider({ now: p.now }, { accountId, rows: [] });
      const poller = createResultSyncService({ accountId, store, policy: resultPolicy(), authority: resultAuthority(),
        adapter: source.adapter.evidence, clock: { now: p.now } });
      try {
        const r = await recoveryHarness(p, { policy: recoveryPolicy({ resultAccountId: accountId }), services: { results: { accountId, runOnce: poller.runOnce } } });
        const scan = await r.watchdog.inspect('results'); await r.repair(scan.draft.actions);
        const fixture = await p.catalog.fixtureByProviderId(99500);
        assert.equal(await p.a.query((tx) => tx.fixtureResult.count({ where: { fixtureId: fixture.id } })), 0);
        assert.ok(source.reservations.length > 0);
        assert.ok(source.reservations.every((entry) => entry.priority === 'results-cutoff' || entry.priority === 'live-date-sync'));
        assert.equal((await p.catalog.fixtureByProviderId(99500)).status, 'scheduled');
      } finally { await poller.stop(); }
    });
  });
});

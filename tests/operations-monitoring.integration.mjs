import assert from 'node:assert/strict';
import test from 'node:test';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { monitoringPolicy, monitoringAuthority, monitoringSnapshot } from './helpers/monitoring-fixtures.mjs';
import { createMonitoringInspector } from '../src/server/monitoring/monitoring-scan.ts';
import { createMysqlMonitoringStore } from '../src/server/monitoring/monitoring-mysql-store.ts';
import { createOperationsMonitor, createLocalMonitoringSink } from '../src/server/monitoring/monitoring-alerts.ts';
import { createQuotaLimiter } from '../src/server/football/quota-limiter.ts';
import { createMysqlQuotaStore } from '../src/server/football/quota-mysql-store.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { MonitoringError } from '../src/server/monitoring/monitoring-contract.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { lifecyclePolicy, lifecycleAuthority } from './helpers/lifecycle-fixtures.mjs';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createResultSyncService } from '../src/server/results/result-sync-service.ts';
import { resultPolicy, resultAuthority, resultProvider } from './helpers/result-sync-fixtures.mjs';
import { catalogFixture } from './helpers/catalog-fixtures.mjs';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';

test('private monitoring collection and durable alert delivery on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    await p.instance.executeAdmin(`GRANT SELECT, UPDATE (stateJson) ON goal_hint_test.OperationsMonitorState TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.ApiQuotaPeriod TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.ApiQuotaAttempt TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT ON goal_hint_test.RecoveryAudit TO 'cutoff_app'@'127.0.0.1';`);
    const published = await p.setup(3000), failed = await p.setup(3001);
    await p.publisher.publish(published.input, published.lease);
    p.setTime(p.now() + 100);
    await p.queue.retry(failed.lease, 'handler-failed', false);
    const accountId = evidenceFingerprint('synthetic-monitoring-account'), periodId = evidenceFingerprint('synthetic-monitoring-period');
    const policy = monitoringPolicy({ accountId }), authority = monitoringAuthority();
    const quotaStore = createMysqlQuotaStore(p.a), limiter = createQuotaLimiter({ accountId, store: quotaStore, verifyEvidence: () => true });
    assert.equal((await limiter.initialize({ accountId, periodId, startsAt: p.now() - 1000, endsAt: p.now() + 86_400_000,
      subscriptionExpiresAt: p.now() + 3_600_000, providerDailyLimit: 150_000, dailyRemaining: 150_000,
      secondLimit: 15, minuteLimit: 900, evidenceRef: 'synthetic-monitoring-provider' })).status, 'initialized');
    const reserved = await limiter.reserve({ requestId: evidenceFingerprint('monitor-request'), workKey: evidenceFingerprint('monitor-work'),
      priority: 'results-cutoff', deadlineAt: p.now() + 60_000, timeoutMs: 1000 });
    assert.equal(reserved.status, 'reserved', JSON.stringify(reserved)); assert.equal((await limiter.claimLaunch(reserved.permit)).status, 'claimed');
    assert.equal((await limiter.complete(reserved.permit, { kind: 'rate-limited', dailyRemaining: 5000, retryAfterMs: 1000 })).status, 'recorded');
    const inspector = createMonitoringInspector({ database: p.a, policy, authority, costs: async () => monitoringSnapshot(p.now()).costs });
    const canonical = () => p.a.query(async (tx) => ({ jobs: await tx.durableJob.findMany({ select: { id: true, version: true, ownerId: true } }),
      runs: await tx.dailyRun.count(), quota: await tx.apiQuotaAccount.findUnique({ where: { id: accountId } }), audits: await tx.predictionAudit.count() }));

    await t.test('collection uses aggregate ledgers and safe correlations without writes, providers or owner-token output', async () => {
      const before = await canonical(), snapshot = await inspector.inspect();
      assert.equal(snapshot.metrics.available, 1, 'collector query/contracts must succeed');
      assert.equal(snapshot.metrics['failed-jobs'], 1); assert.ok(snapshot.metrics['job-duration-count'] >= 1);
      assert.ok(snapshot.metrics['job-duration-ms'] >= 100); assert.equal(snapshot.metrics['poller-missing'], 1);
      assert.equal(snapshot.quota.launched, 1); assert.equal(snapshot.quota.rateLimited, 1); assert.equal(snapshot.quota.remaining, 0);
      assert.equal(snapshot.quota.reserved, 145_000); assert.equal(snapshot.quota.essentialUsed, 1);
      const launchTypes = await p.a.query((tx) => tx.$queryRaw`SELECT
        JSON_TYPE(JSON_EXTRACT(payloadJson, '$.launchedAt')) AS kind,
        JSON_EXTRACT(payloadJson, '$.launchedAt') AS launched,
        dispatchedAt FROM ApiQuotaAttempt WHERE accountId = ${accountId}`);
      assert.equal(snapshot.quota.rollingSecondLaunches, 1, JSON.stringify({ at: snapshot.at, launchTypes }));
      assert.equal(snapshot.quota.rollingMinuteLaunches, 1);
      assert.equal(snapshot.quota.essentialReserveUsed, 20_000);
      assert.ok(snapshot.correlations.some((c) => c.modelVersionId && c.runId && c.fixtureId && c.cycleId && c.jobId && c.eatDate));
      assert.ok(snapshot.reasons.some((r) => r.kind === 'job' && r.reason === 'handler-failed'));
      assert.deepEqual(await canonical(), before);
      const text = JSON.stringify(snapshot);
      for (const forbidden of ['ownerToken','ownerId','envelopeJson','payloadJson','apiKey','headers','snapshotJson']) assert.ok(!text.includes(forbidden));
    });

    const sink = createLocalMonitoringSink(policy.destination, policy.retentionMs, 64, p.now);
    let a = createOperationsMonitor({ policy, authority, sink, store: createMysqlMonitoringStore(p.a) });
    const b = createOperationsMonitor({ policy, authority, sink, store: createMysqlMonitoringStore(p.b) });
    await t.test('replicas serialize alert updates and claim each notification once; restart retains deduplication', async () => {
      const snapshot = await inspector.inspect();
      await Promise.all([a.observe(snapshot), b.observe(snapshot)]);
      for (let i = 0; i < 3; i++) await Promise.all([a.deliver(), b.deliver()]);
      const messages = sink.read(), count = messages.length;
      assert.ok(messages.some((m) => m.rule === 'failed-jobs'));
      assert.ok(messages.some((m) => m.rule === 'subscription-expiry'));
      assert.equal(count, new Set(messages.map((m) => m.id)).size);
      a = createOperationsMonitor({ policy, authority, sink, store: createMysqlMonitoringStore(p.a) });
      assert.equal((await a.observe(snapshot)).changed, 0); await a.deliver(); assert.equal(sink.read().length, count);
      const stored = await p.a.query((tx) => tx.operationsMonitorState.findUniqueOrThrow({ where: { id: 1 } }));
      assert.ok(stored.stateJson.slots.length <= 64); assert.ok(Buffer.byteLength(JSON.stringify(stored.stateJson)) < 131_072);
    });

    await t.test('cutoff/staleness/stalled-job findings derive from canonical clocks and preserve live ownership', async () => {
      p.setTime(p.now() + 180_000);
      const before = await canonical(), snapshot = await inspector.inspect();
      assert.equal(snapshot.metrics.available, 1); assert.ok(snapshot.metrics['missing-locks'] > 0);
      assert.ok(snapshot.metrics['cutoff-misses'] > 0); assert.ok(snapshot.metrics['stale-data'] > 0);
      assert.ok(snapshot.metrics['stalled-jobs'] > 0); assert.deepEqual(await canonical(), before);
    });

    await t.test('policy replacement and revoked access refuse before altering durable state', async () => {
      const before = await p.a.query((tx) => tx.operationsMonitorState.findUniqueOrThrow({ where: { id: 1 } }));
      const changed = createOperationsMonitor({ policy: { ...policy, owner: 'different-owner' }, authority, sink, store: createMysqlMonitoringStore(p.a) });
      await assert.rejects(changed.observe(await inspector.inspect()), (e) => e instanceof MonitoringError && e.reason === 'policy-conflict');
      const denied = createOperationsMonitor({ policy, authority: monitoringAuthority({ authorize: () => false }), sink, store: createMysqlMonitoringStore(p.a) });
      await assert.rejects(denied.deliver(), MonitoringError);
      assert.deepEqual(await p.a.query((tx) => tx.operationsMonitorState.findUniqueOrThrow({ where: { id: 1 } })), before);
    });

    await t.test('reliable final-badge delay clears only after canonical settlement, with no fabricated final result', async () => {
      p.setTime(published.cycle.kickoffAt + 60_000);
      const clock = { now: p.now }, source = resultProvider(clock, { accountId,
        rows: [catalogFixture(3000, { kickoff: new Date(published.cycle.kickoffAt).toISOString(), status: 'FT', score: { fulltime: { home: 2, away: 1 }, extratime: null, penalty: null } })] });
      const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
      const store = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
      const poller = createResultSyncService({ accountId, policy: resultPolicy(), authority: resultAuthority(), store, adapter: source.adapter.evidence, clock });
      try { await poller.runOnce(); } finally { await poller.stop(); }
      assert.ok((await store.result(published.fixture.id)).result);
      assert.ok((await p.history.findCycle(published.cycle.id)).lockedSetId);
      p.setTime(p.now() + policy.thresholds.resultDelayMs + 1);
      const delayed = await inspector.inspect(); assert.equal(delayed.metrics.available, 1); assert.equal(delayed.metrics['final-badge-delays'], 1);
      await createMarketSettlementService({ database: p.a, queue: p.queue }).settleFixture(published.fixture.id);
      const settled = await inspector.inspect(); assert.equal(settled.metrics.available, 1); assert.equal(settled.metrics['final-badge-delays'], 0);
    });

    await t.test('retention prunes private alert state without deleting canonical receipts or allowing new singleton rows', async () => {
      const before = await canonical(); p.setTime(p.now() + policy.retentionMs + 1); await a.deliver();
      const row = await p.a.query((tx) => tx.operationsMonitorState.findUniqueOrThrow({ where: { id: 1 } }));
      assert.equal(row.stateJson.slots.length, 0); assert.deepEqual(await canonical(), before);
      await assert.rejects(p.a.query((tx) => tx.operationsMonitorState.delete({ where: { id: 1 } })));
      await assert.rejects(p.a.query((tx) => tx.operationsMonitorState.create({ data: { id: 2, stateJson: {} } })));
    });

    await t.test('single-connection collection avoids nested pool acquisition', async () => {
      const database = createDatabase(parseRuntimePolicy({ ...p.env, GOAL_HINT_DATABASE_POOL_LIMIT: '1' }));
      try {
        const snapshot = await createMonitoringInspector({ database, policy, authority }).inspect();
        assert.equal(snapshot.metrics.available, 1);
        assert.deepEqual(snapshot.costs, []); // Actual billing integrations are pending, never zeroed.
      } finally { await database.disconnect(); }
    });
  });
});

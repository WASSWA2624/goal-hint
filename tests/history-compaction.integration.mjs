import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { inspectHistoryCompaction } from '../src/server/database/history-compaction.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { lifecycleAuthority, lifecyclePolicy, lifecycleInput } from './helpers/lifecycle-fixtures.mjs';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const period = 'regulation-including-stoppage-time';
const probabilities = {
  'match-result': { period, probabilities: { 'home-win': 0.3, draw: 0.5, 'away-win': 0.2 } },
  'total-goals': { period, line: 2.5, probabilities: { 'over-2.5': 0.4, 'under-2.5': 0.6 } },
  'both-teams-to-score': { period, probabilities: { yes: 0.4, no: 0.6 } },
};
const core = ['FootballFixture', 'FixtureResultState', 'FixtureLifecycleState', 'FixtureResult', 'ResultSyncBatch', 'ResultProviderObservation',
  'FixtureLifecycleObservation', 'PredictionChangeEvent', 'SettlementEventReceipt', 'MarketSettlementRevision', 'PredictionCycle', 'MarketSettlement'];

test('read-only history compaction census on genuine isolated MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const accountId = resultHash('compaction-synthetic-account');
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const results = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    // The census runs as an account that can only read.
    const password = randomBytes(24).toString('hex');
    await p.instance.executeAdmin(`CREATE USER 'compaction_reader'@'127.0.0.1' IDENTIFIED BY '${password}';
      GRANT SELECT ON goal_hint_test.* TO 'compaction_reader'@'127.0.0.1';`);
    const reader = createDatabase(parseRuntimePolicy({ NODE_ENV: 'test', GOAL_HINT_OPERATION_SCOPE: 'disabled', GOAL_HINT_DATABASE_ENABLED: 'true',
      TEST_DATABASE_URL: `mysql://compaction_reader:${password}@127.0.0.1:${p.instance.port}/goal_hint_test`,
      GOAL_HINT_DATABASE_CONNECTION_MODE: 'direct', GOAL_HINT_DATABASE_TLS_MODE: 'disabled', GOAL_HINT_DATABASE_POOL_LIMIT: '1',
      GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: '1000', GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: '5000' }));
    try {
      const census = (options) => inspectHistoryCompaction(reader, options);
      const reason = (report, table, name) => report.tables.find((entry) => entry.table === table).reasons.find((entry) => entry.reason === name).rows;
      const candidates = (report) => report.tables.map((entry) => entry.candidateRows);
      let sequence = 0;
      async function leased(operation) {
        const lease = await results.acquire(resultHash(`compaction-poller:${++sequence}`), 30_000); assert.ok(lease);
        try { return await operation(lease); } finally { await results.release(lease); }
      }
      const batch = (overrides) => ({ id: resultHash(`compaction-batch:${++sequence}`), accountId, policyHash: resultHash('synthetic-compaction-policy'),
        receivedAt: p.now(), channel: 'ids', date: null, requestedIds: [], observations: [], error: null, requestsDispatched: 1, ...overrides });
      async function locked(id) {
        p.setTime(PUBLICATION_NOW); const state = await p.setup(id);
        state.input.candidate = historyCandidate({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId, source: 'ai', probabilities });
        assert.equal((await p.publisher.publish(state.input, state.lease)).refresh.outcome, 'published');
        p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state));
        return state;
      }
      // catalogFixture fixes elapsed at 90 for every started status, so in-play ticks set their own minute to change content.
      async function observe(state, status, { home = null, away = null, elapsed } = {}) {
        p.setTime(Math.max(p.now() + 1000, state.cycle.kickoffAt + 7_200_000));
        const input = lifecycleInput(state, p.now(), { status, raw: status === 'FT'
          ? { goals: { home, away }, score: { fulltime: { home, away }, extratime: null, penalty: null } } : { goals: { home: 0, away: 0 } } });
        if (elapsed !== undefined) input.fixture = { ...input.fixture, elapsedMinutes: elapsed };
        const value = batch({ requestedIds: [Number(state.fixture.externalId)], observations: [parseLifecycleInput(input)] });
        await leased(async (lease) => { await results.save(lease, value); await results.apply(lease, value); });
      }

      const main = await locked(3000), other = await locked(3001);
      // Direct lifecycle receipts have no result-sync source; result state makes the census inspect that fixture.
      for (let index = 0; index < 2; index++) {
        p.setTime(Math.max(p.now() + 1000, other.cycle.cutoffAt + 1000)); await lifecycle.observe(lifecycleInput(other, p.now()));
      }
      await leased((lease) => results.attempts(lease, [{ fixtureId: other.fixture.id, nextAt: null, failures: 0, error: 'polling-horizon-exhausted' }]));
      for (const elapsed of [10, 20, 30]) await observe(main, '1H', { elapsed });
      await observe(main, 'FT', { home: 1, away: 0 });
      for (let index = 0; index < 3; index++) await observe(main, 'FT', { home: 1, away: 0 });

      await t.test('retained before settlement and while the fixture is still tracked', async () => {
        let report = await census();
        assert.deepEqual(candidates(report), [0, 0, 0]);
        assert.equal(report.engine, 'mysql'); assert.equal(report.mode, 'dry-run'); assert.deepEqual(report.deletion, { implemented: false });
        assert.deepEqual(report.blockers, { pendingBatches: 0, referenceCoverage: 'complete' });
        assert.equal(report.scope.fixturesInspected, 2); assert.equal(report.scope.batchesInspected, 7); assert.equal(report.scope.coverage, 'complete');
        assert.equal(reason(report, 'ResultProviderObservation', 'result-source'), 4);
        assert.equal(reason(report, 'ResultProviderObservation', 'settlement-pending'), 3);
        assert.equal(reason(report, 'FixtureLifecycleObservation', 'referenced-by-retained-observation'), 3);
        assert.equal(reason(report, 'FixtureLifecycleObservation', 'no-result-sync-source'), 1);
        assert.equal(reason(report, 'FixtureLifecycleObservation', 'non-confirmation-outcome'), 1);
        assert.equal(reason(report, 'ResultSyncBatch', 'retained-batch-member'), 7);
        assert.equal((await settlement.settleFixture(main.fixture.id)).changed, 4);
        report = await census();
        assert.deepEqual(candidates(report), [0, 0, 0]);
        assert.equal(reason(report, 'ResultProviderObservation', 'fixture-still-tracked'), 3, 'nextCheckAt is the epoch, not exhausted');
        assert.equal(reason(report, 'ResultProviderObservation', 'settlement-pending'), 0);
      });

      await t.test('horizon exhaustion leaves only the middle confirmations as candidates, through a SELECT-only account', async () => {
        await leased((lease) => results.attempts(lease, [{ fixtureId: main.fixture.id, nextAt: null, failures: 0, error: 'polling-horizon-exhausted' }]));
        const tables = core.join(', ');
        const snapshot = async () => (await p.instance.executeAdmin(`CHECKSUM TABLE ${tables};
          SELECT ${core.map((name) => `(SELECT COUNT(*) FROM ${name})`).join(', ')};`)).stdout;
        const limit = () => reader.query(async (tx) => (await tx.$queryRaw`SELECT @@SESSION.max_execution_time AS value`)[0].value);
        const before = await snapshot(), sessionBefore = await limit();
        assert.equal(before.trim().split('\n').length, core.length + 1, 'one checksum row per core table and one count row');
        const report = await census();
        assert.equal(await snapshot(), before); assert.equal(await limit(), sessionBefore);
        assert.deepEqual(candidates(report), [2, 2, 2]);
        assert.ok(report.tables.every((entry) => entry.candidateJsonBytes > 0 && entry.candidateJsonBytes < entry.inspectedJsonBytes));
        assert.equal(reason(report, 'ResultProviderObservation', 'latest-confirmation'), 1);
        assert.equal(reason(report, 'ResultProviderObservation', 'result-source'), 4);
        assert.equal(reason(report, 'FixtureLifecycleObservation', 'change-event'), 4);
        // The latest confirmation's observation is retained, so its receipt is retained with it.
        assert.equal(reason(report, 'FixtureLifecycleObservation', 'referenced-by-retained-observation'), 1);
        assert.equal(report.tables[1].inspectedRows, 9);
        assert.equal(reason(report, 'FixtureLifecycleObservation', 'no-result-sync-source'), 1);
        assert.equal(reason(report, 'ResultSyncBatch', 'retained-batch-member'), 5);
        assert.equal(report.retainedChains.fixtureResult.inspectedRows, 4); assert.equal(report.retainedChains.fixtureResult.liveRows, 3);
        assert.equal(report.retainedChains.lifecycleInPlay.rows, 3);
        const text = JSON.stringify(report);
        for (const fragment of ['evidenceRef', 'synthetic-provider-observation', 'synthetic-schedule-observer', 'regulation', accountId])
          assert.ok(!text.includes(fragment), fragment);
        // The keyset cursor resumes after the last inspected fixture.
        const first = await census({ maxFixtures: 1 }), lower = [main.fixture.id, other.fixture.id].sort()[0];
        assert.deepEqual([first.scope.coverage, first.scope.fixturesInspected, first.scope.resumeAfterFixture], ['partial', 1, lower]);
        const rest = await census({ afterFixture: lower });
        assert.deepEqual([rest.scope.fixturesInspected, rest.scope.coverage, rest.scope.resumeAfterFixture], [1, 'complete', null]);
      });

      await t.test('legacy empty, requested-id and error batches are classified', async () => {
        await leased(async (lease) => {
          for (const value of [batch({ channel: 'date', date: '2026-10-09' }), batch({ requestedIds: [Number(main.fixture.externalId)] }),
            batch({ channel: 'date', date: '2026-10-09', error: 'provider-unavailable' })]) {
            await results.save(lease, value); await results.apply(lease, value);
          }
        });
        const report = await census();
        assert.equal(reason(report, 'ResultSyncBatch', 'transient-candidate'), 3);
        assert.equal(reason(report, 'ResultSyncBatch', 'requested-ids-without-observation'), 1);
        assert.equal(reason(report, 'ResultSyncBatch', 'error-receipt'), 1);
        assert.equal(report.scope.batchesInspected, 10);
      });

      await t.test('a saved but unapplied batch withholds every candidate until it is applied', async () => {
        const pending = batch({ channel: 'live' });
        await leased((lease) => results.save(lease, pending));
        let report = await census();
        assert.equal(report.blockers.pendingBatches, 1); assert.deepEqual(candidates(report), [0, 0, 0]);
        assert.equal(reason(report, 'ResultSyncBatch', 'pending-batch'), 1);
        assert.deepEqual(report.tables.map((entry) => reason(report, entry.table, 'pending-recovery-global')), [2, 2, 3]);
        await leased((lease) => results.apply(lease, pending));
        report = await census();
        assert.equal(report.blockers.pendingBatches, 0); assert.deepEqual(candidates(report), [2, 2, 4]);
      });
    } finally { await reader.disconnect().catch(() => {}); }
  });
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { createMarketSettlementService, createMarketSettlementJob } from '../src/server/settlement/settlement-service.ts';
import { SETTLEMENT_JOB_TYPE } from '../src/server/settlement/settlement-contract.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { lifecycleAuthority, lifecyclePolicy, lifecycleInput } from './helpers/lifecycle-fixtures.mjs';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const execute = promisify(execFile), period = 'regulation-including-stoppage-time';
const probabilities = {
  'match-result': { period, probabilities: { 'home-win': 0.3, draw: 0.5, 'away-win': 0.2 } },
  'total-goals': { period, line: 2.5, probabilities: { 'over-2.5': 0.4, 'under-2.5': 0.6 } },
  'both-teams-to-score': { period, probabilities: { yes: 0.4, no: 0.6 } },
};

test('audited settlement on genuine isolated MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
    const other = createMarketSettlementService({ database: p.b, queue: p.otherQueue });
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const accountId = resultHash('settlement-synthetic-account');
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const results = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    let sequence = 0;
    async function locked(id, { publish = true, source = 'ai', partial = false } = {}) {
      p.setTime(PUBLICATION_NOW); const state = await p.setup(id);
      state.input.candidate = historyCandidate({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId, source, partial, probabilities });
      if (publish) { const receipt = await p.publisher.publish(state.input, state.lease); assert.equal(receipt.refresh.outcome, 'published'); }
      p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state));
      state.lock = (await p.history.findCycle(state.cycle.id)).lockedSetId;
      state.before = state.lock ? await p.history.findRevision(state.lock) : null;
      return state;
    }
    async function observe(state, status, home = null, away = null, options = {}) {
      p.setTime(Math.max(p.now() + 1000, state.cycle.kickoffAt + 7_200_000));
      const input = lifecycleInput(state, p.now(), { status, raw: {
        goals: status === 'FT' ? { home, away } : { home: 8, away: 7 },
        score: { fulltime: { home, away }, extratime: { home: 8, away: 7 }, penalty: { home: 5, away: 4 } },
      }, ...options });
      if (options.unverified) input.fixture = { ...input.fixture, regulationScore: input.fixture.regulationScore && { ...input.fixture.regulationScore, verified: false } };
      const observation = parseLifecycleInput(input), id = resultHash(`settlement-result:${++sequence}`);
      const lease = await results.acquire(resultHash(`settlement-poller:${sequence}`), 30_000);
      assert.ok(lease);
      const batch = { id, accountId, policyHash: resultHash('synthetic-settlement-policy'), receivedAt: p.now(), channel: 'ids', date: null,
        requestedIds: [Number(state.fixture.externalId)], observations: [observation], error: null, requestsDispatched: 1 };
      try { await results.save(lease, batch); await results.apply(lease, batch); } finally { await results.release(lease); }
    }
    async function current(state) {
      const view = await settlement.forFixture(state.fixture.id), cycle = view.cycles.find((entry) => entry.cycle.id === state.cycle.id);
      return { view, cycle, markets: Object.fromEntries(cycle.markets.map((entry) => [entry.family, entry])) };
    }
    async function counts(state) {
      return p.a.query(async (tx) => ({ active: await tx.marketSettlement.count({ where: { fixtureId: state.fixture.id } }),
        revisions: await tx.marketSettlementRevision.count({ where: { fixtureId: state.fixture.id } }),
        batches: await tx.settlementBatch.count({ where: { fixtureId: state.fixture.id } }),
        receipts: await tx.settlementEventReceipt.count({ where: { fixtureId: state.fixture.id } }),
        events: await tx.predictionChangeEvent.count({ where: { fixtureId: state.fixture.id, kind: 'market-settlement' } }),
        version: (await tx.footballFixture.findUniqueOrThrow({ where: { id: state.fixture.id } })).dataVersion }));
    }
    await t.test('fresh migration, foreign keys, binary identities and append-only permissions', async () => {
      await execute(process.execPath, ['--conditions=react-server', 'scripts/database.mjs', 'verify'], { env: p.env, windowsHide: true, timeout: 60_000 });
      const tables = await p.a.query((tx) => tx.$queryRaw`SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME IN ('SettlementBatch','MarketSettlement','MarketSettlementRevision','SettlementEventReceipt')`);
      assert.equal(tables.length, 4); assert.ok(tables.every((row) => row.ENGINE === 'InnoDB' && row.TABLE_COLLATION === 'utf8mb4_bin'));
      for (const table of ['SettlementBatch', 'MarketSettlementRevision', 'SettlementEventReceipt']) {
        await assert.rejects(p.a.query((tx) => tx.$executeRawUnsafe(`UPDATE ${table} SET at=UTC_TIMESTAMP(3)`)));
        await assert.rejects(p.a.query((tx) => tx.$executeRawUnsafe(`DELETE FROM ${table}`)));
      }
      await assert.rejects(p.a.query((tx) => tx.predictionChangeEvent.create({ data: { fixtureId: '00000000-0000-4000-8000-000000000001', version: 1n, kind: 'market-settlement', at: new Date(p.now()) } })));
    });
    await t.test('four independent locked picks: draws, 0–0, BTTS and two/three-goal boundaries', async () => {
      const cases = [[0,0,['correct','correct','correct','correct']], [1,1,['correct','correct','correct','incorrect']],
        [2,0,['incorrect','correct','correct','correct']], [2,1,['incorrect','correct','incorrect','incorrect']], [0,2,['incorrect','incorrect','correct','correct']]];
      for (let index = 0; index < cases.length; index++) {
        const [home, away, expected] = cases[index], state = await locked(3000 + index);
        await observe(state, 'FT', home, away);
        const before = await counts(state); assert.equal((await settlement.settleFixture(state.fixture.id)).changed, 4);
        const view = await current(state), after = await counts(state);
        assert.deepEqual(view.cycle.markets.map((entry) => entry.settlement.status), expected);
        assert.ok(view.cycle.markets.every((entry) => entry.eligibleForCounting && entry.settlement.lockedSetId === state.lock));
        assert.equal(after.version, before.version + 1n); assert.equal(after.events, 1); assert.equal(after.active, 4);
        assert.deepEqual(await p.history.findRevision(state.lock), state.before);
      }
    });
    await t.test('live reported totals never settle and the verified final transitions to settled', async () => {
      const state = await locked(3005); await observe(state, 'LIVE', 2, 1); await settlement.settleFixture(state.fixture.id);
      let view = await current(state); assert.ok(view.cycle.markets.every((entry) => entry.settlement.status === 'pending' && !entry.eligibleForCounting));
      await observe(state, 'FT', 2, 1);
      view = await current(state); assert.ok(view.cycle.markets.every((entry) => !entry.isCurrent && !entry.eligibleForCounting));
      await settlement.settleFixture(state.fixture.id); view = await current(state);
      assert.ok(view.cycle.markets.every((entry) => entry.eligibleForCounting));
    });
    await t.test('extra time and penalties require separately verified regulation, never aggregate goals', async () => {
      for (const [id, status, verified] of [[3006,'AET',true],[3007,'AET',false],[3008,'PEN',true],[3009,'PEN',false]]) {
        const state = await locked(id); await observe(state, status, 0, 0, { unverified: !verified }); await settlement.settleFixture(state.fixture.id);
        const view = await current(state);
        assert.ok(view.cycle.markets.every((entry) => entry.settlement.status === (verified ? 'correct' : 'pending')));
        if (!verified) assert.ok(view.cycle.markets.every((entry) => entry.settlement.reason === 'missing-regulation-score'));
      }
    });
    await t.test('provider families stay independently unavailable and a closed empty cycle has no prediction', async () => {
      const partial = await locked(3010, { source: 'api-football', partial: true }); await observe(partial, 'FT', 1, 0);
      await settlement.settleFixture(partial.fixture.id);
      const view = await current(partial);
      assert.equal(view.markets['match-result'].settlement.source, 'api-football');
      assert.equal(view.markets['match-result'].settlement.status, 'correct');
      for (const family of ['total-goals','both-teams-to-score']) {
        assert.equal(view.markets[family].settlement.status, 'unavailable'); assert.equal(view.markets[family].settlement.selection, null);
        assert.equal(view.markets[family].eligibleForCounting, false);
      }
      const empty = await locked(3011, { publish: false }); await observe(empty, 'FT', 2, 1); await settlement.settleFixture(empty.fixture.id);
      assert.ok((await current(empty)).cycle.markets.every((entry) => entry.settlement.status === 'unavailable' && entry.settlement.lockedSetId === null && entry.settlement.reason === 'no-locked-selection'));
    });
    let postponed;
    await t.test('canceled, abandoned, awarded and postponed locks are void with retained reasons', async () => {
      for (const [id,status,reason] of [[3012,'CANC','fixture-canceled'],[3013,'ABD','fixture-abandoned'],[3014,'AWD','fixture-awarded'],[3015,'PST','formal-postponement']]) {
        const state = await locked(id); await observe(state, status); await settlement.settleFixture(state.fixture.id);
        const view = await current(state);
        assert.ok(view.cycle.markets.every((entry) => entry.settlement.status === 'void' && entry.settlement.voidReason === reason && !entry.eligibleForCounting));
        assert.equal(view.cycle.cycle.lockedSetId, state.lock);
        if (status === 'PST') postponed = state;
      }
    });
    await t.test('early-start cutoff invalidation keeps the exact locked pick and marks it void', async () => {
      const state = await locked(3016); await observe(state, 'LIVE', null, null, { actualStartedAt: PUBLICATION_NOW - 1 });
      await settlement.settleFixture(state.fixture.id);
      assert.ok((await current(state)).cycle.markets.every((entry) => entry.settlement.status === 'void' && entry.settlement.reason === 'cutoff-invalidated'));
      assert.deepEqual(await p.history.findRevision(state.lock), state.before);
    });
    await t.test('provider corrections append prior badge, reason, verified result and visible time against the same pick', async () => {
      const state = await locked(3017); await observe(state, 'FT', 0, 0); await settlement.settleFixture(state.fixture.id);
      const before = await counts(state); await observe(state, 'FT', 2, 1); const correctedAt = p.now();
      assert.ok((await current(state)).cycle.markets.every((entry) => !entry.eligibleForCounting));
      await settlement.settleFixture(state.fixture.id);
      for (const family of ['match-result','double-chance','total-goals','both-teams-to-score']) {
        const audit = await settlement.audit(state.cycle.id, family);
        assert.equal(audit.length, 2); assert.equal(audit[1].kind, 'correction'); assert.equal(audit[1].correctedAt, correctedAt);
        assert.equal(audit[0].status, 'correct'); assert.equal(audit[0].reason, 'selection-occurred');
        assert.deepEqual(audit.map((entry) => [entry.result.regulation.home, entry.result.regulation.away]), [[0,0],[2,1]]);
        assert.equal(audit[0].selection, audit[1].selection); assert.equal(audit[1].lockedSetId, state.lock);
      }
      const after = await counts(state); assert.equal(after.active, 4); assert.equal(after.revisions, before.revisions + 4);
      assert.deepEqual(await p.history.findRevision(state.lock), state.before);
      await observe(state, 'FT', 2, 1); await settlement.settleFixture(state.fixture.id); assert.deepEqual(await counts(state), after);
      await observe(state, 'FT', 3, 1); await settlement.settleFixture(state.fixture.id);
      const sameBadge = await settlement.audit(state.cycle.id, 'match-result'); assert.equal(sameBadge.length, 3);
      assert.equal(sameBadge[2].status, 'incorrect'); assert.equal(sameBadge[2].kind, 'correction');
    });
    await t.test('replicas and duplicate delivery produce one batch, four pointers and no duplicate audit', async () => {
      const state = await locked(3018); await observe(state, 'FT', 0, 0);
      const receipts = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? other : settlement).settleFixture(state.fixture.id)));
      assert.equal(receipts.filter((receipt) => receipt.changed > 0).length, 1);
      const before = await counts(state); await other.settleFixture(state.fixture.id); assert.deepEqual(await counts(state), before);
      assert.equal(before.active, 4); assert.equal(before.revisions, 4); assert.equal(before.batches, 1);
    });
    await t.test('failure before commit rolls back outcomes, version, event and receipts; discovery recovers', async () => {
      const state = await locked(3019); await observe(state, 'FT', 0, 0); const before = await counts(state);
      const database = { query: p.a.query, transaction: (operation, options) => p.a.transaction(async (tx) => { await operation(tx); throw new Error('synthetic process loss before commit'); }, options) };
      const interrupted = createMarketSettlementService({ database, queue: p.queue });
      await assert.rejects(interrupted.settleFixture(state.fixture.id)); assert.deepEqual(await counts(state), before);
      assert.ok((await other.pending()).includes(state.fixture.id)); await other.settleFixture(state.fixture.id);
      assert.equal((await counts(state)).active, 4); assert.ok(!(await other.pending()).includes(state.fixture.id));
    });
    await t.test('lost commit acknowledgement recovers idempotently without multiplying corrections', async () => {
      const state = await locked(3020); await observe(state, 'FT', 0, 0);
      let armed = true; const database = p.replica(() => p.now(), () => { if (armed) { armed = false; throw new Error('synthetic lost commit response'); } });
      const ambiguous = createMarketSettlementService({ database, queue: p.queue });
      await assert.rejects(ambiguous.settleFixture(state.fixture.id)); const before = await counts(state);
      assert.equal(before.revisions, 4); assert.equal((await other.settleFixture(state.fixture.id)).changed, 0);
      assert.deepEqual(await counts(state), before);
    });
    await t.test('private durable handler verifies ownership and fences expired attempts', async () => {
      const state = await locked(3021); await observe(state, 'FT', 0, 0);
      const job = await p.queue.enqueue({ version: 1, type: SETTLEMENT_JOB_TYPE, handlerVersion: 1, idempotencyKey: resultHash('settlement-job'), payload: { fixtureId: state.fixture.id },
        refresh: null, notBefore: p.now(), expiresAt: p.now() + 60_000, priority: 10, maxAttempts: 3, timeoutMs: 10_000, leaseMs: 1000,
        fallbackReserveMs: 0, backoff: { baseMs: 100, maxMs: 1000 } });
      const lease = await p.queue.claim(resultHash('settlement-owner'), [{ type: SETTLEMENT_JOB_TYPE, handlerVersion: 1 }]);
      assert.equal(lease.jobId, job.id); p.setTime(p.now() + 1000);
      const handler = createMarketSettlementJob(settlement), context = { lease, signal: new AbortController().signal };
      assert.equal((await handler.handle({ fixtureId: state.fixture.id }, context)).status, 'failed'); assert.equal((await counts(state)).revisions, 0);
      p.setTime(p.now() + 1000);
      await p.queue.claim(resultHash('reap-expired-settlement'), [{ type: SETTLEMENT_JOB_TYPE, handlerVersion: 1 }]);
      p.setTime(p.now() + 1000);
      const replacement = await p.otherQueue.claim(resultHash('replacement-settlement'), [{ type: SETTLEMENT_JOB_TYPE, handlerVersion: 1 }]);
      assert.ok(replacement); assert.equal((await handler.handle({ fixtureId: state.fixture.id }, { ...context, lease: replacement })).status, 'succeeded');
      await p.otherQueue.acknowledge(replacement); assert.equal((await counts(state)).revisions, 4);
      await settlement.settleFixture(state.fixture.id); assert.equal((await counts(state)).revisions, 4);
      await assert.rejects(settlement.settleFixture(state.fixture.id, { ...lease, job: { ...lease.job, envelope: { ...lease.job.envelope, payload: { fixtureId: postponed.fixture.id } } } }));
    });
    await t.test('new applicable cycle excludes old postponed history and never multiplies it on later results', async () => {
      const state = postponed, before = await settlement.audit(state.cycle.id, 'match-result');
      await observe(state, 'NS', null, null, { kickoffAt: p.now() + 86_400_000 });
      const newCycle = await p.history.withFixtureTransaction(state.fixture.id, (writer) => writer.createCycle({ fixtureId: state.fixture.id,
        creationKey: resultHash('synthetic-next-eligible-cycle'), kickoffAt: p.now() + 86_400_000, openedAt: p.now(), activate: true,
        actor: 'synthetic-selection-contract', reason: 'Next eligible daily selection', evidenceRef: 'synthetic-cycle-handoff-proof' }));
      assert.ok((await settlement.pending()).includes(state.fixture.id)); await settlement.settleFixture(state.fixture.id);
      const view = await settlement.forFixture(state.fixture.id);
      assert.equal(view.applicableCycleId, newCycle.id); assert.equal(view.cycles.filter((entry) => entry.applicable).length, 1);
      assert.ok(view.cycles.flatMap((entry) => entry.markets).every((entry) => !entry.eligibleForCounting));
      await observe(state, 'FT', 2, 1); await settlement.settleFixture(state.fixture.id);
      assert.deepEqual(await settlement.audit(state.cycle.id, 'match-result'), before);
      assert.equal((await counts(state)).active, 8);
    });
    await t.test('corrupt sealed results and crossed settlement pointers fail without partial changes', async () => {
      const state = await locked(3022); await observe(state, 'FT', 0, 0);
      const result = await results.result(state.fixture.id), before = await counts(state);
      const [{ integrity }] = await p.a.query((tx) => tx.fixtureResult.findMany({ where: { id: result.result.id }, select: { integrity: true } }));
      await p.instance.executeAdmin(`UPDATE FixtureResult SET integrity=REPEAT('a',64) WHERE id='${result.result.id}'`);
      await assert.rejects(settlement.settleFixture(state.fixture.id)); assert.deepEqual(await counts(state), before);
      await p.instance.executeAdmin(`UPDATE FixtureResult SET integrity='${integrity}' WHERE id='${result.result.id}'`);
      await settlement.settleFixture(state.fixture.id);
      const view = await current(state), match = view.markets['match-result'].settlement;
      await assert.rejects(p.a.query((tx) => tx.marketSettlement.update({ where: { cycleId_family: { cycleId: state.cycle.id, family: 'total-goals' } }, data: { revisionId: match.id } })));
    });
    await t.test('new lifecycle scores await a matching verified result and preserve the prior correction evidence', async () => {
      const state = await locked(3023); await observe(state, 'FT', 0, 0); await settlement.settleFixture(state.fixture.id);
      p.setTime(p.now() + 1000);
      await lifecycle.observe(lifecycleInput(state, p.now(), { status: 'FT', raw: { goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } } } }));
      assert.ok((await current(state)).cycle.markets.every((entry) => !entry.isCurrent && !entry.eligibleForCounting));
      await settlement.settleFixture(state.fixture.id);
      assert.ok((await current(state)).cycle.markets.every((entry) => entry.settlement.status === 'pending' && !entry.eligibleForCounting));
      await observe(state, 'FT', 2, 1); await settlement.settleFixture(state.fixture.id);
      assert.ok((await current(state)).cycle.markets.every((entry) => entry.eligibleForCounting));
      const audit = await settlement.audit(state.cycle.id, 'match-result');
      assert.deepEqual(audit.map((entry) => entry.status), ['correct','pending','incorrect']);
      assert.equal(audit[0].selection, audit[2].selection); assert.ok(audit[2].correctedAt !== null);
    });
    await t.test('bounded durable discovery recovers omitted deliveries and cycles without source events', async () => {
      const state = await locked(3024); await observe(state, 'FT', 0, 0);
      const pending = await settlement.pending(100); assert.ok(pending.includes(state.fixture.id));
      assert.equal((await settlement.pending(1)).length, 1);
      await assert.rejects(settlement.pending(1001));
      const receipts = await other.reconcile(100); assert.ok(receipts.some((entry) => entry.fixtureId === state.fixture.id && entry.changed === 4));
      assert.ok((await current(state)).cycle.markets.every((entry) => entry.eligibleForCounting));
      assert.deepEqual(await settlement.pending(), []); assert.deepEqual(await settlement.reconcile(), []);
      const open = await p.setup(3029); const view = await current(open);
      assert.ok(view.cycle.markets.every((entry) => entry.settlement.status === 'unavailable' && entry.settlement.reason === 'awaiting-locked-selection'));
    });
  });
});

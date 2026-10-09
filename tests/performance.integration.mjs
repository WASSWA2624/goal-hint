import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { performanceResponseSchema } from '../src/domain/performance.ts';
import { createPerformanceService } from '../src/server/performance/performance-service.ts';
import { createPerformanceHandler } from '../src/server/performance/performance-http.ts';
import { createMysqlEvidenceStore } from '../src/server/evidence/evidence-mysql-store.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { storedCycle } from '../src/server/predictions/history-read.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { resolveFallbackCandidate } from '../src/server/fallback/fallback-resolution.ts';
import { fallbackFixture, fallbackProvider } from './helpers/fallback-fixtures.mjs';
import { historyCandidate, cycleCreation, cycleChange, revisionInput } from './helpers/prediction-history-fixtures.mjs';
import { evidenceContext, evidenceSource, evidenceAuthority, evidencePolicy, evidenceHash } from './helpers/evidence-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';
import { lifecycleAuthority, lifecyclePolicy, lifecycleInput } from './helpers/lifecycle-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { PUBLICATION_NOW, emptyCandidate } from './helpers/publication-fixtures.mjs';
import { performanceProtocol } from './helpers/performance-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const cell = (report, family = 'match-result', source = 'combined') => report.cells.find((c) => c.family === family && c.source === source && c.horizon === null);
const period = 'from=2026-10-09&to=2026-10-12';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('stored performance acceptance on owned genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const states = new Map(); let readAt = PUBLICATION_NOW, binding = null;
    const reader = (options = {}) => createPerformanceService({ database: p.a, competitionIds: [39], clock: { now: () => readAt }, policy: binding, ...options });
    const read = (parameters = period, options = {}) => reader(options).query(new URLSearchParams(parameters));
    async function publish(id, options = {}) {
      p.setTime(PUBLICATION_NOW);
      const state = await p.setup(id);
      state.input.candidate = options.candidate?.(state) ?? historyCandidate({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId, ...options });
      if (options.delayed) state.input.candidate = emptyCandidate(state.input.candidate);
      const receipt = await p.publisher.publish(state.input, state.lease); assert.equal(receipt.refresh.outcome, options.delayed ? 'retained-previous' : 'published');
      state.revision = receipt.revision; states.set(id, state);
      await p.queue.acknowledge(state.lease); return state;
    }
    const previous = await p.setup(3002, '2026-10-08');
    previous.input.candidate = historyCandidate({ snapshot: previous.snapshot, model: modelVersion(), jobId: previous.lease.jobId, source: 'api-football' });
    assert.equal((await p.publisher.publish(previous.input, previous.lease)).refresh.outcome, 'published');
    await p.queue.acknowledge(previous.lease);
    await publish(3000); await publish(3001); await publish(3002, { source: 'api-football', delayed: true });
    await publish(3003, { candidate: (state) => {
      const f = fallbackFixture({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId, output: { groups: {
        'total-goals': { period: 'regulation-including-stoppage-time', line: 2.5, probabilities: { 'over-2.5': .6, 'under-2.5': .4 } },
        'both-teams-to-score': { period: 'regulation-including-stoppage-time', probabilities: { yes: .6, no: .4 } },
      } } });
      return resolveFallbackCandidate({ expected: f.expected, ai: f.ai, provider: fallbackProvider(f.expected), now: f.now }, f.authority).candidate;
    } });
    await publish(3004); const failed = await p.setup(3005); await p.queue.retry(failed.lease, 'handler-failed', false);
    const noLock = await publish(3006), postponed = await publish(3007), superseded = await publish(3010, { probabilities: {
      'match-result': { period: 'regulation-including-stoppage-time', probabilities: { 'home-win': .1, draw: .1, 'away-win': .8 } },
      'total-goals': { period: 'regulation-including-stoppage-time', line: 2.5, probabilities: { 'over-2.5': .6, 'under-2.5': .4 } },
      'both-teams-to-score': { period: 'regulation-including-stoppage-time', probabilities: { yes: .6, no: .4 } },
    } });
    const competitionId = await p.a.query(async (tx) => (await tx.footballSeason.findUniqueOrThrow({ where: { id: states.get(3000).fixture.seasonId } })).competitionId);
    const protocol = performanceProtocol({ competitionIds: [competitionId], providerContractVersion: 'synthetic-provider-v1', gate: { minimumCoverage: 0 } });
    binding = { protocol, verifyProtocol: () => true };
    const accountId = resultHash('performance-results');
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const store = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
    let resultNumber = 0;
    async function result(state, home, away, settle = true) {
      const number = ++resultNumber;
      p.setTime(Date.parse('2026-10-13T12:00:00Z') + number * 1000); readAt = p.now();
      const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status: 'FT', raw: { goals: { home, away }, score: { fulltime: { home, away } } } }));
      const lease = await store.acquire(resultHash(`performance-owner:${number}`), 30_000); assert.ok(lease);
      const batch = { id: resultHash(`performance-result:${number}`), accountId, policyHash: resultHash('performance-result-policy'), receivedAt: p.now(),
        channel: 'ids', date: null, requestedIds: [Number(state.fixture.externalId)], observations: [observation], error: null, requestsDispatched: 1 };
      try { await store.save(lease, batch); await store.apply(lease, batch); } finally { await store.release(lease); }
      if (settle) await settlement.settleFixture(state.fixture.id);
    }
    await t.test('open previews are unavailable; failed and delayed refreshes are separate measures', async () => {
      const data = await read(); assert.equal(data.cohort.fixtureCount, 30); assert.equal(cell(data).coverage.available, 0);
      assert.equal(cell(data).coverage.unavailable, 30); assert.equal(cell(data).metrics.hitRate, null);
      assert.equal(data.operations.failed, 1); assert.equal(data.operations.failedFixtures, 1);
      assert.equal(data.operations.delayedRefreshes, 1); assert.equal(data.operations.delayedFixtures, 1);
    });
    await t.test('applicable locks, historical postponed cycles and superseded revisions reconcile by hand', async () => {
      for (const id of [3000, 3001, 3002, 3003]) { const state = states.get(id); p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state)); }
      p.setTime(PUBLICATION_NOW + 1);
      await p.first.closeObservedPlay({ ...noLock.input.observation, status: 'live', retrievedAt: p.now(), actualStartedAt: PUBLICATION_NOW - 1 });
      await p.first.voidCycle({ ...p.target(states.get(3004)), actor: 'synthetic', reason: 'formal-postponement', evidenceRef: 'private-void-proof' });
      await p.first.voidCycle({ ...p.target(postponed), actor: 'synthetic', reason: 'formal-postponement', evidenceRef: 'private-old-void-proof' });
      await p.history.withFixtureTransaction(postponed.fixture.id, (writer) => writer.createCycle(cycleCreation(postponed.fixture, 'synthetic-performance-second-cycle')));
      p.setTime(Date.parse('2026-10-10T08:00:04Z'));
      const fixture = await p.catalog.fixtureByProviderId(3010), run = await p.history.createRun('2026-10-10', p.now() - 4000), cycle = await p.history.findCycle(superseded.cycle.id);
      const context = evidenceContext(fixture, { runId: run.id, cycleId: cycle.id, analysisAt: p.now() - 4000, cutoffAt: p.now() - 4000,
        home: { teamId: fixture.homeTeamId, externalId: fixture.homeExternalIds[0] }, away: { teamId: fixture.awayTeamId, externalId: fixture.awayExternalIds[0] } });
      const authority = evidenceAuthority(), snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: [evidenceSource(context)] }, authority);
      const evidenceId = evidenceHash(randomUUID()); await createMysqlEvidenceStore(p.a).save(evidenceId, evidenceHash(`request:${evidenceId}`), snapshot, authority);
      const candidate = historyCandidate({ snapshot, model: modelVersion(), jobId: evidenceHash(randomUUID()), probabilities: {
        'match-result': { period: 'regulation-including-stoppage-time', probabilities: { 'home-win': .4, draw: .3, 'away-win': .3 } },
        'total-goals': { period: 'regulation-including-stoppage-time', line: 2.5, probabilities: { 'over-2.5': .6, 'under-2.5': .4 } },
        'both-teams-to-score': { period: 'regulation-including-stoppage-time', probabilities: { yes: .6, no: .4 } },
      } });
      const latest = await p.history.withFixtureTransaction(fixture.id, async (writer, tx) => {
        const revision = await writer.appendRevision(revisionInput(candidate, evidenceId, cycle.scheduleVersion));
        const current = await storedCycle(tx, cycle.id);
        await writer.changeCycle({ ...cycleChange(current, { currentSetId: revision.id }, 'performance-latest'), at: p.now() }); return revision;
      });
      p.setTime(cycle.cutoffAt); await p.first.close(p.target(superseded));
      // This newer stored preview has no committed daily manifest: the cutoff
      // correctly locks the earlier eligible publication, despite currentSetId.
      const locked = await p.history.findCycle(cycle.id);
      assert.equal(locked.lockedSetId, superseded.revision.id); assert.equal(locked.currentSetId, latest.id);
      for (const [id, home, away] of [[3000, 2, 1], [3001, 0, 1], [3003, 2, 0], [3010, 2, 1]]) await result(states.get(id), home, away);
      const data = performanceResponseSchema.parse(await read());
      assert.deepEqual(cell(data).coverage, { total: 30, available: 5, unavailable: 24, void: 1, filteredOut: 0, pending: 1, settled: 4, sources: { ai: 3, 'api-football': 2 } });
      assert.equal(data.historicalCycles.void, 1); assert.equal(data.historicalCycles.postponed, 1);
      for (const family of ['total-goals', 'both-teams-to-score']) {
        assert.equal(cell(data, family).coverage.available, 4); assert.equal(cell(data, family).coverage.unavailable, 25); assert.equal(cell(data, family).coverage.settled, 4);
      }
      assert.equal(cell(data).metrics.hitRate, .5); assert.equal(cell(data).metrics.denominator, 4); assert.equal(cell(data).metrics.correct, 2);
      near(cell(data).metrics.brier, .78); near(cell(data).metrics.logLoss, (-Math.log(.4) - Math.log(.3) - Math.log(.5) - Math.log(.1)) / 4);
      near(cell(data, 'double-chance').metrics.brier, .26); assert.equal(cell(data, 'double-chance').metrics.denominator, 4);
      assert.equal(cell(data, 'double-chance').metrics.calibration.reduce((s, b) => s + b.count, 0), 12);
      const link = cell(data).evidence.links.find((l) => l.fixtureId === superseded.fixture.id);
      assert.equal(link.revisionId, superseded.revision.id); assert.notEqual(link.revisionId, latest.id);
      assert.equal(cell(data, 'match-result', 'api-football').metrics.state, 'insufficient-sample');
      assert.ok(data.comparisons.every((c) => c.count === 0 && c.state === 'unavailable'));
    });
    await t.test('source, model, version and EAT boundaries filter immutable selections', async () => {
      const ai = await read(`${period}&source=ai&market=match-result`); assert.equal(ai.cells.length, 6);
      assert.equal(cell(ai).coverage.available, 3); assert.equal(cell(ai).coverage.filteredOut, 2); assert.equal(cell(ai).metrics.denominator, 3);
      const model = await read(`${period}&model=${modelVersion().id}`); assert.equal(cell(model).coverage.available, 3);
      const providerVersion = states.get(3002).revision.candidate.markets['match-result'].provenance.source.contractVersion;
      assert.equal(cell(await read(`${period}&version=${providerVersion}`)).coverage.available, 2);
      assert.equal(cell(await read(`${period}&version=no-such-version`)).coverage.filteredOut, 5);
      assert.equal((await read('from=2026-10-09&to=2026-10-09')).cohort.fixtureCount, 4);
      assert.equal((await read('from=2026-10-10&to=2026-10-10')).cohort.fixtureCount, 1);
      const empty = await read('from=2026-09-01&to=2026-09-02'); assert.equal(empty.cohort.fixtureCount, 0); assert.equal(cell(empty).metrics.hitRate, null);
    });
    await t.test('absent, forged, asynchronous and revoked policies cannot expose numeric metrics or authorize claims', async () => {
      for (const policy of [null, { protocol, verifyProtocol: () => false }, { protocol, verifyProtocol: async () => true },
        { protocol: { ...protocol, confidenceZ: 2 }, verifyProtocol: () => true }]) {
        const data = await read(period, { policy }); assert.equal(data.policy.state, 'unapproved'); assert.equal(cell(data).metrics.hitRate, null);
        assert.equal(cell(data).metrics.denominator, 4); assert.deepEqual(cell(data).metrics.calibration, []);
      }
      let calls = 0;
      const revoked = await read(period, { policy: { protocol, verifyProtocol: () => ++calls === 1 } });
      assert.equal(revoked.policy.state, 'unapproved'); assert.equal(cell(revoked).metrics.brier, null); assert.equal(calls, 2);
      assert.equal((await read()).policy.publicClaimAuthorized, false);
    });
    await t.test('a corrected result first removes stale scores, then replaces current metrics without changing the lock', async () => {
      const before = await read(), original = cell(before).evidence.links;
      await result(states.get(3000), 0, 1, false);
      const pending = await read(); assert.equal(cell(pending).coverage.settled, 3); assert.equal(cell(pending).coverage.pending, 2);
      assert.notEqual(pending.freshness.snapshotKey, before.freshness.snapshotKey);
      await settlement.settleFixture(states.get(3000).fixture.id);
      const corrected = await read(); assert.equal(cell(corrected).coverage.settled, 4); assert.equal(cell(corrected).metrics.correct, 1);
      assert.equal(cell(corrected).metrics.hitRate, .25); near(cell(corrected).metrics.brier, .83);
      assert.equal(corrected.asOf, p.now()); assert.equal(corrected.freshness.lastCorrectedAt, p.now());
      assert.notEqual(corrected.freshness.snapshotKey, pending.freshness.snapshotKey); assert.deepEqual(cell(corrected).evidence.links, original);
    });
    await t.test('oversized stored JSON fails before loading or evaluating its payload', async () => {
      let preflights = 0, payloadReads = 0;
      const database = { transaction: (operation, options) => p.a.transaction((tx) => operation(new Proxy(tx, { get(target, key) {
        const value = Reflect.get(target, key);
        if (key !== '$queryRaw') return value;
        return (sql, ...values) => {
          const query = (Array.isArray(sql) ? sql : sql.strings).join(' ');
          if (/FROM PredictionSet r/u.test(query)) {
            if (/SUM\(OCTET_LENGTH/u.test(query)) { preflights++; return [{ bytes: 16_777_217n, total: 5n }]; }
            payloadReads++;
          }
          return value.call(target, sql, ...values);
        };
      } })), options) };
      await assert.rejects(read(period, { database }), (e) => e.code === 'unavailable');
      assert.equal(preflights, 1); assert.equal(payloadReads, 0);
    });
    await t.test('old postponed cycles remain in their original date period when the applicable fixture moves out', async () => {
      const before = await read();
      p.setTime(readAt + 1000); readAt = p.now();
      await lifecycle.observe(lifecycleInput(postponed, p.now(), { kickoffAt: Date.parse('2026-10-20T12:00:00Z') }));
      const moved = await read(); assert.equal(moved.cohort.fixtureCount, 29); assert.equal(moved.historicalCycles.postponed, 1);
      assert.equal(cell(moved).metrics.denominator, cell(before).metrics.denominator); assert.equal(cell(moved).metrics.hitRate, cell(before).metrics.hitRate);
      assert.notEqual(moved.freshness.snapshotKey, before.freshness.snapshotKey);
    });
    await t.test('repeatable anonymous reports use only bounded reads and dispatch no work', async () => {
      const counts = () => p.a.query(async (tx) => ({ jobs: await tx.durableJob.findMany({ orderBy: { id: 'asc' } }),
        revisions: await tx.predictionSet.count(), evidence: await tx.fixtureEvidenceSnapshot.count(), results: await tx.fixtureResult.count(),
        events: await tx.predictionChangeEvent.count(), audits: await tx.predictionAudit.count(), settlement: await tx.marketSettlementRevision.count(),
        cycles: await tx.predictionCycle.findMany({ orderBy: { id: 'asc' } }), versions: await tx.footballFixture.findMany({ orderBy: { id: 'asc' }, select: { id: true, dataVersion: true } }),
        limit: await tx.publicSearchLimit.findMany() }));
      const before = await counts(), fetch = globalThis.fetch; let outbound = 0, writes = 0, reads = 0;
      const database = { transaction: (operation, options) => p.a.transaction((tx) => operation(new Proxy(tx, { get(target, key) {
        if (['$executeRaw', '$executeRawUnsafe', '$queryRawUnsafe'].includes(key)) return () => { writes++; throw new Error('Unexpected write'); };
        const value = Reflect.get(target, key);
        if (key === '$queryRaw') return (sql, ...values) => {
          reads++; const strings = Array.isArray(sql) ? sql : sql.strings;
          if (!/^\s*SELECT\b/iu.test(strings.join(' '))) { writes++; throw new Error('Unexpected non-SELECT'); }
          return value.call(target, sql, ...values);
        };
        return value && typeof value === 'object' ? new Proxy(value, { get(model, method) {
          if (/create|update|delete|upsert/iu.test(String(method))) return () => { writes++; throw new Error('Unexpected write'); };
          const operation = Reflect.get(model, method); return typeof operation === 'function' ? (...args) => { reads++; return operation.apply(model, args); } : operation;
        } }) : value;
      } })), options) };
      globalThis.fetch = async () => { outbound++; throw new Error('Unexpected network'); };
      try {
        const handler = createPerformanceHandler((parameters) => reader({ database }).query(parameters));
        const response = await handler(new Request(`http://localhost/api/performance?${period}`)); assert.equal(response.status, 200);
        assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
        const data = await response.json(); assert.doesNotMatch(JSON.stringify(data), /private|evidenceRef|approvalRef|transport|configurationJson|requestHash|rawJson/u);
        assert.ok(reads <= 22, `Expected constant batch reads; got ${reads}`);
      } finally { globalThis.fetch = fetch; }
      assert.equal(writes, 0); assert.equal(outbound, 0); assert.deepEqual(await counts(), before);
    });
  });
});

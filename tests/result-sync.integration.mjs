import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { historyJson } from '../src/server/predictions/history-read.ts';
import { normalizeFixture } from '../src/server/football/api-football-normalize.ts';
import { createMysqlDailySelectionStore } from '../src/server/selection/selection-mysql-store.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createResultSyncService } from '../src/server/results/result-sync-service.ts';
import { ResultSyncError } from '../src/server/results/result-sync-contract.ts';
import { createQuotaLimiter } from '../src/server/football/quota-limiter.ts';
import { createMysqlQuotaStore } from '../src/server/football/quota-mysql-store.ts';
import { catalogFixture, catalogRequest, catalogResponse, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { lifecycleAuthority, lifecyclePolicy } from './helpers/lifecycle-fixtures.mjs';
import { resultHash, resultAuthority, resultPolicy, resultProvider } from './helpers/result-sync-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const execute = promisify(execFile);
test('shared result synchronization on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const { a, b, first, second, catalog, history, queue } = p;
    const clock = { now: () => p.now() }, pollers = [];
    const lifecycle = (database = a, extra = {}) => createScheduleLifecycleService({ database,
      cutoff: database === b ? second : first, policy: lifecyclePolicy(), authority: lifecycleAuthority(), ...extra });
    let sequence = 0;
    async function seed(rawRows, overrides = {}, options = {}) {
      const label = ++sequence, accountId = resultHash(`result-account:${label}`), competitionId = 1000 + label;
      const at = p.now(), rows = rawRows.map((row) => ({ ...row, league: { ...row.league, id: competitionId } }));
      const provider = createSyntheticCatalogAdapter({ rows }); provider.clock.value = at - (options.importAgeMs ?? 61_000);
      p.setTime(provider.clock.value);
      const imported = await createFootballCatalogImporter({ adapter: provider.adapter, store: catalog, authority: catalogSelectionAuthority, clock: provider.clock })
        .import(catalogRequest({ kind: 'fixtures', query: { competitionId, season: 2026 } }, p.now()));
      assert.equal(imported.importedCount, rows.length); p.setTime(at);
      await a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
      const policy = resultPolicy({ coverage: [{ competitionId, season: 2026 }], ...overrides });
      const source = resultProvider(clock, { accountId, rows });
      const makeStore = (database = a, extra = {}) => createMysqlResultSyncStore({ database, accountId, lifecycle: lifecycle(database), ...extra });
      const store = makeStore();
      const make = (extra = {}) => {
        const poller = createResultSyncService({ accountId, policy, authority: resultAuthority(), store, adapter: source.adapter.evidence, clock, ...extra });
        pollers.push(poller); return poller;
      };
      return { accountId, policy, source, store, makeStore, make, poller: make(), rows,
        fixture: async (index = 0) => catalog.fixtureByProviderId(rows[index].fixture.id) };
    }
    const counts = (fixtureId) => a.query(async (tx) => ({ results: await tx.fixtureResult.count({ where: { fixtureId } }),
      observations: await tx.resultProviderObservation.count({ where: { fixtureId } }), events: await tx.predictionChangeEvent.count({ where: { fixtureId, kind: 'fixture-result' } }) }));
    const channels = (source, name) => source.network.filter((request) => name === 'ids'
      ? request.url.searchParams.has('ids') || request.url.searchParams.has('id') : request.url.searchParams.has(name));
    const advance = (ms) => p.setTime(p.now() + ms);
    const score = (home, away) => ({ home, away });
    try {
      await t.test('fresh migrations, binary identities, foreign keys and append-only grants', async () => {
        await execute(process.execPath, ['--conditions=react-server', 'scripts/database.mjs', 'verify'], { env: p.env, windowsHide: true, timeout: 60_000 });
        const rows = await a.query((tx) => tx.$queryRaw`SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('ResultPollerLease','ResultSyncBatch','FixtureResultState','FixtureResult','ResultProviderObservation')`);
        assert.equal(rows.length, 5); assert.ok(rows.every((row) => row.ENGINE === 'InnoDB' && row.TABLE_COLLATION === 'utf8mb4_bin'));
        for (const table of ['FixtureResult','ResultProviderObservation','ResultSyncBatch']) {
          await assert.rejects(a.query((tx) => tx.$executeRawUnsafe(`UPDATE ${table} SET integrity = REPEAT('a',64)`)));
          await assert.rejects(a.query((tx) => tx.$executeRawUnsafe(`DELETE FROM ${table}`)));
        }
        await assert.rejects(a.query((tx) => tx.predictionChangeEvent.create({ data: { fixtureId: '00000000-0000-4000-8000-000000000001', version: 1n, kind: 'fixture-result', at: new Date(p.now()) } })));
      });
      await t.test('one owner across replicas, exact expiry takeover and fenced stale owners', async () => {
        const s = await seed([catalogFixture(10001)]);
        const other = s.makeStore(b), owners = Array.from({ length: 6 }, (_, index) => resultHash(`owner-${index}`));
        const leases = await Promise.all(owners.map((owner, i) => (i % 2 ? other : s.store).acquire(owner, 30_000)));
        assert.equal(leases.filter(Boolean).length, 1); const winner = leases.find(Boolean);
        advance(29_999); assert.equal(await other.acquire(resultHash('takeover'), 30_000), null);
        advance(1); const replacement = await other.acquire(resultHash('takeover'), 30_000);
        assert.equal(replacement.fence, winner.fence + 1n);
        await assert.rejects(s.store.renew(winner, 30_000), (error) => error instanceof ResultSyncError && error.reason === 'lost-lease');
        await s.store.release(winner); assert.equal((await other.health()).ownerId, replacement.ownerId);
        await other.release(replacement);
      });
      await t.test('controlled 15s/60s cadence pauses, resumes and survives a graceful restart', async () => {
        const at = p.now(), s = await seed([catalogFixture(10002, { kickoff: new Date(at + 120_000).toISOString() })]);
        assert.equal(await s.poller.runOnce(), true);
        assert.equal(channels(s.source, 'date').length, 1); assert.equal(channels(s.source, 'live').length, 0);
        advance(59_999); await s.poller.runOnce(); assert.equal(s.source.network.length, 1);
        advance(1); await s.poller.runOnce(); assert.equal(channels(s.source, 'date').length, 2); assert.equal(channels(s.source, 'live').length, 1);
        advance(14_999); await s.poller.runOnce(); assert.equal(channels(s.source, 'live').length, 1);
        advance(1); await s.poller.runOnce(); assert.equal(channels(s.source, 'live').length, 2);
        await s.poller.stop(); const restarted = s.make({ store: s.makeStore(b) }); await restarted.runOnce();
        assert.equal(channels(s.source, 'date').length, 2); assert.equal(channels(s.source, 'live').length, 2);
        s.source.state.rows[0].fixture.status.short = 'FT'; s.source.state.rows[0].score.fulltime = score(1,0);
        advance(45_000); await restarted.runOnce();
        assert.equal(channels(s.source, 'date').length, 3); assert.equal(channels(s.source, 'live').length, 2);
      });
      await t.test('many concurrent ticks and a competing replica cannot multiply provider requests', async () => {
        const s = await seed([catalogFixture(10003, { kickoff: new Date(p.now() + 10_000).toISOString() })]);
        const competitor = s.make({ store: s.makeStore(b) });
        await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? competitor : s.poller).runOnce()));
        assert.equal(channels(s.source, 'date').length, 1); assert.equal(channels(s.source, 'live').length, 1);
        assert.ok(s.source.network.every((request) => request.url.pathname === '/fixtures'));
      });
      await t.test('46 cross-midnight missing-live fixtures use 20/20/6 batches and retain missing records', async () => {
        p.setTime(Date.parse('2026-10-09T21:01:00Z'));
        const rows = Array.from({ length: 46 }, (_, i) => catalogFixture(11000+i, { kickoff: '2026-10-09T20:59:00Z', status: '1H' }));
        const s = await seed(rows); s.source.state.rows = s.rows.slice(0, 45);
        s.source.state.respond = (url) => {
          const ids = (url.searchParams.get('ids') ?? '').split('-').map(Number);
          return catalogResponse(url, s.source.state.rows.filter((row) => ids.includes(row.fixture.id)));
        };
        assert.equal(await s.poller.runOnce(), true);
        assert.deepEqual(channels(s.source, 'ids').map((request) => request.url.searchParams.get('ids').split('-').length), [20,20,6]);
        assert.equal(channels(s.source, 'date')[0].url.searchParams.get('date'), '2026-10-10');
        const missing = await s.fixture(45), known = await s.fixture();
        assert.equal((await catalog.fixtureByProviderId(missing.externalId)).status, 'live');
        assert.equal((await s.store.result(missing.id)).state.delayReason, 'coverage-error');
        assert.equal((await s.store.result(known.id)).state.lastSyncAt.getTime(), p.now());
        advance(15_000); await s.poller.runOnce(); assert.equal(channels(s.source, 'ids').length, 3);
        advance(45_000); await s.poller.runOnce(); assert.equal(channels(s.source, 'ids').length, 6);
        assert.ok(s.source.reservations.filter((request) => request.priority === 'results-cutoff').length >= 6);
      });
      await t.test('date/live responses deduplicate ID work and coverage is filtered locally', async () => {
        const s = await seed([catalogFixture(10004, { kickoff: new Date(p.now()-60_000).toISOString(), status: '1H' })]);
        s.source.state.rows.push(catalogFixture(999999, { competitionId: 99999, kickoff: new Date(p.now()).toISOString(), status: '1H' }));
        assert.equal(await s.poller.runOnce(), true); assert.equal(channels(s.source, 'ids').length, 0);
        assert.equal(await catalog.fixtureByProviderId(999999), null);
        assert.equal(channels(s.source, 'live')[0].url.searchParams.get('live'), 'all');
      });
      await t.test('unverified extra-time/shootout totals stay separate; verified regulation and corrections append revisions', async () => {
        const s = await seed([catalogFixture(10005, { kickoff: new Date(p.now()-300_000).toISOString() })]);
        const row = s.rows[0]; row.fixture.status.short = 'PEN'; row.goals = score(3,2);
        row.score = { fulltime: score(1,1), extratime: score(3,2), penalty: score(5,4) }; s.source.state.verifyScore = false;
        assert.equal(await s.poller.runOnce(), true); const fixture = await s.fixture();
        const unresolved = await s.store.result(fixture.id);
        assert.equal(unresolved.result.regulation.verified, false); assert.equal(unresolved.result.regulation.home, null);
        assert.deepEqual(unresolved.result.extraTimeScore, score(3,2)); assert.deepEqual(unresolved.result.penaltyScore, score(5,4));
        advance(60_000); s.source.state.verifyScore = true; await s.poller.runOnce();
        const verified = await s.store.result(fixture.id); assert.deepEqual(verified.result.regulation, { verified: true, home: 1, away: 1, evidenceRef: s.policy.evidenceRef });
        assert.equal(verified.result.previousId, unresolved.result.id);
        advance(60_000); row.score.fulltime = score(2,1); await s.poller.runOnce();
        const corrected = await s.store.result(fixture.id);
        assert.equal(corrected.result.previousId, verified.result.id); assert.equal(corrected.result.regulation.home, 2);
        assert.ok(corrected.result.fixtureVersion > verified.result.fixtureVersion);
        assert.deepEqual(await counts(fixture.id), { results: 3, observations: 3, events: 3 });
        assert.equal(corrected.state.firstFinalAt.getTime(), unresolved.state.firstFinalAt.getTime());
      });
      await t.test('unchanged observations advance actual last sync without inventing generation time or revisions', async () => {
        const s = await seed([catalogFixture(10006, { kickoff: new Date(p.now()-300_000).toISOString(), status: 'FT', score: { fulltime: score(1,0) } })]);
        await s.poller.runOnce(); const fixture = await s.fixture(), original = await s.store.result(fixture.id), at = p.now();
        assert.equal(original.state.firstFinalAt.getTime(), at - 61_000);
        advance(60_000); await s.poller.runOnce(); const latest = await s.store.result(fixture.id);
        assert.equal(latest.result.id, original.result.id); assert.equal(latest.result.observedAt, at);
        assert.equal(latest.result.providerUpdatedAt, null); assert.equal(latest.state.lastSyncAt.getTime(), p.now());
        assert.deepEqual(await counts(fixture.id), { results: 1, observations: 2, events: 1 });
        advance(60_000); s.rows[0].score.fulltime = null; await s.poller.runOnce();
        assert.equal((await s.store.result(fixture.id)).result.regulation.home, 1);
      });
      await t.test('a saved response survives interruption and replays original timestamps without another fetch', async () => {
        const s = await seed([catalogFixture(10007, { kickoff: new Date(p.now()-300_000).toISOString(), status: 'FT', score: { fulltime: score(0,0) } })]);
        const interrupted = s.make({ store: { ...s.store, async apply() { throw new Error('synthetic interruption'); } } });
        assert.equal(await interrupted.runOnce(), false); const requests = s.source.network.length, at = p.now();
        assert.equal(await a.query((tx) => tx.resultSyncBatch.count({ where: { accountId: s.accountId, completedAt: null } })), 1);
        advance(30_000); const restarted = s.make({ store: s.makeStore(b) }); assert.equal(await restarted.runOnce(), true);
        const fixture = await s.fixture(), restored = await s.store.result(fixture.id);
        assert.equal(s.source.network.length, requests); assert.equal(restored.result.observedAt, at); assert.equal(restored.state.lastSyncAt.getTime(), at);
        assert.deepEqual(await counts(fixture.id), { results: 1, observations: 1, events: 1 });
      });
      await t.test('partial application recovers per fixture and keeps the already committed result/event', async () => {
        const s = await seed([10008,10009].map((id) => catalogFixture(id, { kickoff: new Date(p.now()-300_000).toISOString(), status: 'FT' })));
        const baseLifecycle = lifecycle(); let applications = 0;
        const broken = s.makeStore(a, { lifecycle: { ...baseLifecycle, async observeProjection(...args) {
          if (++applications === 2) throw new Error('synthetic crash after first fixture'); return baseLifecycle.observeProjection(...args);
        } } });
        assert.equal(await s.make({ store: broken }).runOnce(), false);
        const fixture = await s.fixture(); assert.deepEqual(await counts(fixture.id), { results: 1, observations: 1, events: 1 });
        advance(30_000); assert.equal(await s.make({ store: s.makeStore(b) }).runOnce(), true);
        assert.deepEqual(await counts(fixture.id), { results: 1, observations: 1, events: 1 });
        assert.deepEqual(await counts((await s.fixture(1)).id), { results: 1, observations: 1, events: 1 });
        assert.equal(s.source.network.length, 1);
      });
      await t.test('stale and equal-time conflicting evidence cannot roll back results or fake a newer last sync', async () => {
        const s = await seed([catalogFixture(10014, { kickoff: new Date(p.now()-300_000).toISOString(), status: 'FT', score: { fulltime: score(2,1) } })]);
        await s.poller.runOnce(); const fixture = await s.fixture(), original = await s.store.result(fixture.id), at = p.now();
        advance(1000); const lease = await s.store.acquire(resultHash('stale-result-owner'), 30_000);
        assert.equal(lease, null); await s.poller.stop(); const owned = await s.store.acquire(resultHash('stale-result-owner'), 30_000);
        const apply = async (retrievedAt, reason) => {
          const raw = structuredClone(s.rows[0]); raw.score.fulltime = score(9,9);
          const normalized = normalizeFixture(raw, { retrievedAt, endpoint: '/fixtures', verifyRegulationScore: () => true }); assert.equal(normalized.valid, true);
          const observation = parseLifecycleInput({ fixtureId: fixture.id, fixture: normalized.data, actualStartedAt: null, actor: 'synthetic-stale-sync', evidenceRef: reason });
          const value = { accountId: s.accountId, policyHash: evidenceFingerprint(s.policy), receivedAt: p.now(), channel: 'ids', date: null,
            requestedIds: [fixture.externalId], observations: [observation], error: null, requestsDispatched: 0 };
          const batch = { id: evidenceFingerprint(value), ...value }; await s.store.save(owned, batch); await s.store.apply(owned, batch);
        };
        await apply(at-1, 'synthetic-stale'); assert.equal((await s.store.result(fixture.id)).result.id, original.result.id);
        await apply(at, 'synthetic-conflict'); const latest = await s.store.result(fixture.id);
        assert.equal(latest.result.id, original.result.id); assert.equal(latest.state.lastSyncAt.getTime(), at);
        assert.equal(latest.state.delayReason, 'same-time-conflicting-evidence');
        assert.deepEqual(await counts(fixture.id), { results: 1, observations: 3, events: 1 }); await s.store.release(owned);
      });
      await t.test('an in-flight response from an expired owner cannot persist after takeover', async () => {
        const s = await seed([catalogFixture(10015, { kickoff: new Date(p.now()+3_600_000).toISOString() })]);
        let arrived, finish; const started = new Promise((resolve) => { arrived = resolve; });
        const response = new Promise((resolve) => { finish = resolve; });
        s.source.state.respond = async (url) => { arrived(); await response; return catalogResponse(url, s.rows); };
        const old = s.poller.runOnce(); await started; advance(30_000);
        const replacement = s.make({ store: s.makeStore(b) }); assert.equal(await replacement.runOnce(), true);
        finish(); assert.equal(await old, false);
        assert.equal(await a.query((tx) => tx.resultSyncBatch.count({ where: { accountId: s.accountId } })), 0);
        assert.equal(s.source.network.length, 1); const owner = (await s.store.health()).ownerId;
        await s.poller.stop(); assert.equal((await s.store.health()).ownerId, owner);
      });
      await t.test('reusing an originally accepted cached response cannot regress a newer result', async () => {
        const s = await seed([catalogFixture(10016, { kickoff: new Date(p.now()-300_000).toISOString(), status: 'FT', score: { fulltime: score(1,0) } })]);
        await s.poller.runOnce(); const fixture = await s.fixture();
        const observation = await a.query(async (tx) => historyJson((await tx.resultProviderObservation.findFirstOrThrow({ where: { fixtureId: fixture.id } })).body).observation);
        advance(60_000); s.rows[0].score.fulltime = score(3,0); await s.poller.runOnce();
        const current = await s.store.result(fixture.id); await s.poller.stop();
        const lease = await s.store.acquire(resultHash('cached-response-owner'), 30_000);
        const value = { accountId: s.accountId, policyHash: evidenceFingerprint(s.policy), receivedAt: p.now(), channel: 'ids', date: null,
          requestedIds: [fixture.externalId], observations: [observation], error: null, requestsDispatched: 0 };
        const batch = { id: evidenceFingerprint(value), ...value }; await s.store.save(lease, batch); await s.store.apply(lease, batch);
        const latest = await s.store.result(fixture.id);
        assert.equal(latest.result.id, current.result.id); assert.equal(latest.result.regulation.home, 3);
        assert.equal(latest.state.lastSyncAt.getTime(), current.state.lastSyncAt.getTime());
        assert.deepEqual(await counts(fixture.id), { results: 2, observations: 3, events: 2 }); await s.store.release(lease);
      });
      await t.test('outages back off persistently and stored data remain available', async () => {
        const s = await seed([catalogFixture(10010, { kickoff: new Date(p.now()+3_600_000).toISOString() })]);
        s.source.state.status = 503; assert.equal(await s.poller.runOnce(), true); assert.equal(s.source.network.length, 1);
        const health = await s.store.health(); assert.equal(health.dateError, 'transport-error'); assert.equal(health.dateFailures, 1);
        advance(60_000); await s.poller.runOnce(); assert.equal(s.source.network.length, 2);
        await s.poller.stop(); advance(60_000); const restarted = s.make({ store: s.makeStore(b) }); await restarted.runOnce();
        assert.equal(s.source.network.length, 2); assert.equal((await s.store.health()).dateFailures, 2);
        assert.equal((await catalog.fixtureByProviderId((await s.fixture()).externalId)).status, 'scheduled');
        advance(60_000); s.source.state.status = 200; await restarted.runOnce(); assert.equal(s.source.network.length, 3);
        assert.equal((await s.store.health()).dateError, null);
      });
      await t.test('date boundaries and unsupported pagination do not overwrite stored fixtures', async () => {
        const s = await seed([catalogFixture(10011, { kickoff: new Date(p.now()+3_600_000).toISOString() })]);
        const fixture = await s.fixture(); s.source.state.paging = { current: 1, total: 2 };
        await s.poller.runOnce(); assert.equal((await s.store.health()).dateError, 'pagination-incomplete'); assert.equal((await counts(fixture.id)).results, 0);
        advance(60_000); s.source.state.paging = undefined;
        s.source.state.respond = (url) => catalogResponse(url, [catalogFixture(10011, { competitionId: s.policy.coverage[0].competitionId, kickoff: '2026-10-12T12:00:00Z' })]);
        await s.poller.runOnce(); assert.equal((await counts(fixture.id)).results, 0);
        assert.equal((await catalog.fixtureByProviderId(fixture.externalId)).kickoff, fixture.kickoff);
      });
      await t.test('long unresolved fixtures remain stored beyond midnight, the forecast window and polling horizon', async () => {
        const s = await seed([catalogFixture(10012, { kickoff: new Date(p.now()-8*86_400_000).toISOString(), status: '1H' })], {}, { importAgeMs: 2*3_600_000 });
        await s.poller.runOnce(); const fixture = await s.fixture(); assert.equal(channels(s.source, 'live').length, 0); assert.equal(channels(s.source, 'ids').length, 1);
        advance(60_000); await s.poller.runOnce(); assert.equal(channels(s.source, 'ids').length, 1);
        advance(3_600_000); await s.poller.runOnce(); assert.equal(channels(s.source, 'ids').length, 2);
        advance(40*86_400_000); await s.poller.runOnce(); assert.equal(channels(s.source, 'ids').length, 2);
        assert.equal((await catalog.fixtureByProviderId(fixture.externalId)).status, 'live');
        const exhausted = (await s.store.result(fixture.id)).state;
        assert.equal(exhausted.nextCheckAt, null); assert.equal(exhausted.delayReason, 'polling-horizon-exhausted');
      });
      await t.test('polling early play/corrections preserves manifests, refresh jobs and locked forecasts', async () => {
        const state = await p.setup(3000), manifest = evidenceFingerprint(state.selected.manifest);
        p.setTime(state.input.candidate.context.context.analysisAt + 4000);
        const published = await p.publisher.publish(state.input, state.lease), prior = await history.findRevision(published.revision.id);
        p.setTime(state.cycle.kickoffAt);
        const accountId = resultHash('locked-results'); await a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
        const source = resultProvider(clock, { accountId, rows: [catalogFixture(3000, { kickoff: new Date(state.cycle.kickoffAt).toISOString(), status: '1H' })] });
        const store = createMysqlResultSyncStore({ database: a, accountId, lifecycle: lifecycle() });
        const poller = createResultSyncService({ accountId, policy: resultPolicy(), store, adapter: source.adapter.evidence, clock, authority: resultAuthority() }); pollers.push(poller);
        const beforeJobs = await a.query((tx) => tx.durableJob.count({ where: { refreshFixtureId: state.fixture.id } }));
        await poller.runOnce(); const locked = await history.findCycle(state.cycle.id); assert.equal(locked.lockedSetId, prior.id);
        advance(60_000); source.state.rows[0].fixture.status.short = 'FT'; source.state.rows[0].score.fulltime = score(2,1); await poller.runOnce();
        advance(60_000); source.state.rows[0].score.fulltime = score(1,1); await poller.runOnce();
        assert.deepEqual(await history.findRevision(prior.id), prior); assert.equal((await history.findCycle(state.cycle.id)).lockedSetId, prior.id);
        assert.equal(await a.query((tx) => tx.durableJob.count({ where: { refreshFixtureId: state.fixture.id } })), beforeJobs);
        assert.equal(evidenceFingerprint((await createMysqlDailySelectionStore(a, queue).inspect(state.selected.selected.runId)).manifest), manifest);
        assert.ok(source.network.every((request) => request.url.pathname === '/fixtures'));
      });
      await t.test('real shared limiter protects reserve and stops result batches exactly at the account cap', async () => {
        await p.instance.executeAdmin(`GRANT SELECT, INSERT, UPDATE ON goal_hint_test.ApiQuotaPeriod TO 'cutoff_app'@'127.0.0.1';
          GRANT SELECT, INSERT, UPDATE ON goal_hint_test.ApiQuotaAttempt TO 'cutoff_app'@'127.0.0.1';`);
        const s = await seed(Array.from({ length: 21 }, (_, i) => catalogFixture(12000+i, { kickoff: new Date(p.now()-300_000).toISOString(), status: '1H' })));
        const quotaStore = createMysqlQuotaStore(a), limiter = createQuotaLimiter({ accountId: s.accountId, store: quotaStore, verifyEvidence: () => true });
        const periodId = resultHash('results-near-cap');
        assert.equal((await limiter.initialize({ accountId: s.accountId, periodId, startsAt: p.now()-3_600_000,
          endsAt: p.now()+86_400_000, subscriptionExpiresAt: p.now()+7*86_400_000, providerDailyLimit: 150000,
          dailyRemaining: 30001, secondLimit: 15, minuteLimit: 900, evidenceRef: 'synthetic-one-slot-remains' })).status, 'initialized');
        const source = resultProvider(clock, { accountId: s.accountId, limiter, rows: s.rows,
          respond: (url) => catalogResponse(url, s.rows.filter((row) => (url.searchParams.get('ids') ?? '').split('-').map(Number).includes(row.fixture.id))) });
        const poller = s.make({ adapter: source.adapter.evidence }); assert.equal(await poller.runOnce(), true);
        assert.equal(source.network.length, 1); assert.ok(source.network[0].url.searchParams.has('ids'));
        const period = await quotaStore.transaction(s.accountId, (tx) => tx.period(periodId)); assert.equal(period.used, 120000);
        assert.equal((await s.store.health()).dateError, 'essential-reserve');
        assert.equal((await s.store.result((await s.fixture(20)).id)).state.delayReason, 'daily-limit');
      });
      await t.test('policy and response authority fail closed without AI or unauthorized persistence', async () => {
        const s = await seed([catalogFixture(10013)]);
        await assert.rejects(s.make({ authority: resultAuthority({ verifyPolicy: () => false }) }).runOnce(), /Result synchronization/);
        assert.equal(s.source.network.length, 0);
        await assert.rejects(s.make({ authority: resultAuthority({ verifyResponse: () => false }) }).runOnce(), /Result synchronization/);
        assert.equal(await a.query((tx) => tx.resultSyncBatch.count({ where: { accountId: s.accountId } })), 0);
      });
    } finally { await Promise.all(pollers.map((poller) => poller.stop().catch(() => {}))); }
  });
});

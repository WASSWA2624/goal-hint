import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createPublicResponseCache, publicCacheDescriptor } from '../src/server/cache/public-cache.ts';
import { createMysqlPublicCacheStore, createMysqlPublicResponseCache } from '../src/server/cache/mysql-public-cache.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { createMatchDetailService } from '../src/server/matches/detail-service.ts';
import { createPerformanceService } from '../src/server/performance/performance-service.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { lifecycleInput, lifecyclePolicy, lifecycleAuthority } from './helpers/lifecycle-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { performanceProtocol } from './helpers/performance-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const execute = promisify(execFile), params = value => new URLSearchParams(value);
const coverageCount = (report, field) => report.cells.filter(cell => cell.source === 'combined' && cell.horizon === null)
  .reduce((sum, cell) => sum + cell.coverage[field], 0);
test('shared public cache, transactional invalidation and recovery on genuine MySQL', { timeout: 300_000 }, async t => {
  await withPredictionPipeline(t, async p => {
    const state = await p.setup(3000), other = await p.setup(3001), progress = await p.setup(3002);
    const cacheA = createMysqlPublicResponseCache(p.a, p.now), cacheB = createMysqlPublicResponseCache(p.b, p.now);
    const storeA = createMysqlPublicCacheStore(p.a), storeB = createMysqlPublicCacheStore(p.b);
    let reads = 0, network = 0;
    const counted = database => ({ query: database.query, transaction: (operation, options) => {
      if (options?.timeout === 30_000) reads++; return database.transaction(operation, options);
    } });
    const clock = { now: p.now }, feed = createMatchFeedService({ database: counted(p.a), cache: cacheA, competitionIds: [39], clock });
    const detail = createMatchDetailService({ database: counted(p.a), cache: cacheA, clock });
    const replicaDetail = createMatchDetailService({ database: counted(p.b), cache: cacheB, clock });
    const performance = createPerformanceService({ database: counted(p.b), cache: cacheB, competitionIds: [39], clock });
    const feedRead = (query = 'date=2026-10-09') => feed.query(params(query));
    const detailRead = (target = state, query = '') => detail.query(target.fixture.id, params(query));
    const performanceRead = () => performance.query(params('from=2026-10-09&to=2026-10-09'));
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { network++; throw new Error('Public cache attempted network I/O'); };
    try {
      await t.test('migration repeats/verifies, triggers exist, application cannot forge generations or journals', async () => {
        await execute(process.execPath, ['--conditions=react-server', 'scripts/database.mjs', 'deploy'], { env: p.env, windowsHide: true, timeout: 60_000 });
        await execute(process.execPath, ['--conditions=react-server', 'scripts/database.mjs', 'verify'], { env: p.env, windowsHide: true, timeout: 60_000 });
        const triggers = await p.a.query(tx => tx.$queryRaw`SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME LIKE 'PublicCache_%'`);
        // information_schema exposes only triggers on tables for which the role has TRIGGER rights.
        assert.equal(triggers.length, 0);
        const actual = await p.instance.executeAdmin("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='goal_hint_test' AND TRIGGER_NAME LIKE 'PublicCache_%'");
        assert.ok(Number(actual.stdout.trim()) >= 30);
        await assert.rejects(p.a.query(tx => tx.publicCacheTag.create({ data: { tag: 'forged', generation: 1n } })));
        await assert.rejects(p.a.query(tx => tx.publicCacheInvalidation.create({ data: { tag: 'forged', generation: 1n, at: new Date() } })));
      });
      await t.test('normalized hits cross replicas and preserve all response and source clocks', async () => {
        const first = await feedRead(), before = reads;
        p.setTime(p.now() + 1);
        const hit = await feed.query(params('page=1&status=all&date=2026-10-09'));
        assert.deepEqual(hit, first); assert.equal(reads, before);
        const initial = await detailRead(), after = reads;
        assert.deepEqual(await replicaDetail.query(state.fixture.id), initial); assert.equal(reads, after);
        const report = await performanceRead(), afterReport = reads;
        assert.deepEqual(await performanceRead(), report); assert.equal(reads, afterReport);
      });
      await t.test('actual failed job progress and coverage attempts invalidate without fixture events', async () => {
        const warm = await feedRead(), report = await performanceRead();
        await p.queue.retry(progress.lease, 'handler-failed', false);
        const failed = await feedRead(); assert.equal(failed.run.failed, warm.run.failed + 1);
        assert.notEqual((await performanceRead()).freshness.snapshotKey, report.freshness.snapshotKey);
        const previous = await p.a.query(tx => tx.dailyRunImport.findFirst({ orderBy: { eatDate: 'asc' } }));
        const importId = randomUUID();
        const attempt = await p.a.query(tx => tx.dailyRunImport.create({ data: { id: importId, runId: previous.runId,
          eatDate: previous.eatDate, attempt: previous.attempt + 1, requestJson: { ...previous.requestJson, id: importId } } }));
        assert.equal((await feedRead()).coverage.dates[0].status, 'pending');
        await feedRead(); const before = reads;
        await p.a.query(tx => tx.dailyRunImport.update({ where: { id: attempt.id }, data: { failure: 'import-unavailable', finishedAt: new Date(p.now()) } }));
        assert.equal((await feedRead()).coverage.dates[0].status, 'failed'); assert.ok(reads > before);
        assert.equal((await detailRead()).snapshot, null);
      });
      await t.test('publication, job acknowledgment and cutoff invalidate warm envelopes immediately', async () => {
        const prior = await detailRead(); assert.equal(prior.snapshot, null);
        const published = await p.publisher.publish(state.input, state.lease);
        assert.equal(published.refresh.outcome, 'published'); state.revision = published.revision;
        const current = await detailRead(); assert.equal(current.snapshot.revisionId, state.revision.id);
        assert.ok(BigInt(current.fixture.dataVersion) > BigInt(prior.fixture.dataVersion));
        const running = await feedRead();
        await p.queue.acknowledge(state.lease);
        const acknowledged = await feedRead(); assert.equal(acknowledged.run.completed, running.run.completed + 1);
        p.setTime(state.cycle.cutoffAt);
        const open = await detailRead(); assert.equal(open.selectedCycle.state, 'open');
        await p.first.close(p.target(state));
        const locked = await replicaDetail.query(state.fixture.id);
        assert.equal(locked.selectedCycle.state, 'closed'); assert.equal(locked.snapshot.applicability, 'locked');
        assert.equal(locked.snapshot.revisionId, state.revision.id);
        assert.equal(coverageCount(await performanceRead(), 'available'), 4);
      });
      await t.test('material status/score changes and reschedules evict both old/new feeds and cohorts', async () => {
        const oldFeed = await feedRead(), oldReport = await performanceRead();
        const newQuery = 'date=2026-10-10', newBefore = await feedRead(newQuery);
        const newKickoff = Date.parse('2026-10-10T09:00:00Z');
        await lifecycle.observe(lifecycleInput(other, p.now(), { kickoffAt: newKickoff }));
        const oldAfter = await feedRead(), newAfter = await feedRead(newQuery);
        assert.equal(oldAfter.total, oldFeed.total - 1); assert.equal(newAfter.total, newBefore.total + 1);
        assert.notEqual((await performanceRead()).freshness.snapshotKey, oldReport.freshness.snapshotKey);
        await detailRead(); const before = reads;
        p.setTime(p.now() + 1);
        await lifecycle.observe(lifecycleInput(state, p.now(), { status: 'LIVE', actualStartedAt: p.now(),
          raw: { goals: { home: 1, away: 0 } } }));
        assert.equal((await detailRead()).fixture.status, 'live'); assert.ok(reads > before);
      });
      await t.test('settlement and result corrections change badges, preserve locked picks and reuse immutable payload', async () => {
        const accountId = resultHash('cache-results');
        await p.a.query(tx => tx.apiQuotaAccount.create({ data: { id: accountId } }));
        const resultStore = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
        const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
        let number = 0;
        async function result(home, away) {
          number++; p.setTime(p.now() + 1);
          const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status: 'FT', raw: {
            goals: { home, away }, score: { fulltime: { home, away } } } }));
          const lease = await resultStore.acquire(resultHash(`cache-results-owner-${number}`), 30_000);
          const batch = { id: resultHash(`cache-result-${number}`), accountId, policyHash: resultHash('cache-result-policy'), receivedAt: p.now(),
            channel: 'ids', date: null, requestedIds: [3000], observations: [observation], error: null, requestsDispatched: 1 };
          try { await resultStore.save(lease, batch); await resultStore.apply(lease, batch); } finally { await resultStore.release(lease); }
        }
        const warm = await detailRead(), immutableBefore = await p.a.query(tx => tx.publicResponseCache.findMany({ where: {
          expiresAt: { gt: new Date(p.now() + 60_000) } }, select: { key: true, createdAt: true } }));
        assert.ok(immutableBefore.length > 0);
        await result(2, 0); await settlement.settleFixture(state.fixture.id);
        const won = await detailRead(), report = await performanceRead();
        assert.equal(won.snapshot.outcomes.find(o => o.family === 'match-result').status, 'correct');
        assert.equal(coverageCount(report, 'settled'), 4);
        await result(0, 2);
        assert.equal((await detailRead()).snapshot.outcomes[0].status, 'pending');
        assert.equal(coverageCount(await performanceRead(), 'settled'), 0);
        await settlement.settleFixture(state.fixture.id);
        const corrected = await detailRead();
        assert.equal(corrected.snapshot.outcomes.find(o => o.family === 'match-result').status, 'incorrect');
        assert.ok(corrected.snapshot.outcomes[0].correctedAt !== null);
        assert.deepEqual(corrected.snapshot.markets, warm.snapshot.markets);
        assert.notEqual((await performanceRead()).freshness.snapshotKey, report.freshness.snapshotKey);
        const immutableAfter = await p.a.query(tx => tx.publicResponseCache.findMany({ where: { key: { in: immutableBefore.map(row => row.key) } }, select: { key: true, createdAt: true } }));
        assert.deepEqual(immutableAfter, immutableBefore);
      });
      await t.test('cached performance never bypasses current policy verification or retains revoked metrics', async () => {
        const season = await p.a.query(tx => tx.footballSeason.findUnique({ where: { id: state.fixture.seasonId } }));
        const protocol = performanceProtocol({ competitionIds: [season.competitionId], gate: { minimumCoverage: 0 } });
        let allowed = true, checks = 0;
        const policy = { protocol, verifyProtocol: () => { checks++; return allowed; } };
        const service = createPerformanceService({ database: counted(p.a), cache: cacheA, competitionIds: [39], clock, policy });
        const query = params('from=2026-10-09&to=2026-10-09');
        assert.equal((await service.query(query)).policy.state, 'verified');
        const before = reads, priorChecks = checks;
        assert.equal((await service.query(query)).policy.state, 'verified');
        assert.equal(reads, before); assert.ok(checks >= priorChecks + 2);
        const revoked = createPerformanceService({ database: counted(p.a), competitionIds: [39], clock, policy,
          cache: { ...cacheA, read: async (descriptor, load) => { const value = await cacheA.read(descriptor, load); allowed = false; return value; } } });
        const response = await revoked.query(query);
        assert.equal(response.policy.state, 'unapproved'); assert.ok(response.cells.every(cell => cell.metrics.brier === null));
        assert.equal((await service.query(query)).policy.state, 'unapproved');
      });
      await t.test('invalid requests/not-found are not cached, search hits still consume the aggregate budget', async () => {
        const before = await p.a.query(tx => tx.publicResponseCache.count());
        await assert.rejects(feedRead('unexpected=1'), e => e.code === 'invalid-query');
        await assert.rejects(detail.query(randomUUID()), e => e.code === 'not-found');
        assert.equal(await p.a.query(tx => tx.publicResponseCache.count()), before);
        const search = 'date=2026-10-09&q=Club';
        await feedRead(search);
        const prior = await p.a.query(tx => tx.publicSearchLimit.findUnique({ where: { scope: 'matches' } }));
        const beforeRead = reads; await feedRead(search); assert.equal(reads, beforeRead);
        const after = await p.a.query(tx => tx.publicSearchLimit.findUnique({ where: { scope: 'matches' } }));
        assert.equal(after.requests, prior.requests + 1);
      });
      await t.test('two replicas fence an older in-flight fill after durable invalidation', async () => {
        const d = publicCacheDescriptor({ kind: 'detail', locale: 'en', now: p.now(), fixtureId: state.fixture.id,
          query: { race: true }, parse: value => value });
        let release, began; const gate = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { began = resolve; });
        const old = cacheA.read(d, async () => { began(); await gate; return { version: 'old' }; });
        await ready;
        await p.a.query(tx => tx.footballFixture.update({ where: { id: state.fixture.id }, data: { dataVersion: { increment: 1 } } }));
        assert.equal((await cacheB.read(d, async () => ({ version: 'new' }))).version, 'new');
        release(); await old;
        assert.equal((await cacheA.read(d, async () => { throw new Error('stale fill replaced new cache'); })).version, 'new');
      });
      await t.test('invalidation after a fill check still prevents an older committed row from being served', async () => {
        const d = publicCacheDescriptor({ kind: 'detail', locale: 'en', now: p.now(), fixtureId: state.fixture.id,
          query: { commitRace: true }, parse: value => value });
        let release, began; const gate = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { began = resolve; });
        const paused = { query: p.a.query, transaction: (operation, options) => p.a.transaction(tx => operation(new Proxy(tx, {
          get(target, key) {
            if (key === 'publicResponseCache') return { upsert: async input => { began(); await gate; return target.publicResponseCache.upsert(input); } };
            return Reflect.get(target, key);
          },
        })), options) };
        const stamp = (await storeA.lookup(d.key, d.tags)).generations;
        const old = createMysqlPublicCacheStore(paused).fill(d.key, d.tags, stamp, { version: 'old' }, p.now(), p.now() + 5000);
        await ready;
        await p.b.query(tx => tx.footballFixture.update({ where: { id: state.fixture.id }, data: { dataVersion: { increment: 1 } } }));
        await cacheB.read(d, async () => ({ version: 'new' }));
        release();
        // Prisma may reject the old snapshot's insert on the newer unique row.
        // Either the newer row survives, or an overwritten old stamp is a miss.
        let conflict = false;
        try { await old; } catch (error) { assert.equal(error.code, 'constraint'); conflict = true; }
        const stored = (await storeB.lookup(d.key, d.tags)).value;
        assert.ok(conflict ? stored?.version === 'new' : stored === null);
        assert.notEqual((await cacheB.read(d, async () => ({ version: 'latest' }))).version, 'old');
      });
      await t.test('lost notifications, duplicate consumers and late commits recover without a time watermark', async () => {
        const pending = await p.a.query(tx => tx.publicCacheInvalidation.count({ where: { acknowledgedAt: null } })); assert.ok(pending > 0);
        let acknowledged = 0;
        for (let pass = 0; pass < 30; pass++) {
          const both = await Promise.all([storeA.reconcile(1000), storeB.reconcile(1000)]);
          const count = both.reduce((sum, receipt) => sum + receipt.acknowledged, 0); acknowledged += count; if (!count) break;
        }
        assert.equal(acknowledged, pending); assert.equal((await storeA.reconcile()).acknowledged, 0);
        const admin = createDatabase(parseRuntimePolicy({ ...p.env, TEST_DATABASE_URL: p.env.MIGRATION_DATABASE_URL }));
        try {
          await admin.query(tx => tx.publicCacheInvalidation.create({ data: { tag: 'incomplete-invalidation', generation: 1n, at: new Date() } }));
          await assert.rejects(storeA.reconcile(1000));
          assert.equal(await p.a.query(tx => tx.publicCacheInvalidation.count({ where: { acknowledgedAt: null } })), 1);
          await admin.query(tx => tx.publicCacheTag.create({ data: { tag: 'incomplete-invalidation', generation: 1n } }));
          assert.equal((await storeA.reconcile(1000)).acknowledged, 1);
          let release, began; const gate = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { began = resolve; });
          const late = admin.transaction(async tx => {
            await tx.publicCacheTag.create({ data: { tag: 'late-commit', generation: 1n } });
            await tx.publicCacheInvalidation.create({ data: { tag: 'late-commit', generation: 1n, at: new Date(0) } });
            began(); await gate;
          });
          await ready;
          await p.a.query(tx => tx.footballFixture.update({ where: { id: state.fixture.id }, data: { dataVersion: { increment: 1 } } }));
          assert.ok((await storeA.reconcile(1000)).acknowledged > 0);
          release(); await late;
          assert.equal((await storeB.reconcile(1000)).acknowledged, 1);
        } finally { await admin.disconnect(); }
      });
      await t.test('source rollback leaves its generation unchanged and visitors only mutate cache storage', async () => {
        const d = publicCacheDescriptor({ kind: 'detail', locale: 'en', now: p.now(), fixtureId: state.fixture.id,
          query: { rollback: true }, parse: value => value });
        const stamp = (await storeA.lookup(d.key, d.tags)).generations;
        await assert.rejects(p.a.transaction(async tx => {
          await tx.footballFixture.update({ where: { id: state.fixture.id }, data: { dataVersion: { increment: 1 } } });
          throw new Error('synthetic crash before commit');
        }));
        assert.deepEqual((await storeB.lookup(d.key, d.tags)).generations, stamp);
        const counts = () => p.a.query(async tx => ({ fixtures: await tx.footballFixture.count(), forecasts: await tx.predictionSet.count(),
          evidence: await tx.fixtureEvidenceSnapshot.count(), jobs: await tx.durableJob.count(), changes: await tx.predictionChangeEvent.count(),
          settlements: await tx.marketSettlementRevision.count(), results: await tx.fixtureResult.count() }));
        const before = await counts();
        await feedRead(); await detailRead(); await performanceRead(); await replicaDetail.query(state.fixture.id, params(`revision=${state.revision.id}`));
        assert.deepEqual(await counts(), before);
      });
      await t.test('cache outage uses stored reads; database outage cannot serve a warm response', async () => {
        await p.instance.executeAdmin("REVOKE SELECT ON goal_hint_test.PublicResponseCache FROM 'cutoff_app'@'127.0.0.1'");
        try { assert.equal((await detailRead()).snapshot.revisionId, state.revision.id); }
        finally { await p.instance.executeAdmin("GRANT SELECT ON goal_hint_test.PublicResponseCache TO 'cutoff_app'@'127.0.0.1'"); }
        const broken = { lookup: async () => { throw new Error('cache down'); }, fill: async () => { throw new Error('cache down'); }, reconcile: storeA.reconcile };
        const fallback = createMatchDetailService({ database: p.a, cache: createPublicResponseCache(broken, p.now), clock });
        assert.equal((await fallback.query(state.fixture.id)).snapshot.revisionId, state.revision.id);
        const down = { transaction: async () => { throw new Error('database down'); }, query: async () => { throw new Error('database down'); } };
        const failed = createMatchDetailService({ database: down, cache: createMysqlPublicResponseCache(down, p.now), clock });
        await assert.rejects(failed.query(state.fixture.id), e => e.code === 'unavailable');
      });
      await t.test('measured active lifetime, EAT rollover and source permission expiry', async () => {
        p.setTime(p.now() + 10_000);
        const first = await detailRead(); p.setTime(p.now() + 4999);
        assert.deepEqual(await detailRead(), first); p.setTime(p.now() + 1);
        assert.notEqual((await detailRead()).asOf, first.asOf);
        const expiry = Math.min(...state.snapshot.sources.map(source => source.reuse.retainUntil));
        p.setTime(expiry - 1); const permitted = await detailRead(); assert.equal(permitted.snapshot.analysis.state, 'available');
        p.setTime(expiry + 1); assert.equal((await detailRead()).snapshot.analysis.state, 'withheld');
        p.setTime(Date.parse('2026-10-09T20:59:59.999Z')); const yesterday = await feed.query(params(''));
        p.setTime(p.now() + 1); const today = await feed.query(params(''));
        assert.equal(yesterday.today, '2026-10-09'); assert.equal(today.today, '2026-10-10');
        assert.equal(today.range.from, today.today);
        t.diagnostic('Measured virtual-clock cache age: hit at 4,999 ms, refresh at 5,000 ms; 15/60-second observations plus cache <=20/65 seconds before worker processing.');
      });
      assert.equal(network, 0);
      await t.test('private maintenance command uses approved database access and rejects unbounded batches', async () => {
        const result = await execute(process.execPath, ['--conditions=react-server', 'scripts/public-cache-reconcile.mjs', '100'],
          { env: p.env, windowsHide: true, timeout: 30_000 });
        const receipt = JSON.parse(result.stdout); assert.ok(receipt.acknowledged >= 0); assert.ok(receipt.removed >= 0);
        await assert.rejects(execute(process.execPath, ['--conditions=react-server', 'scripts/public-cache-reconcile.mjs', '1001'],
          { env: p.env, windowsHide: true, timeout: 30_000 }), error => !error.stderr.includes(p.env.MIGRATION_DATABASE_URL));
      });
    } finally { globalThis.fetch = originalFetch; }
  });
});

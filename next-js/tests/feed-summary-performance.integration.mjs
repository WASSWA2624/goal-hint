import assert from 'node:assert/strict';
import test from 'node:test';
import { checkedFeedPerformance, emptyFeedPerformanceReply, feedPerformanceApiHref, retainedFeedPerformance,
  selectFeedSummaryResult } from '../src/domain/feed-performance-summary.ts';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { gateFeedResponse } from '../src/domain/paywall.ts';
import { createMysqlPublicResponseCache } from '../src/server/cache/mysql-public-cache.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { createMatchFeedSummaryService } from '../src/server/matches/feed-summary-service.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { catalogFixture, catalogRequest, catalogResponse, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { lifecycleAuthority, lifecycleInput, lifecyclePolicy } from './helpers/lifecycle-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

test('compact summaries match full stored feed counts and invalidate on genuine isolated MySQL', { timeout: 360_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const states = [];
    for (const id of [3000, 3001]) {
      const state = await p.setup(id);
      assert.equal((await p.publisher.publish(state.input, state.lease)).refresh.outcome, 'published');
      await p.queue.acknowledge(state.lease); states.push(state);
    }
    const clock = { now: () => PUBLICATION_NOW }, cache = createMysqlPublicResponseCache(p.a, clock.now);
    const options = { database: p.a, competitionIds: [39], clock, cache };
    const feed = createMatchFeedService(options), summary = createMatchFeedSummaryService(options);
    async function compare(input) {
      const { result, ...cohort } = input;
      const full = await feed.query(cohort), compact = await summary.query(input);
      const { cancelled, ...counts } = compact.performance;
      // The legacy inline aggregate includes cancellations in voids.
      assert.deepEqual({ ...counts, void: counts.void + cancelled }, full.performance, JSON.stringify(input));
      assert.equal(compact.total, full.total);
      assert.equal(compact.paginationVersion, full.performanceVersion);
      if (result) assert.equal((await feed.query(input)).performanceVersion, compact.paginationVersion);
      assert.equal(compact.asOf, full.asOf);
      return compact;
    }
    for (const parameters of [{}, { page: '2', pageSize: '1' }, { page: '10000' }, { picks: 'only' },
      { status: 'scheduled' }, { status: 'live' }, { status: 'finished' }, { result: 'pending' }, { result: 'won' },
      { prob: '60-100' }, { market: 'total-goals' },
      { market: 'match-result', sort: 'probability', dir: 'asc' }, { country: 'Synthetic Country' },
      { q: 'Synthetic' }, { when: 'today' }, { when: 'next-7-days' }, { tz: 'America/New_York' },
      { start: '2026-10-09T09:00', end: '2026-10-10T17:00', status: 'finished' }]) {
      await compare(parameters.when || parameters.start ? parameters : { date: '2026-10-09', ...parameters });
    }
    const before = await compare({ date: '2026-10-09', picks: 'only' });
    const state = states[0];
    await p.first.voidCycle({ ...p.target(state), actor: 'synthetic-summary-test', reason: 'formal-postponement', evidenceRef: 'synthetic-void-proof' });
    const after = await compare({ date: '2026-10-09', picks: 'only' });
    assert.notEqual(after.paginationVersion, before.paginationVersion);
    assert.equal(after.performance.void, before.performance.void + 1);
    assert.deepEqual(await summary.query({ date: '2026-10-09', picks: 'only' }), after, 'repeated compact reads retain authoritative cached counts');
    await t.test('348 filtered fixtures and 37 original predictions retain one summary across search, pagination, and every outcome', async () => {
      const dates = { from: '2026-10-14', to: '2026-10-20' }, date = dates.to;
      const selectionAt = Date.parse(`${date}T08:00:00Z`), publicationAt = selectionAt + 4_000, kickoffAt = publicationAt + 301_000;
      p.setTime(selectionAt);
      for (let day = 14, offset = 0; day < 20; day++) {
        const date = `2026-10-${day}`, length = day === 19 ? 51 : 52;
        const score = { home: 1, away: 0 };
        const rows = Array.from({ length }, (_, index) => catalogFixture(56_000 + offset + index, {
          kickoff: `${date}T12:00:00Z`, status: 'FT', homeId: 4510, awayId: 4520, goals: score, score: { fulltime: score },
        }));
        offset += length;
        const source = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, rows) });
        source.clock.value = p.now();
        const importResult = await createFootballCatalogImporter({ adapter: source.adapter, store: p.catalog,
          authority: catalogSelectionAuthority, clock: source.clock }).import(catalogRequest({ kind: 'fixtures', query: { date } }, p.now()));
        assert.equal(importResult.importedCount, length);
      }
      const firstProviderId = 57_000;
      const rows = Array.from({ length: 37 }, (_, index) => catalogFixture(firstProviderId + index, {
        homeId: 8510, awayId: 8520, kickoff: new Date(kickoffAt).toISOString(),
      }));
      await p.cohort(date, p.first, { rows, selectionAt, afterSelectionAt: publicationAt });
      const published = [];
      for (let index = 0; index < rows.length; index++) {
        const state = await p.setup(firstProviderId + index, date, { publicationAt });
        const receipt = await p.publisher.publish(state.input, state.lease);
        assert.equal(receipt.refresh.outcome, 'published');
        await p.queue.acknowledge(state.lease);
        published.push(state);
      }
      p.setTime(published[0].cycle.cutoffAt);
      for (const state of published.slice(0, 2)) await p.first.close(p.target(state));
      await p.first.voidCycle({ ...p.target(published[2]), actor: 'cohort-summary-test',
        reason: 'formal-postponement', evidenceRef: 'synthetic-cohort-void-proof' });
      p.setTime(kickoffAt + 8_000_000);
      const accountId = resultHash('full-cohort-summary-results');
      await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
      const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
      const resultStore = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
      const observations = [[0, 'FT', 2, 0], [1, 'FT', 0, 2], [3, 'CANC', null, null]].map(([index, status, home, away]) =>
        parseLifecycleInput(lifecycleInput(published[index], p.now(), { status,
          ...(status === 'FT' ? { raw: { goals: { home, away }, score: { fulltime: { home, away } } } } : {}),
        })));
      const lease = await resultStore.acquire(resultHash('full-cohort-summary-result-owner'), 30_000);
      assert.ok(lease);
      const batch = { id: resultHash('full-cohort-summary-batch'), accountId, policyHash: resultHash('full-cohort-summary-policy'),
        receivedAt: p.now(), channel: 'ids', date: null, requestedIds: [firstProviderId, firstProviderId + 1, firstProviderId + 3],
        observations, error: null, requestsDispatched: 1 };
      try { await resultStore.save(lease, batch); await resultStore.apply(lease, batch); } finally { await resultStore.release(lease); }
      const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
      for (const state of published.slice(0, 2)) await settlement.settleFixture(state.fixture.id);

      const clock = { now: () => p.now() }, cache = createMysqlPublicResponseCache(p.a, clock.now);
      const options = { database: p.a, competitionIds: [39], clock, cache };
      const list = createMatchFeedService({ ...options, includePerformance: false }), stats = createMatchFeedSummaryService(options);
      const scope = { publishedForecasts: true }, full = { tier: 'full', signedIn: false };
      const all = { total: 348, won: 1, lost: 1, pending: 33, void: 1, cancelled: 1, unavailable: 311 };
      const { total, unavailable, ...outcomes } = all;
      assert.equal(total - unavailable, 37);
      const comparedIds = new Set();
      for (const q of [undefined, 'Synthetic']) {
        const applied = { ...dates, ...(q === undefined ? {} : { q }) };
        const query = parseFeedQuery({ ...applied, page: '4' }, { today: date });
        const first = await list.query(applied, scope), fourth = await list.query({ ...applied, page: '4' }, scope);
        assert.equal(first.total, total);
        assert.equal(fourth.total, total);
        assert.equal(fourth.page, 4);
        assert.equal(first.coverage.matchingWithPerformancePick, 37);
        assert.ok(fourth.records.every(({ fixtureId }) => first.records.every((item) => item.fixtureId !== fixtureId)));
        const same = await stats.query({ ...applied, page: '4' }, scope);
        const { total: summaryTotal, ...response } = same;
        assert.equal(summaryTotal, total);
        const seed = { href: feedPerformanceApiHref(query, date), reply: { ...response, access: full } };
        assert.deepEqual(seed.reply.performance, all);
        comparedIds.add(seed.reply.paginationVersion);
        for (const [result, count] of Object.entries(outcomes)) {
          const selected = selectFeedSummaryResult(query, result);
          assert.equal(selected.page, 1);
          assert.equal(selected.search, q ?? '');
          const narrowed = await list.query({ ...applied, result, page: String(selected.page) }, scope);
          assert.equal(narrowed.total, count, result);
          assert.equal(narrowed.records.length, count, result);
          assert.ok(narrowed.records.every(({ forecast }) => forecast !== null), 'unavailable never becomes pending or another outcome');
          assert.deepEqual(await stats.query({ ...applied, result }, scope), same);
          assert.equal(retainedFeedPerformance(seed, feedPerformanceApiHref(selected, date), gateFeedResponse(narrowed, full)), seed);
        }
      }
      assert.equal(comparedIds.size, 2, 'accepted search has its own summary identity even when all fixtures match');
      const noPicks = await list.query({ date: dates.from }, scope), zeroQuery = parseFeedQuery({ date: dates.from }, { today: date });
      assert.equal(noPicks.total, 52);
      assert.deepEqual(emptyFeedPerformanceReply(zeroQuery, gateFeedResponse(noPicks, full))?.performance,
        { total: 52, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0, unavailable: 52 });
      const recentList = gateFeedResponse(await list.query(dates, scope), full);
      assert.throws(() => checkedFeedPerformance({ performance: all, asOf: recentList.asOf,
        paginationVersion: '0'.repeat(64), access: full }, recentList), (error) => error.code === 'changed');

      // Grow the disposable catalog with bulk synthetic fixtures. The published
      // outcomes still come from the verified pipeline above.
      const seedFixture = await p.catalog.fixtureByProviderId(56_000);
      const addFixtures = (size, firstId, firstDay, daySpan) => p.a.query(tx => tx.$executeRaw`
        INSERT INTO FootballFixture
          (id,provider,externalId,homeTeamId,awayTeamId,seasonId,kickoff,eatDate,status,providerStatus,retrievedAt,updatedAt)
        SELECT UUID(),f.provider,${firstId}+cohort.item,f.homeTeamId,f.awayTeamId,f.seasonId,
          TIMESTAMPADD(DAY,MOD(cohort.item,${daySpan}),${new Date(`${firstDay}T12:00:00Z`)}),
          DATE(TIMESTAMPADD(DAY,MOD(cohort.item,${daySpan}),${new Date(`${firstDay}T12:00:00Z`)})),
          'scheduled','NS',f.retrievedAt,f.updatedAt
        FROM FootballFixture f CROSS JOIN JSON_TABLE(${JSON.stringify(Array.from({ length: size }, (_, index) => index))},
          '$[*]' COLUMNS (item INT PATH '$')) AS cohort WHERE f.id=${seedFixture.id}`);
      await addFixtures(1_080 - noPicks.total, 60_000, dates.from, 1);
      const coldOptions = { database: p.a, competitionIds: [39], clock };
      const coldList = createMatchFeedService({ ...coldOptions, includePerformance: false });
      const coldStats = createMatchFeedSummaryService(coldOptions);
      const largeDay = { date: dates.from };
      const pageOne = await coldList.query(largeDay, scope), pageTwo = await coldList.query({ ...largeDay, page: '2' }, scope);
      assert.equal(pageOne.total, 1_080);
      assert.equal(pageOne.records.length, 50);
      assert.equal(pageTwo.records.length, 50);
      assert.equal(new Set([...pageOne.records, ...pageTwo.records].map(item => item.fixtureId)).size, 100);
      assert.equal((await coldStats.query(largeDay, scope)).performance.unavailable, 1_080);

      const missing = 14_010 - (await coldList.query({}, scope)).coverage.knownFixtures;
      assert.ok(missing > 0);
      await addFixtures(missing, 62_000, '2026-09-21', 23);
      const publicScope = { ...scope, predictedMatchesOnly: true };
      const samples = { day: [], broadList: [], broadStats: [] };
      const timed = async (group, read) => {
        const started = performance.now(), result = await read();
        samples[group].push(Math.round(performance.now() - started));
        return result;
      };
      for (let run = 0; run < 5; run++) {
        const day = await timed('day', () => coldList.query(largeDay, scope));
        const broadList = await timed('broadList', () => coldList.query({}, publicScope));
        const broadStats = await timed('broadStats', () => coldStats.query({}, scope));
        assert.equal(day.total, 1_080);
        assert.equal(broadList.coverage.knownFixtures, 14_010);
        assert.equal(broadStats.performance.total, 14_010);
        assert.equal(broadStats.paginationVersion, broadList.performanceVersion);
      }
      t.diagnostic(`Uncached MySQL list and summary samples in milliseconds: ${JSON.stringify(samples)}`);
    });
  }, { migrationTimeoutMs: 240_000 });
});

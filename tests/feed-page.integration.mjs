import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { parseReportingDate, utcInstantFromEpochMilliseconds } from '../src/domain/calendar.ts';
import { loadMatchFeedPage } from '../src/server/matches/feed-page.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { createMysqlPublicResponseCache } from '../src/server/cache/mysql-public-cache.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { catalogFixture, catalogRequest, catalogResponse, createSyntheticCatalogAdapter, CATALOG_NOW } from './helpers/catalog-fixtures.mjs';
import { catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { lifecycleAuthority, lifecyclePolicy, lifecycleInput } from './helpers/lifecycle-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { appendFeedPage, initialLoadedFeed, replaceFeedPages } from '../src/domain/feed-pagination.ts';

async function saveScenarios(t, captured) {
  if (!process.env.MATCH_FEED_PAGE_CAPTURE) return;
  const target = path.resolve(process.env.MATCH_FEED_PAGE_CAPTURE), root = await realpath(fileURLToPath(new URL('../.tmp', import.meta.url)));
  const relative = path.relative(root, await realpath(path.dirname(target)));
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  let previous = {};
  try { previous = JSON.parse(await readFile(target, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const scenarios = { ...previous, ...captured };
  await writeFile(target, JSON.stringify(scenarios));
  t.diagnostic(`Saved isolated page acceptance projections; ${Object.keys(scenarios).length} scenarios.`);
}

test('match page handoff uses genuine stored fixtures, cache, coverage and locked results', { timeout: 240_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const today = parseReportingDate('2026-10-09'), captured = {};
    const rows = Array.from({ length: 35 }, (_, index) => catalogFixture(3000 + index, {
      homeId: 6000 + index * 2, awayId: 6001 + index * 2,
      kickoff: index < 32 ? new Date(Date.parse('2026-10-09T12:00:00Z') + Math.floor(index / 2) * 60_000).toISOString()
        : ['2026-10-09T21:00:00Z', '2026-10-15T20:59:59Z', '2026-10-15T21:00:00Z'][index - 32],
    }));
    rows[0].teams.home.name = 'Synthetic International Football Club ' + 'LongHomeIdentifier'.repeat(10);
    rows[0].teams.away.name = 'Synthetic Association Football Club ' + 'LongAwayIdentifier'.repeat(10);
    rows[31].teams.home.name = 'Beyond Page Alias';
    const cohort = await p.cohort(today, p.first, { rows });
    const state = await p.setup(3000), other = await p.setup(3001), unlocked = await p.setup(3002);
    for (const item of [state, other]) {
      assert.equal((await p.publisher.publish(item.input, item.lease)).refresh.outcome, 'published');
      await p.queue.acknowledge(item.lease);
    }
    await p.first.closeObservedPlay({ ...unlocked.input.observation, status: 'live', actualStartedAt: PUBLICATION_NOW - 1 });
    const cache = createMysqlPublicResponseCache(p.a);
    const read = (parameters, context, clock) => createMatchFeedService({ database: p.a, cache, competitionIds: [39], clock }).query(parameters, context);
    async function capture(name, parameters = {}, at = PUBLICATION_NOW) {
      const day = parseReportingDate(at >= Date.parse('2026-10-20T00:00:00Z') ? '2026-10-20' : '2026-10-09');
      const query = parseFeedQuery(parameters, { today: day });
      const result = await loadMatchFeedPage(query, day, { now: () => utcInstantFromEpochMilliseconds(at) }, read);
      assert.equal(result.error, null); captured[name] = { query, today: day, result }; return result.data;
    }
    let importAt = CATALOG_NOW + 1000;
    async function importDate(date, values = [], options = {}) {
      const provider = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, values, options) });
      provider.clock.value = importAt++;
      return createFootballCatalogImporter({ adapter: provider.adapter, store: p.catalog, authority: catalogSelectionAuthority, clock: provider.clock })
        .import(catalogRequest({ kind: 'fixtures', query: { date } }, provider.clock.value));
    }

    await t.test('initial handoff is the first 30 stored cards in stable kickoff/fixture order', async () => {
      const data = await capture('today');
      assert.equal(data.records.length, 30); assert.equal(data.total, 32); assert.equal(data.nextPage, 2);
      assert.equal(data.run.completed, 2); assert.equal(data.run.total, 34);
      const sorted = [...data.records].sort((a, b) => a.kickoffAt - b.kickoffAt || a.fixtureId.localeCompare(b.fixtureId));
      assert.deepEqual(data.records, sorted); assert.equal(data.state, 'ready');
      const published = data.records.find((record) => record.fixtureId === state.fixture.id);
      assert.equal(published.forecast.publishedAt, PUBLICATION_NOW); assert.notEqual(published.syncedAt, data.asOf);
      const closed = data.records.find((record) => record.fixtureId === unlocked.fixture.id);
      assert.equal(closed.cycle.state, 'closed'); assert.equal(closed.forecast, null);
    });
    await t.test('tomorrow, next seven days, final inclusive instant and exclusive boundary', async () => {
      assert.equal((await capture('tomorrow', { when: 'tomorrow' })).records.length, 1);
      const seven = await capture('seven', { when: 'next-7-days' }); assert.equal(seven.total, 34);
      const last = await capture('last-day', { date: '2026-10-15' });
      assert.equal(last.records[0].kickoffAt, Date.parse('2026-10-15T20:59:59Z')); assert.equal(last.records[0].availabilityMessage, null);
      await importDate('2026-10-16', [rows[34]]);
      const outside = await capture('outside', { date: '2026-10-16' });
      assert.ok(outside.records[0].availabilityMessage); assert.equal(outside.run, null);
      await capture('unavailable-predictions', { date: '2026-10-10' });
    });
    await t.test('control queries search aliases beyond page one and return complete league options', async () => {
      const renamed = structuredClone(rows[31]); renamed.teams.home.name = 'Canonical Renamed Club';
      renamed.teams.home.country = 'Faraway Land'; renamed.league.name = 'Canonical League';
      const provider = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, [renamed]) });
      provider.clock.value = importAt++;
      await createFootballCatalogImporter({ adapter: provider.adapter, store: p.catalog, authority: catalogSelectionAuthority, clock: provider.clock })
        .import(catalogRequest({ kind: 'fixtures', query: { fixtureId: 3031 } }, provider.clock.value));
      const alias = await capture('search-alias', { q: 'bEyOnD pAgE aLiAs' });
      assert.equal(alias.total, 1); assert.equal(alias.records[0].homeTeam.name, 'Canonical Renamed Club');
      assert.ok(!captured.today.result.data.records.some((item) => item.fixtureId === alias.records[0].fixtureId));
      const country = await capture('search-country', { q: 'FARAWAY LAND' }); assert.equal(country.total, 1);
      assert.equal((await capture('search-league-alias', { q: 'SYNTHETIC COMPETITION 39' })).total, 32);
      assert.equal((await capture('search-league', { q: 'CANONICAL LEAGUE' })).total, 32);
      const empty = await capture('search-empty', { q: 'No such team' }); assert.equal(empty.state, 'no-filter-matches');
      assert.deepEqual(empty.leagues, alias.leagues); assert.equal(empty.leagues.length, 1);
      await capture('league-selected', { league: alias.leagues[0].id });
      await capture('live-selected', { status: 'live' });
      await capture('second-page', { page: '2' });
      for (const market of ['match-result', 'total-goals', 'double-chance', 'both-teams-to-score']) {
        const data = await capture(`probability-${market}`, { market, sort: 'probability' });
        assert.equal(data.records.length, 30);
        const valued = data.records.filter((item) => item.forecast?.markets.some((entry) => entry.market.family === market));
        assert.equal(valued.length, 2);
        assert.deepEqual(data.records.slice(0, 2).map((item) => item.fixtureId), valued.map((item) => item.fixtureId));
      }
      await capture('seven-search', { when: 'next-7-days', q: 'bEyOnD pAgE aLiAs' });
    });
    await t.test('coverage distinguishes confirmed empty, unknown, partial and failed imports', async () => {
      await importDate('2026-10-08'); assert.equal((await capture('empty', { date: '2026-10-08' })).state, 'no-fixtures');
      await importDate('2026-10-08', [], { paging: { current: 1, total: 2 } });
      assert.equal((await capture('partial-empty', { date: '2026-10-08' })).state, 'data-unavailable');
      await importDate('2026-10-07', [], { status: 500 });
      assert.equal((await capture('failed-import', { date: '2026-10-07' })).coverage.dates[0].status, 'failed');
      assert.equal((await capture('unknown', { date: '2026-10-06' })).coverage.dates[0].status, 'unknown');
      await importDate('2026-10-09', [rows[0]], { paging: { current: 1, total: 2 } });
      const partial = await capture('partial'); assert.equal(partial.records.length, 30);
      assert.equal(partial.coverage.partial, true); assert.ok(partial.records.some((item) => item.forecast));
      await capture('no-filter-matches', { status: 'finished' });
      await capture('page-out-of-range', { page: '10000' });
    });
    await t.test('historical results keep the locked revision, real score and audited outcome', async () => {
      p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state));
      const accountId = resultHash('feed-page-results');
      await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
      const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
      const store = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
      p.setTime(state.cycle.kickoffAt + 7_200_000);
      const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status: 'FT', raw: { goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } } } }));
      const lease = await store.acquire(resultHash('feed-page-result-owner'), 30_000); assert.ok(lease);
      const batch = { id: resultHash('feed-page-result'), accountId, policyHash: resultHash('feed-page-result-policy'), receivedAt: p.now(),
        channel: 'ids', date: null, requestedIds: [3000], observations: [observation], error: null, requestsDispatched: 1 };
      try { await store.save(lease, batch); await store.apply(lease, batch); } finally { await store.release(lease); }
      await createMarketSettlementService({ database: p.a, queue: p.queue }).settleFixture(state.fixture.id);
      const history = await capture('historical', { date: '2026-10-09', status: 'finished' }, Date.parse('2026-10-20T08:00:00Z'));
      assert.equal(history.records.length, 1); assert.equal(history.records[0].cycle.mode, 'locked');
      assert.equal(history.records[0].forecast.revisionId, (await p.history.findCycle(state.cycle.id)).lockedSetId);
      assert.equal(history.records[0].forecast.publishedAt, PUBLICATION_NOW); assert.equal(history.records[0].syncedAt, p.now());
      assert.equal(history.records[0].forecast.markets.find((item) => item.market.family === 'match-result').outcome.status, 'correct');
      assert.deepEqual(history.records[0].score, { home: 2, away: 1 }); assert.equal(history.run, null);
    });
    await t.test('repeated page requests preserve forecasts and cause no provider or prediction work', async () => {
      const counts = () => p.a.query(async (tx) => ({ jobs: await tx.durableJob.count(), sets: await tx.predictionSet.count(),
        results: await tx.fixtureResult.count(), changes: await tx.predictionChangeEvent.count() }));
      const before = await counts(), requests = cohort.provider.network.length, originalFetch = globalThis.fetch;
      let network = 0; globalThis.fetch = async () => { network++; throw new Error('Public reads cannot fetch providers'); };
      try { for (let index = 0; index < 3; index++) await capture(`repeat-${index}`); }
      finally { globalThis.fetch = originalFetch; }
      assert.equal(network, 0); assert.equal(cohort.provider.network.length, requests); assert.deepEqual(await counts(), before);
      assert.deepEqual(captured['repeat-0'], captured['repeat-2']);
    });
    captured.failure = { query: parseFeedQuery({}, { today }), today, result: { data: null, error: 'unavailable' } };
    captured.busy = { query: parseFeedQuery({ q: 'Synthetic' }, { today }), today, result: { data: null, error: 'rate-limited' } };
    for (const [name, phase] of [['not-started', 'not-started'], ['selecting', 'selecting'], ['complete', 'complete'], ['partial-run', 'partial']]) {
      const scenario = structuredClone(captured.today), run = scenario.result.data.run;
      run.phase = phase;
      if (phase === 'not-started' || phase === 'selecting') { run.total = null; run.completed = 0; run.terminal = 0; run.published = 0; }
      if (phase === 'partial') { run.failed = 1; run.terminal = run.completed + 1; run.partialCoverage = true; }
      if (phase === 'complete') { run.completed = run.total; run.terminal = run.total; }
      captured[name] = scenario;
    }
    // Captured SQL projections and explicitly synthetic presentation variants remain test-only.
    await saveScenarios(t, captured);
  });
});

test('pagination detects genuine cohort changes and supplies consistent multi-page restoration', { timeout: 240_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const today = parseReportingDate('2026-10-09'), captured = {};
    const rows = Array.from({ length: 95 }, (_, index) => {
      const row = catalogFixture(4000 + index, { homeId: 8000 + index * 2, awayId: 8001 + index * 2,
        kickoff: new Date(Date.parse('2026-10-09T12:00:00Z') + index * 60_000).toISOString() });
      row.teams.home.name = `Pagination Home ${index}`; row.teams.away.name = `Pagination Away ${index}`; return row;
    });
    const cohort = await p.cohort(today, p.first, { rows });
    const clock = { now: () => PUBLICATION_NOW }, cache = createMysqlPublicResponseCache(p.a);
    const service = createMatchFeedService({ database: p.a, cache, competitionIds: [39], clock });
    async function capture(prefix, page) {
      const query = parseFeedQuery({ q: 'Pagination', page: String(page) }, { today });
      const result = await loadMatchFeedPage(query, today, clock, (parameters, context) => service.query(parameters, context));
      assert.equal(result.error, null); captured[`${prefix}-${page}`] = { query, today, result }; return result.data;
    }
    const pages = [];
    for (let page = 1; page <= 4; page++) pages.push(await capture('pagination', page));
    assert.deepEqual(pages.map(page=>page.records.length), [30,30,30,5]);
    assert.equal(new Set(pages.map(page=>page.paginationVersion)).size,1);
    let loaded = initialLoadedFeed(pages[0]); for (const page of pages.slice(1)) loaded = appendFeedPage(loaded,page);
    assert.equal(loaded.records.length,95); assert.equal(new Set(loaded.records.map(item=>item.fixtureId)).size,95);
    assert.equal((await capture('pagination-repeat',1)).paginationVersion,pages[0].paginationVersion);

    // Move a fixture from the last page to the beginning without changing totals.
    const moved = await p.setup(4094);
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    await lifecycle.observe(lifecycleInput(moved,p.now(),{kickoffAt:Date.parse('2026-10-09T11:59:00Z')}));
    const updated=[];for(let page=1;page<=4;page++)updated.push(await capture('pagination-changed',page));
    assert.notEqual(updated[0].paginationVersion,pages[0].paginationVersion);
    assert.equal(updated[0].total,pages[0].total);assert.equal(updated[0].records[0].fixtureId,pages[3].records.at(-1).fixtureId);
    assert.throws(()=>appendFeedPage(initialLoadedFeed(pages[0]),updated[1]),error=>error.code==='changed');
    assert.equal(loaded.records.length,95);
    const refreshed=replaceFeedPages(loaded,updated);assert.equal(refreshed.records.length,95);
    assert.deepEqual(refreshed.records.map(item=>item.fixtureId),updated.flatMap(page=>page.records.map(item=>item.fixtureId)));

    // Publication changes the token even when only probability order can move.
    const state=await p.setup(4000);assert.equal((await p.publisher.publish(state.input,state.lease)).refresh.outcome,'published');
    const published=await capture('pagination-published',1);assert.notEqual(published.paginationVersion,updated[0].paginationVersion);
    const token=published.paginationVersion;await p.queue.acknowledge(state.lease);
    assert.equal((await capture('pagination-acknowledged',1)).paginationVersion,token);
    const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw new Error('Stored pagination cannot call providers');};
    const before=cohort.provider.network.length;
    try { for(let page=1;page<=4;page++) await service.query({date:today,q:'Pagination',page:String(page)}); }
    finally {globalThis.fetch=originalFetch;}
    assert.equal(network,0);assert.equal(cohort.provider.network.length,before);
    await saveScenarios(t,captured);
  });
});

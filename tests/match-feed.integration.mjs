import assert from 'node:assert/strict';
import { execFile } from "./helpers/command-runtime.mjs";
import { promisify } from 'node:util';
import test from 'node:test';
import { matchFeedResponseSchema, matchFeedRules } from '../src/domain/match-feed.ts';
import { parseFixtureSnapshot } from '../src/domain/fixture-snapshot.ts';
import { selectedCardPrice } from '../src/domain/match-card.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { createMatchFeedHandler } from '../src/server/matches/feed-http.ts';
import { createMysqlPublicSearchLimiter } from '../src/server/matches/search-limit.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { createMysqlOddsStore } from '../src/server/odds/odds-mysql-store.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { catalogFixture, catalogRequest, catalogResponse, createSyntheticCatalogAdapter, CATALOG_NOW } from './helpers/catalog-fixtures.mjs';
import { catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { historyCandidate, cycleCreation } from './helpers/prediction-history-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';
import { lifecycleAuthority, lifecyclePolicy, lifecycleInput } from './helpers/lifecycle-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { createSyntheticOddsAdapter, launchBetCatalog, launchBets, oddsAuthority, oddsBounds, oddsHash, oddsPolicy, oddsRequest, offsetTime,
  rawOddsRow } from './helpers/odds-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const execute = promisify(execFile), period = 'regulation-including-stoppage-time';
const groups = (home, over) => ({
  'match-result': { period, probabilities: { 'home-win': home, draw: 0.2, 'away-win': Number((0.8 - home).toFixed(6)) } },
  'total-goals': { period, line: 2.5, probabilities: { 'over-2.5': over, 'under-2.5': Number((1 - over).toFixed(6)) } },
  'both-teams-to-score': { period, probabilities: { yes: 0.6, no: 0.4 } },
});

test('stored public match feed on genuine isolated MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const rows = Array.from({ length: 75 }, (_, index) => catalogFixture(3000 + index, {
      homeId: 6000 + index * 2, awayId: 6001 + index * 2,
      kickoff: index < 70 ? new Date(Date.parse('2026-10-09T10:00:00Z') + index * 60_000).toISOString()
        : ['2026-10-08T21:00:00Z', '2026-10-09T20:59:59Z', '2026-10-09T21:00:00Z', '2026-10-14T21:00:00Z', '2026-10-15T21:00:00Z'][index - 70],
    }));
    rows[65].teams.home.name = 'Beyond Page Alias';
    const cohort = await p.cohort('2026-10-09', p.first, { rows });
    let readAt = PUBLICATION_NOW, importAt = CATALOG_NOW + 1000;
    const service = createMatchFeedService({ database: p.a, competitionIds: [39], clock: { now: () => readAt } });
    const query = (parameters = {}) => service.query({ date: '2026-10-09', ...parameters });
    const fixture = (id) => p.catalog.fixtureByProviderId(id);
    const providerStates = [cohort.provider], published = new Map();
    async function importRows(values, selection, responseOptions = {}) {
      const provider = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, values, responseOptions) });
      provider.clock.value = importAt++;
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: p.catalog,
        authority: catalogSelectionAuthority, clock: provider.clock });
      providerStates.push(provider);
      return importer.import(catalogRequest(selection, provider.clock.value));
    }
    async function card(id, reader = service) {
      const data = await reader.query({ date: '2026-10-09', pageSize: '100' });
      const fixtureId = published.get(id)?.fixture.id ?? (await fixture(id)).id;
      return data.records.find((item) => item.fixtureId === fixtureId);
    }
    async function publish(id, home, over, partial = false, source = 'ai') {
      const state = await p.setup(id);
      state.input.candidate = historyCandidate({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId,
        partial, source, probabilities: groups(home, over) });
      const receipt = await p.publisher.publish(state.input, state.lease);
      assert.equal(receipt.refresh.outcome, 'published'); await p.queue.acknowledge(state.lease);
      published.set(id, state); return state;
    }

    await t.test('fresh migration, bounded query indexes and minimal limiter grants', async () => {
      await execute(process.execPath, ['--conditions=react-server', 'scripts/database.py', 'verify'], { env: p.env, windowsHide: true, timeout: 60_000 });
      const [table] = await p.a.query((tx) => tx.$queryRaw`SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PublicSearchLimit'`);
      assert.equal(table.ENGINE, 'InnoDB'); assert.equal(table.TABLE_COLLATION, 'utf8mb4_bin');
      await assert.rejects(p.a.query((tx) => tx.publicSearchLimit.deleteMany()));
      await assert.rejects(p.a.query((tx) => tx.publicSearchLimit.create({ data: { scope: 'visitor-identifier', windowStartedAt: new Date(), requests: 1 } })));
      const indexes = await p.a.query((tx) => tx.$queryRaw`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME IN ('FootballFixture','FootballTeam','FootballCompetition','FootballTeamAlias','FootballCompetitionAlias')`);
      for (const [table, column] of [['FootballFixture','kickoff'], ['FootballTeam','nameSearch'], ['FootballCompetition','countrySearch'],
        ['FootballTeamAlias','normalizedSearch'], ['FootballCompetitionAlias','normalizedSearch']]) {
        assert.ok(indexes.some((item) => item.TABLE_NAME.toLowerCase() === table.toLowerCase() && item.COLUMN_NAME === column), `${table}.${column} index`);
      }
    });
    await t.test('default pagination uses exact EAT boundaries, stable ties and ordinary links', async () => {
      const first = await query(), repeat = await query();
      assert.equal(first.total, 72); assert.equal(first.records.length, 30); assert.equal(first.pageSize, 30);
      assert.deepEqual(first.records.map((item) => item.fixtureId), repeat.records.map((item) => item.fixtureId));
      assert.equal(first.range.startInclusive, Date.parse('2026-10-08T21:00:00Z'));
      assert.equal(first.range.endExclusive, Date.parse('2026-10-09T21:00:00Z'));
      assert.equal(first.records[0].fixtureId, (await fixture(3070)).id);
      assert.equal(first.state, 'insufficient-data'); assert.equal(first.coverage.partial, false);
      assert.equal(first.nextPage, 2); assert.equal(first.previousPage, null);
      assert.match(first.links.next, /date=2026-10-09&page=2$/u);
      const second = await service.query(new URL(first.links.next, 'http://localhost').searchParams);
      const third = await query({ page: '3' });
      assert.equal(second.records.length, 30); assert.equal(third.records.length, 12);
      assert.equal(new Set([...first.records, ...second.records, ...third.records].map((item) => item.fixtureId)).size, 72);
      assert.equal(third.records.at(-1).fixtureId, (await fixture(3071)).id);
      assert.equal((await query({ date: '2026-10-10' })).records[0].fixtureId, (await fixture(3072)).id);
      const range = await service.query({ from: '2026-10-09', to: '2026-10-10', pageSize: '100' });
      assert.equal(range.total, 73); assert.equal(range.coverage.dates.length, 2);
      const beyond = await query({ page: '10000' });
      assert.equal(beyond.state, 'page-out-of-range'); assert.equal(beyond.previousPage, 3);
      assert.ok(Object.isFrozen(first.records));
    });
    await t.test('case-insensitive team and league aliases and country search precede pagination', async () => {
      const renamed = structuredClone(rows[65]); renamed.teams.home.name = 'Canonical Renamed Club';
      renamed.teams.home.country = 'Faraway Land'; renamed.league.name = 'Canonical League';
      await importRows([renamed], { kind: 'fixtures', query: { fixtureId: 3065 } });
      const result = await query({ q: 'bEyOnD pAgE aLiAs' });
      assert.equal(result.total, 1); assert.equal(result.records[0].fixtureId, (await fixture(3065)).id);
      assert.equal(result.records[0].homeTeam.name, 'Canonical Renamed Club');
      assert.equal((await query({ q: 'FARAWAY LAND' })).total, 1);
      assert.equal((await query({ q: 'SYNTHETIC COMPETITION 39' })).total, 72);
      assert.equal((await query({ q: 'CANONICAL LEAGUE' })).total, 72);
      assert.equal((await query({ q: 'sYnThEtIc CoUnTrY', page: '3' })).records.length, 12);
      assert.equal((await query({ q: '%_!' })).total, 0);
      assert.equal((await query({ q: "' OR 1=1 --" })).state, 'no-filter-matches');
      assert.equal((await query({ league: 'unknown-league' })).state, 'no-filter-matches');
      const competitionId = result.records[0].competition.id;
      assert.equal((await query({ league: competitionId, status: 'scheduled' })).total, 72);
      // Multi-value lists (050): countries come from stored competitions and options count the whole date cohort;
      // an unknown list member never widens or narrows the matched cohort.
      assert.deepEqual((await query()).leagues.map((item) => [item.id, item.country, item.fixtures]), [[competitionId, 'Synthetic country', 72]]);
      assert.equal((await query({ country: 'Synthetic country' })).total, 72);
      assert.equal((await query({ country: 'Elsewhere,Synthetic country', league: `unknown-league,${competitionId}` })).total, 72);
      assert.equal((await query({ country: 'Elsewhere' })).state, 'no-filter-matches');
      assert.equal((await query({ status: 'finished' })).total, 0);
    });
    await t.test('selected-family unrounded probability ordering, missing values and stable ties', async () => {
      await publish(3000, 0.600041, 0.55); await publish(3001, 0.600049, 0.51);
      await publish(3002, 0.7, 0.5001); await publish(3003, 0.4, 0.9);
      await publish(3004, 0.5, 0.8, true); await publish(3005, 0.600049, 0.6);
      const sorted = await query({ sort: 'probability', market: 'match-result', pageSize: '100' });
      const expected = [3002, 3001, 3005, 3000, 3004, 3003].map((id) => published.get(id).fixture.id);
      assert.deepEqual(sorted.records.slice(0, 6).map((item) => item.fixtureId), expected);
      assert.ok(sorted.records.slice(6).every((item) => item.forecast === null));
      const two = await query({ sort: 'probability', market: 'match-result', pageSize: '2', page: '2' });
      assert.deepEqual(two.records.map((item) => item.fixtureId), expected.slice(2, 4));
      const goals = await query({ sort: 'probability', market: 'total-goals', pageSize: '100' });
      assert.equal(goals.records[0].fixtureId, published.get(3003).fixture.id);
      assert.equal(goals.coverage.matchingWithMarket, 5);
      assert.ok(goals.records.slice(5).every((item) => !item.forecast?.markets.some((market) => market.market.family === 'total-goals')));
      // Several markets: each fixture is ranked by its best available pick; ties keep kickoff/ID order.
      const ids = (page) => page.records.slice(0, 6).map((item) => item.fixtureId);
      const pick = (...numbers) => numbers.map((id) => published.get(id).fixture.id);
      const best = await query({ sort: 'probability', market: 'match-result,total-goals', pageSize: '100' });
      assert.deepEqual(ids(best), pick(3003, 3002, 3001, 3005, 3000, 3004));
      const ascending = await query({ sort: 'probability', dir: 'asc', market: 'match-result,total-goals', pageSize: '100' });
      assert.deepEqual(ids(ascending), pick(3004, 3000, 3001, 3005, 3002, 3003));
      const confident = await query({ market: 'match-result,total-goals', prob: '60-100', pageSize: '100' });
      assert.equal(confident.total, 5);
      assert.deepEqual(new Set(confident.records.map((item) => item.fixtureId)), new Set(pick(3003, 3002, 3001, 3005, 3000)));
      const partial = await card(3004);
      assert.equal(partial.unavailableMarkets.length, 2); assert.ok(partial.unavailableMarkets.every((item) => item.reason === 'unsupported'));
      await publish(3006, 0.45, 0.65);
      await publish(3007, 0.43, 0.65); await publish(3008, 0.5, 0.6, false, 'api-football');
    });
    await t.test('anonymous HTTP shares the card snapshot, references and real sync timestamps', async () => {
      const response = await createMatchFeedHandler((parameters) => service.query(parameters))(new Request('http://localhost/api/matches?date=2026-10-09'));
      assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
      assert.match(response.headers.get('link'), /rel="next"/u);
      const body = matchFeedResponseSchema.parse(await response.json()), record = body.records.find((item) => item.fixtureId === published.get(3000).fixture.id);
      parseFixtureSnapshot(record); assert.equal(record.cycle.mode, 'current');
      assert.equal(record.forecast.runId, cohort.selected.runId); assert.equal(record.cycleId, published.get(3000).cycle.id);
      assert.equal(record.forecast.publishedAt, PUBLICATION_NOW);
      assert.ok(record.forecast.markets.every((item) => item.market.source === 'ai' && item.outcome.status === 'pending'));
      assert.equal(record.syncedAt, (await fixture(3000)).retrievedAt);
      assert.notEqual(record.syncedAt, body.asOf);
      assert.ok(Buffer.byteLength(JSON.stringify(body)) < matchFeedRules.maximumResponseBytes);
      assert.doesNotMatch(JSON.stringify(body), /candidateJson|evidenceHash|evidenceSnapshot|provenance|prompt|workerLogs|private-key/u);
      const fallback = await card(3008);
      assert.equal(fallback.forecast.provisional, true);
      assert.ok(fallback.forecast.markets.every((item) => item.market.source === 'api-football'));
    });
    await t.test('odds (052): inclusive bounds on the shown pick\'s own fresh price; record prices follow the SQL rule', async () => {
      // Synthetic bookmaker prices through the real odds adapter, service and store; display rights are a test override.
      const accountId = oddsHash('match-feed-odds-account'), policy = oddsPolicy(), clock = { now: () => p.now() }, HOUR = 3_600_000;
      await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
      const odds = createSyntheticOddsAdapter(clock, { setTime: (value) => p.setTime(value) });
      const importer = createOddsImportService({ adapter: odds.adapter.odds, store: createMysqlOddsStore(p.a),
        authority: oddsAuthority({ publicDisplay: true }, policy), accountId: () => accountId, bounds: () => oddsBounds(p.now()), clock });
      const slot = () => Math.floor(p.now() / (3 * HOUR)) * 3 * HOUR;
      let sequence = 0;
      odds.state.bets = launchBetCatalog();
      assert.equal((await importer.importCatalog(oddsRequest('bets', slot(), { policy, id: oddsHash('match-feed-odds:bets') }))).status, 'complete');
      const kickoff = (id) => Date.parse('2026-10-09T10:00:00Z') + (id - 3000) * 60_000;
      const book = { 3000: { home: '1.50' }, 3001: { home: '1.85' }, 3002: { home: '3.00' }, 3004: { home: '5.00' },
        // A renamed match-result bet withholds that family's price; the total-goals price stays.
        3005: { matchWinnerName: 'Match Winner (synthetic rename)', over: '2.00' }, 3010: { home: '2.00' } };
      async function sweep(ids = Object.keys(book).map(Number)) {
        p.setTime(p.now() + 1000);
        odds.state.rows = ids.map((id) => rawOddsRow(id, kickoff(id), { update: offsetTime(p.now() - 60_000), bets: launchBets(book[id]) }));
        const summary = await importer.importDate(oddsRequest('prices', slot(), { date: '2026-10-09', policy, id: oddsHash(`match-feed-odds:${++sequence}`) }));
        assert.equal(summary.status, 'complete'); assert.equal(summary.outcomes.apply, ids.length); return summary;
      }
      await sweep();
      const oddsFeed = createMatchFeedService({ database: p.a, competitionIds: [39], clock: { now: () => readAt }, providerOdds: true });
      const read = (parameters) => oddsFeed.query({ date: '2026-10-09', pageSize: '100', ...parameters });
      const providerId = (record) => [...published.entries()].find(([, state]) => state.fixture.id === record.fixtureId)?.[0] ?? record.fixtureId;
      const ids = (page) => new Set(page.records.map(providerId));
      const assertPrices = (page, family, min, max) => {
        for (const record of page.records) {
          const shown = selectedCardPrice(record, family);
          assert.ok(shown, `${record.fixtureId} must have its shown pick's price`);
          const hundredths = Math.round(Number(shown.price) * 100);
          assert.ok(hundredths >= min && hundredths <= max, `${shown.price} within ${min}-${max}`);
        }
      };
      const mr = await read({ market: 'match-result', odds: '1.50-3.00' });
      assert.deepEqual(ids(mr), new Set([3000, 3001, 3002]), 'inclusive at 1.50 and 3.00; no price, no pick or another family excluded');
      assert.equal(mr.total, 3); assert.equal(mr.coverage.knownFixtures, 72, 'the 1:1 price join never fans out counts');
      assert.equal(mr.leagues[0].fixtures, 72); assertPrices(mr, 'match-result', 150, 300);
      assert.deepEqual(ids(await read({ market: 'match-result', odds: '1.51-2.99' })), new Set([3001]));
      assert.deepEqual(ids(await read({ market: 'match-result', odds: '4.00-6.00' })), new Set([3004]));
      assert.deepEqual(ids(await read({ market: 'match-result', prob: '65-100', odds: '1.50-3.00' })), new Set([3002]));
      const goals = await read({ market: 'total-goals', odds: '1.95-2.05' });
      assert.deepEqual(ids(goals), new Set([3005])); assertPrices(goals, 'total-goals', 195, 205);
      // 3005 shows its match-result pick (0.600049 > 0.6), which has no price; its in-range goals price never qualifies it.
      const mixed = await read({ market: 'match-result,total-goals', odds: '1.95-2.05' });
      assert.equal(mixed.total, 0); assert.equal(mixed.state, 'no-filter-matches');
      // Record prices: one per published family's pick, by the same rule as the SQL; nothing borrowed across families.
      const all = await read({ market: 'match-result' });
      const record = (id, page = all) => page.records.find((item) => item.fixtureId === published.get(id).fixture.id);
      assert.equal(all.total, 72);
      const launch = { 'home-win': '1.50', draw: '3.40', 'away-win': '4.20', 'home-or-draw': '1.25', 'home-or-away': '1.30', 'away-or-draw': '1.80',
        'over-2.5': '1.90', 'under-2.5': '1.95', yes: '1.80', no: '2.00' };
      assert.equal(record(3000).prices.length, record(3000).forecast.markets.length);
      assert.deepEqual(record(3000).prices.map((item) => [item.family, item.selection, item.price, item.basis]),
        record(3000).forecast.markets.map(({ market }) => [market.family, market.selection, launch[market.selection], 'bookmaker']));
      assert.deepEqual(record(3005).prices.map((item) => item.family), record(3005).forecast.markets.map(({ market }) => market.family)
        .filter((family) => family !== 'match-result'), 'only the renamed match-result bet is withheld');
      assert.equal(record(3005).prices.find((item) => item.family === 'total-goals').price, '2.00');
      assert.equal(selectedCardPrice(record(3005), 'match-result'), null);
      assert.deepEqual(record(3003).prices, []);
      assert.ok(all.records.filter((item) => item.forecast === null).every((item) => item.prices.length === 0), 'a price never appears without a pick');
      assert.doesNotMatch(JSON.stringify(all), /Synthetic bookmaker|bookmakerExternalId|snapshotId|impliedProbability/u);
      // Rights off (the public default): no prices and odds= rejected, even though private prices exist.
      assert.ok((await query({ pageSize: '100' })).records.every((item) => item.prices.length === 0));
      await assert.rejects(query({ odds: '1.50-3.00' }), (error) => error.code === 'invalid-query');
      const http = await createMatchFeedHandler((parameters) => oddsFeed.query(parameters))(
        new Request('http://localhost/api/matches?date=2026-10-09&odds=1.50-3.00'));
      assert.equal(http.status, 400, 'the public route parses with the global flag');
      // Pagination identity: a reconfirmation keeps it; a public price change or a withdrawal moves it.
      const version = async () => (await read({ market: 'match-result', odds: '1.50-3.00' })).paginationVersion;
      const before = await version();
      await sweep(); assert.equal(await version(), before, 'unchanged prices do not invalidate');
      book[3001] = { home: '2.10' }; await sweep();
      const moved = await version(); assert.notEqual(moved, before);
      assert.equal(selectedCardPrice(record(3001), 'match-result').price, '1.85', 'an earlier response keeps its own snapshot');
      const changed = await read({ market: 'match-result', odds: '2.10-2.10' });
      assert.deepEqual(ids(changed), new Set([3001])); assert.equal(selectedCardPrice(record(3001, changed), 'match-result').price, '2.10');
      // A complete sweep without 3002 withdraws it: its prices turn stale, drop out of the filter and leave the record.
      await sweep([3000, 3001, 3004, 3005, 3010]);
      assert.notEqual(await version(), moved);
      assert.deepEqual(ids(await read({ market: 'match-result', odds: '1.50-3.00' })), new Set([3000, 3001]));
      assert.deepEqual(record(3002, await read({ market: 'match-result' })).prices, []);
    });
    await t.test('run progress reflects durable job states instead of stale projected counters', async () => {
      const page = await query();
      const states = await p.a.query((tx) => tx.runFixture.findMany({ where: { runId: cohort.selected.runId }, select: { job: { select: { state: true } } } }));
      assert.equal(page.run.total, states.length);
      assert.equal(page.run.completed, states.filter((entry) => entry.job?.state === 'succeeded').length);
      assert.equal(page.run.completed, 9);
      assert.equal((await p.a.query((tx) => tx.dailyRun.findUniqueOrThrow({ where: { id: cohort.selected.runId } }))).completedJobs, 0);
      assert.equal(page.run.published, 9); assert.equal(page.run.phase, 'updating'); assert.ok(page.run.message);
      assert.equal(page.run.id, cohort.selected.runId); assert.equal(page.run.sequence, cohort.manifest.sequence);
      assert.equal((await query({ date: '2026-10-08' })).run, null);
    });
    await t.test('no run and an uncommitted run expose unknown progress instead of fabricated completion', async () => {
      readAt = Date.parse('2026-10-20T08:00:00Z');
      try {
        const before = await query({ date: '2026-10-20' });
        assert.equal(before.run.phase, 'not-started'); assert.equal(before.run.total, null);
        await p.history.createRun('2026-10-20', PUBLICATION_NOW);
        const selecting = await query({ date: '2026-10-20' });
        assert.equal(selecting.run.phase, 'selecting'); assert.equal(selecting.run.total, null);
        assert.equal(selecting.run.completed, 0);
      } finally { readAt = PUBLICATION_NOW; }
    });
    await t.test('partial and failed imports preserve stored rows and cannot establish authoritative emptiness', async () => {
      const receipt = await importRows([rows[0]], { kind: 'fixtures', query: { date: '2026-10-09' } }, { paging: { current: 1, total: 2 } });
      assert.equal(receipt.status, 'partial');
      const partial = await query();
      assert.equal(partial.total, 72); assert.equal(partial.coverage.partial, true);
      assert.equal(partial.coverage.dates[0].status, 'partial'); assert.ok(partial.records.every((item) => item.partialCoverage));
      await importRows([], { kind: 'fixtures', query: { date: '2026-10-08' } });
      assert.equal((await query({ date: '2026-10-08' })).state, 'no-fixtures');
      await importRows([], { kind: 'fixtures', query: { date: '2026-10-08' } }, { paging: { current: 1, total: 2 } });
      const emptyPartial = await query({ date: '2026-10-08' });
      assert.equal(emptyPartial.state, 'data-unavailable'); assert.equal(emptyPartial.coverage.dates[0].authoritative, false);
      await importRows([], { kind: 'fixtures', query: { date: '2026-10-08' } }, { status: 500 });
      assert.equal((await query({ date: '2026-10-08' })).coverage.dates[0].status, 'failed');
      const unknown = await query({ date: '2026-10-07' });
      assert.equal(unknown.state, 'data-unavailable'); assert.equal(unknown.coverage.dates[0].status, 'unknown');
    });
    await t.test('a newer unfinished or failed import suppresses an older complete-empty receipt', async () => {
      const date = '2026-10-13', request = catalogRequest({ kind: 'fixtures', query: { date } }, importAt + 1000);
      await p.a.query((tx) => tx.dailyRunImport.create({ data: { id: request.id, runId: cohort.selected.runId,
        eatDate: new Date(`${date}T00:00:00Z`), attempt: 2, requestJson: request } }));
      const pending = await query({ date });
      assert.equal(pending.state, 'data-unavailable'); assert.equal(pending.coverage.dates[0].status, 'pending');
      await p.a.query((tx) => tx.dailyRunImport.update({ where: { id: request.id }, data: { finishedAt: new Date(importAt + 2000), failure: 'import-unavailable' } }));
      assert.equal((await query({ date })).coverage.dates[0].status, 'failed');
      importAt += 5000; await importRows([], { kind: 'fixtures', query: { date } });
      assert.equal((await query({ date })).state, 'no-fixtures');
    });
    await t.test('outside-window message leaves historical locked forecasts reachable', async () => {
      await importRows([rows[74]], { kind: 'fixtures', query: { fixtureId: 3074 } });
      const future = await query({ date: '2026-10-16' });
      assert.equal(future.records.length, 1); assert.ok(future.records[0].availabilityMessage);
      assert.equal(future.records[0].update.prediction, 'outside-window'); assert.equal(future.run, null);
      const state = published.get(3000); p.setTime(state.cycle.cutoffAt);
      await p.first.close(p.target(state));
      const locked = await card(3000); assert.equal(locked.cycle.mode, 'locked');
      assert.equal(locked.forecast.revisionId, (await p.history.findCycle(state.cycle.id)).lockedSetId);
      assert.ok(BigInt(locked.dataVersion) > BigInt(state.fixture.dataVersion));
      readAt = Date.parse('2026-10-20T08:00:00Z');
      const historicalReader = createMatchFeedService({ database: p.a, competitionIds: [999], clock: { now: () => readAt } });
      const historical = await card(3000, historicalReader);
      assert.equal(historical.forecast.revisionId, locked.forecast.revisionId); assert.equal(historical.availabilityMessage, null);
      readAt = PUBLICATION_NOW;
    });
    await t.test('closed-without-lock never falls back to a current preview', async () => {
      const state = published.get(3007);
      await p.first.closeObservedPlay({ ...state.input.observation, status: 'live', retrievedAt: p.now(), actualStartedAt: PUBLICATION_NOW - 1 });
      assert.ok((await p.history.findCycle(state.cycle.id)).currentSetId);
      const record = (await query({ pageSize: '100' })).records.find((item) => item.fixtureId === state.fixture.id);
      assert.equal(record.forecast, null); assert.equal(record.cycle.mode, 'locked');
      assert.equal(record.unavailableMarkets.length, 4); assert.ok(record.unavailableMarkets.every((item) => item.reason === 'no-locked-selection'));
    });
    await t.test('void preview retains its reason and old cycles never duplicate or displace the applicable cycle', async () => {
      const state = published.get(3006);
      await p.first.voidCycle({ ...p.target(state), actor: 'synthetic-feed-test', reason: 'formal-postponement', evidenceRef: 'private-proof-not-public' });
      const previous = await card(3006);
      assert.equal(previous.cycle.mode, 'void'); assert.equal(previous.cycle.lockedAt, null);
      assert.equal(previous.cycle.voidReason.code, 'formal-postponement'); assert.ok(previous.forecast.markets.every((item) => item.outcome.status === 'void'));
      assert.doesNotMatch(JSON.stringify(previous), /private-proof-not-public/u);
      const next = await p.history.withFixtureTransaction(state.fixture.id, (writer) => writer.createCycle(cycleCreation(state.fixture, 'rescheduled-feed')));
      const applicable = await card(3006);
      assert.equal(applicable.cycleId, next.id); assert.equal(applicable.cycle.ordinal, 2); assert.equal(applicable.forecast, null);
      assert.equal((await query({ pageSize: '100' })).records.filter((item) => item.fixtureId === state.fixture.id).length, 1);
      assert.equal((await p.history.displayForCycle(state.cycle.id)).revision.id, previous.forecast.revisionId);
    });
    await t.test('only coherent audited settlement is displayed; result corrections remain pending until settled', async () => {
      const state = published.get(3000), accountId = resultHash('match-feed-results');
      await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
      const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
      const store = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
      const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
      async function result(home, away, number) {
        p.setTime(Math.max(p.now() + 1000, state.cycle.kickoffAt + 7_200_000));
        const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status: 'FT', raw: { goals: { home, away }, score: { fulltime: { home, away } } } }));
        const lease = await store.acquire(resultHash(`feed-result-owner:${number}`), 30_000); assert.ok(lease);
        const batch = { id: resultHash(`feed-result:${number}`), accountId, policyHash: resultHash('feed-result-policy'), receivedAt: p.now(),
          channel: 'ids', date: null, requestedIds: [3000], observations: [observation], error: null, requestsDispatched: 1 };
        try { await store.save(lease, batch); await store.apply(lease, batch); } finally { await store.release(lease); }
      }
      await result(2, 1, 1);
      let record = await card(3000);
      assert.equal(record.status, 'finished-regulation'); assert.deepEqual(record.score, { home: 2, away: 1 });
      assert.equal(record.scorePeriod, 'regulation'); assert.equal(record.syncedAt, p.now());
      assert.ok(record.forecast.markets.every((item) => item.outcome.status === 'pending'));
      await settlement.settleFixture(state.fixture.id); record = await card(3000);
      assert.equal(record.forecast.markets.find((item) => item.market.family === 'match-result').outcome.status, 'correct');
      const original = record.forecast.revisionId, before = record.dataVersion;
      await result(0, 1, 2); record = await card(3000);
      assert.ok(record.forecast.markets.every((item) => item.outcome.status === 'pending'));
      await settlement.settleFixture(state.fixture.id); record = await card(3000);
      assert.equal(record.forecast.markets.find((item) => item.market.family === 'match-result').outcome.status, 'incorrect');
      assert.ok(record.forecast.markets.find((item) => item.market.family === 'match-result').outcome.correctedAt);
      assert.equal(record.forecast.revisionId, original); assert.ok(BigInt(record.dataVersion) > BigInt(before));
    });
    await t.test('visitor reads never invoke adapters or mutate fixtures, forecasts, results or jobs', async () => {
      const counts = () => p.a.query(async (tx) => ({ jobs: await tx.durableJob.count(), forecasts: await tx.predictionSet.count(),
        results: await tx.fixtureResult.count(), events: await tx.predictionChangeEvent.count(),
        versions: await tx.footballFixture.findMany({ orderBy: { id: 'asc' }, select: { id: true, dataVersion: true } }) }));
      const before = await counts(), requests = providerStates.map((provider) => provider.network.length), originalFetch = globalThis.fetch;
      let network = 0;
      globalThis.fetch = async () => { network++; throw new Error('Visitor request must not dispatch network work'); };
      try { await query({ pageSize: '100' }); await query({ q: 'Canonical League' }); }
      finally { globalThis.fetch = originalFetch; }
      assert.equal(network, 0); assert.deepEqual(providerStates.map((provider) => provider.network.length), requests);
      assert.deepEqual(await counts(), before);
    });
    await t.test('anonymous search budget is atomic across replicas, expires and does not limit ordinary browsing', async () => {
      // Advance beyond earlier searches; DB UTC owns the budget, not visitor clocks.
      p.setTime(p.now() + 60_000);
      const limiters = [createMysqlPublicSearchLimiter(p.a), createMysqlPublicSearchLimiter(p.b)];
      const results = [];
      for (let offset = 0; offset < 130; offset += 10) {
        results.push(...await Promise.allSettled(Array.from({ length: 10 }, (_, index) => limiters[index % 2].consume())));
      }
      assert.equal(results.filter((item) => item.status === 'fulfilled').length, 120);
      assert.ok(results.filter((item) => item.status === 'rejected').every((item) => item.reason.code === 'rate-limited'));
      const handler = createMatchFeedHandler((parameters) => service.query(parameters));
      const rejected = await handler(new Request('http://localhost/api/matches?q=club'));
      assert.equal(rejected.status, 429); assert.equal(rejected.headers.get('retry-after'), '60');
      const counter = await p.a.query((tx) => tx.publicSearchLimit.findUniqueOrThrow({ where: { scope: 'matches' } }));
      assert.equal(counter.requests, 120); assert.deepEqual(Object.keys(counter).sort(), ['requests','scope','windowStartedAt']);
      assert.equal((await query()).total, 72);
      const invalid = await handler(new Request('http://localhost/api/matches?q=club&pageSize=101'));
      assert.equal(invalid.status, 400);
      assert.equal((await p.a.query((tx) => tx.publicSearchLimit.findUniqueOrThrow({ where: { scope: 'matches' } }))).requests, 120);
      p.setTime(p.now() + 60_000); assert.ok((await query({ q: 'club' })).total > 0);
      assert.equal((await p.a.query((tx) => tx.publicSearchLimit.findUniqueOrThrow({ where: { scope: 'matches' } }))).requests, 1);
    });
    await t.test('country flag: the date sync stores league.flag, every card of the league publishes it, no fixture version moves', async () => {
      const flag = 'https://media.api-sports.io/flags/gb-eng.svg';
      const flagged = (value) => ({ ...rows[50], league: { ...rows[50].league, flag: value } });
      const stored = async () => (await p.a.query((tx) => tx.footballCompetitionProvider.findUniqueOrThrow({
        where: { provider_externalId: { provider: 'api-football', externalId: 39n } }, include: { competition: true } }))).competition.countryFlagUrl;
      const [before, sibling] = [await card(3050), await card(3051)];
      assert.equal(before.competition.countryFlagUrl, null, 'rows imported without the key store no flag');
      assert.notEqual((await importRows([flagged(flag)], { kind: 'fixtures', query: { fixtureId: 3050 } })).status, 'failed');
      assert.equal(await stored(), flag);
      const [after, other] = [await card(3050), await card(3051)];
      assert.equal(after.competition.countryFlagUrl, flag);
      assert.equal(other.competition.countryFlagUrl, flag, 'the flag belongs to the competition, so every fixture of it shows it');
      assert.deepEqual([after.dataVersion, other.dataVersion], [before.dataVersion, sibling.dataVersion], 'a flag alone versions no fixture');
      // The anonymous HTTP body carries the same field.
      const http = await createMatchFeedHandler((parameters) => service.query(parameters))(new Request('http://localhost/api/matches?date=2026-10-09&pageSize=100'));
      const body = matchFeedResponseSchema.parse(await http.json());
      assert.equal(body.records.find((item) => item.fixtureId === after.fixtureId).competition.countryFlagUrl, flag);
      // International rows send null and recorded rows may omit the key: neither erases the stored flag.
      for (const value of [null, undefined]) {
        assert.notEqual((await importRows([flagged(value)], { kind: 'fixtures', query: { fixtureId: 3050 } })).status, 'failed');
        assert.equal(await stored(), flag);
      }
      assert.equal((await card(3050)).competition.countryFlagUrl, flag);
    });
  });
});

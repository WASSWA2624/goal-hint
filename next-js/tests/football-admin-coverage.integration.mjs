import assert from 'node:assert/strict';
import test from 'node:test';
import { getReportingDate } from '../src/domain/calendar.ts';
import { readFootballCoverage } from '../src/server/admin/football-coverage.ts';
import { readFixtureCoverageGaps, readFixtureCoverageTotals, readFixtureDiscoveryGaps, readFixtureDiscoveryReceipt } from '../src/server/admin/fixture-coverage.ts';
import { createFootballCatalogStore } from '../src/server/football/catalog-mysql-store.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createMysqlOddsStore } from '../src/server/odds/odds-mysql-store.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { createSyntheticOddsAdapter, launchBetCatalog, oddsAuthority, oddsBounds, oddsHash, oddsPolicy, oddsRequest, rawOddsRow } from './helpers/odds-fixtures.mjs';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

test('private football coverage uses exact EAT fixture, forecast, price and worker denominators on MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const date = '2026-10-09', future = '2026-10-09T14:00:00Z';
    for (const table of ['FootballHistoryImportStatus', 'FootballProviderCoverage', 'InPlayOddsPollState', 'LiveMatchPollerLease', 'ApiQuotaPeriod']) {
      await p.instance.executeAdmin(`GRANT SELECT ON goal_hint_test.${table} TO 'cutoff_app'@'127.0.0.1'`);
    }
    const rows = [catalogFixture(8010, { kickoff: future }), catalogFixture(8011, { kickoff: future }),
      catalogFixture(8012, { kickoff: '2026-10-09T07:00:00Z' }), catalogFixture(8013, { kickoff: future, competitionId: 77 }),
      catalogFixture(8014, { kickoff: '2026-10-09T21:00:00Z' }), catalogFixture(8015, { kickoff: future }),
      catalogFixture(8016, { kickoff: future })];
    await p.cohort(date, p.first, { rows, refresh: { type: 'prediction.admin-coverage-test' } });
    // The shared fixture harness uses a wall-clock catalog recorder. Here both receipt clocks are part of the test.
    const dateAdapter = createSyntheticCatalogAdapter({ rows: rows.filter(row => getReportingDate(Date.parse(row.fixture.date)) === date) });
    dateAdapter.clock.value = PUBLICATION_NOW - 1000;
    const dateImporter = createFootballCatalogImporter({ adapter: dateAdapter.adapter, authority: catalogSelectionAuthority,
      clock: dateAdapter.clock, store: createFootballCatalogStore(p.a, { clock: dateAdapter.clock }) });
    assert.equal((await dateImporter.import(catalogRequest({ kind: 'fixtures', query: { date } }, dateAdapter.clock.now()))).status, 'complete');
    const predicted = await p.setup(8010), noTime = await p.catalog.fixtureByProviderId(8015), moved = await p.catalog.fixtureByProviderId(8016);
    assert.equal((await p.publisher.publish(predicted.input, predicted.lease)).refresh.outcome, 'published');
    await p.queue.acknowledge(predicted.lease);
    // The existing date receipt keeps both observed IDs, even after a canonical occurrence is corrected.
    await p.a.query((tx) => tx.footballFixture.update({ where: { id: noTime.id }, data: { kickoff: null, eatDate: null } }));
    await p.a.query((tx) => tx.footballFixture.update({ where: { id: moved.id }, data: {
      kickoff: new Date('2026-10-09T21:00:00Z'), eatDate: new Date('2026-10-10T00:00:00Z') } }));

    const accountId = oddsHash('admin-coverage-test-odds'), clock = { now: () => p.now() };
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const odds = createSyntheticOddsAdapter(clock), store = createMysqlOddsStore(p.a), policy = oddsPolicy();
    odds.state.bets = launchBetCatalog();
    const importer = createOddsImportService({ adapter: odds.adapter.odds, store, authority: oddsAuthority({ publicDisplay: true }, policy),
      accountId: () => accountId, bounds: () => oddsBounds(clock.now()), clock });
    assert.equal((await importer.importCatalog(oddsRequest('bets', clock.now(), { policy }))).status, 'complete');
    odds.state.rows = [rawOddsRow(8011, Date.parse(future))];
    assert.equal((await importer.importDate(oddsRequest('prices', clock.now(), { date, policy }))).status, 'complete');

    // Read the exact source/SQL operations as well as the dashboard's redacted service boundary.
    const dateReceipt = await p.a.query(tx => readFixtureDiscoveryReceipt(tx, date, PUBLICATION_NOW));
    assert.ok(dateReceipt);
    await p.a.query(tx => readFixtureCoverageTotals(tx, date, PUBLICATION_NOW, [39], dateReceipt.fixtureIds));
    const report = await readFootballCoverage(p.a, PUBLICATION_NOW, [39]);
    const { discovered, discoveryComplete, stored, publicScope, published, forecastPublished, predictionReady, marketPredictions,
      priced, awaitingData, excluded, observedOdds, observedWithoutFreshPrice } = report.fixtures;
    assert.deepEqual({ discovered, discoveryComplete, stored, publicScope, published, forecastPublished, predictionReady, marketPredictions,
      priced, awaitingData, excluded, observedOdds, observedWithoutFreshPrice }, { discovered: 6, discoveryComplete: true, stored: 6,
      publicScope: 3, published: 3, forecastPublished: 1, predictionReady: 1, marketPredictions: 4,
      priced: 1, awaitingData: 1, excluded: 3, observedOdds: 1, observedWithoutFreshPrice: 0 });
    assert.equal(report.marketMapping['pre-match'].mapped, 4);
    assert.equal(report.marketMapping['pre-match'].unmapped, 1);
    assert.equal(report.marketMapping['in-play'], null);
    assert.ok(report.workers.lanes.some(lane => lane.type === 'prediction.admin-coverage-test' && lane.lastSuccessAt === PUBLICATION_NOW));
    assert.equal(report.workers.quota, null, 'an unrelated odds account is not treated as the active result quota');

    const all = [];
    let after;
    do {
      const page = await readFixtureCoverageGaps(p.a, PUBLICATION_NOW, [39], { date, after, limit: 1 });
      all.push(...page.items);
      after = page.nextAfter ?? undefined;
    } while (after);
    assert.deepEqual(Object.fromEntries(all.map(row => [row.externalId, row.exclusionReason])), {
      8013: 'outside-public-competition-scope', 8015: 'missing-kickoff', 8016: 'kickoff-outside-reporting-date',
    });
    const forecasts = await readFixtureCoverageGaps(p.a, PUBLICATION_NOW, [39], { date, kind: 'forecast' });
    assert.deepEqual(forecasts.items.map(row => row.externalId).sort(), ['8011', '8012']);
    assert.ok(forecasts.items.every(row => row.exclusionReason === null));
    const discovery = await readFixtureDiscoveryGaps(p.a, PUBLICATION_NOW, { date });
    assert.deepEqual(discovery.items, []);
    assert.equal(discovery.rejectedCount, 0);
  });
});

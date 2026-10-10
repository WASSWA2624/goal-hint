import assert from 'node:assert/strict';
import test from 'node:test';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { catalogFixture, catalogRequest, catalogResponse, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createDiscoveryReader } from '../src/server/seo/discovery-read.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { createMatchDetailService } from '../src/server/matches/detail-service.ts';
import { createMysqlPublicResponseCache } from '../src/server/cache/mysql-public-cache.ts';
import { loadMatchFeedPage } from '../src/server/matches/feed-page.ts';
import { loadMatchDetailPage } from '../src/server/matches/detail-page.ts';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { savePageScenarios } from './helpers/page-capture.mjs';

test('discovery reads genuine stored identity, historical scope and material change timestamps without provider work', { timeout: 240_000 }, async t => {
  await withPredictionPipeline(t, async p => {
    const today = parseReportingDate('2026-10-09');
    const rows = Array.from({ length: 35 }, (_, i) => {
      const row = catalogFixture(7000 + i, { homeId: 14000 + i * 2, awayId: 14001 + i * 2,
        kickoff: new Date(Date.parse('2026-10-09T12:00:00Z') + i * 60_000).toISOString() });
      row.teams.home.name = `Discovery Home ${i}`; row.teams.away.name = `Discovery Away ${i}`; return row;
    });
    const cohort = await p.cohort(today, p.first, { rows });
    const state = await p.setup(7000);
    assert.equal((await p.publisher.publish(state.input, state.lease)).refresh.outcome, 'published');
    await p.queue.acknowledge(state.lease);
    const discovery = createDiscoveryReader(p.a, [39]);
    assert.deepEqual(await discovery.inventory(), { matches: 35, dates: 1 });
    const initial = await discovery.matches(0);
    assert.equal(initial.length, 35); assert.deepEqual(await discovery.matches(1), []);
    assert.deepEqual(await discovery.dates(0), [{ path: '/en/predictions/2026-10-09' }]);
    assert.deepEqual(await discovery.dates(1), []);
    await assert.rejects(discovery.matches(-1), RangeError);
    const before = initial.find(row => row.path.includes(state.fixture.id));
    assert.ok(before.lastModified instanceof Date && Number.isFinite(before.lastModified.getTime()));
    async function sync(row, at) {
      const provider = createSyntheticCatalogAdapter({ respond: url => catalogResponse(url, [row]) }); provider.clock.value = at;
      return createFootballCatalogImporter({ adapter: provider.adapter, store: p.catalog, authority: catalogSelectionAuthority, clock: provider.clock })
        .import(catalogRequest({ kind: 'fixtures', query: { fixtureId: row.fixture.id } }, at));
    }
    await sync(rows[0], before.lastModified.getTime() + 60_000);
    const unchanged = (await discovery.matches(0)).find(row => row.path.includes(state.fixture.id));
    assert.equal(unchanged.lastModified.getTime(), before.lastModified.getTime(), 'Retrieval-only sync must not fabricate a content modification.');
    const renamed = structuredClone(rows[0]); renamed.teams.home.name = 'Renamed Discovery Club';
    await sync(renamed, before.lastModified.getTime() + 120_000);
    const changed = (await discovery.matches(0)).find(row => row.path.includes(state.fixture.id));
    assert.match(changed.path, /renamed-discovery-club-vs-discovery-away-0$/);
    assert.ok(changed.lastModified > before.lastModified, 'Audited identity changes advance lastmod.');
    p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state));
    const retired = createDiscoveryReader(p.a, [999]);
    assert.deepEqual(await retired.inventory(), { matches: 1, dates: 1 });
    assert.equal((await retired.matches(0))[0].path, changed.path, 'Closed historical forecasts survive a future scope change.');

    const cache = createMysqlPublicResponseCache(p.a), clock = { now: () => p.now() };
    const feed = createMatchFeedService({ database: p.a, cache, competitionIds: [39], clock });
    const detail = createMatchDetailService({ database: p.a, cache, clock });
    const captured = { feeds: {}, details: {}, inventory: await discovery.inventory(),
      matches: await discovery.matches(0), dates: await discovery.dates(0), oldPath: before.path };
    for (const parameters of [{}, { page: '2' }, { date: today }, { date: today, page: '2' }, { q: 'Discovery Home 1' },
      { page: '10000' }, { when: 'next-7-days' }]) {
      const query = parseFeedQuery(parameters, { today });
      const result = await loadMatchFeedPage(query, today, clock, (values, context) => feed.query(values, context));
      assert.equal(result.error, null); captured.feeds[JSON.stringify(parameters)] = { query, today, result };
    }
    // Capture every sitemap destination so the isolated HTTP crawler can verify each one.
    for (const row of captured.matches) {
      const id = row.path.split('/')[3];
      const current = await loadMatchDetailPage(id, clock, (value, values) => detail.query(value, values));
      assert.equal(current.error, null); captured.details[id] = { current };
    }
    const revision = captured.details[state.fixture.id].current.data.snapshot.revisionId;
    captured.details[state.fixture.id].revision = await loadMatchDetailPage(state.fixture.id, clock,
      (value, values) => detail.query(value, values), new URLSearchParams({ revision }));
    captured.at = p.now(); captured.revision = revision; captured.publishedId = state.fixture.id;
    assert.equal(captured.details[state.fixture.id].revision.error, null);
    const network = cohort.provider.network.length, originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('Public discovery must never fetch a provider.'); };
    try { await discovery.inventory(); await discovery.matches(0); await discovery.dates(0); }
    finally { globalThis.fetch = originalFetch; }
    assert.equal(cohort.provider.network.length, network);
    await savePageScenarios(t, 'SEO_PAGE_CAPTURE', captured);
  });
});

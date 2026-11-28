import assert from 'node:assert/strict';
import test from 'node:test';
import { maximumFeedWindowRecords } from '../src/domain/match-feed-rules.ts';
import { storedMatchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';

const at = Date.parse('2026-10-09T08:00:00Z');
const parameters = { date: '2026-10-09', pageSize: '100' };

function fixtureWindow() {
  const firstOrder = Array.from({ length: 105 }, (_, index) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const homeTeam = { id: 'home', name: 'Synthetic Home', code: null, logoUrl: null };
  const awayTeam = { id: 'away', name: 'Synthetic Away', code: null, logoUrl: null };
  const competition = { id: 'competition-1', name: 'Synthetic league', country: null, logoUrl: null, countryFlagUrl: null };
  let order = firstOrder, generation = 1n, cached = 0;
  const transactions = [], selections = [], hydration = [];
  const database = { async transaction(read, options) {
    transactions.push(options);
    const snapshotOrder = order, snapshotGeneration = generation;
    return read({
      publicCacheTag: { findMany: async () => [{ tag: 'date:2026-10-09', generation: snapshotGeneration }] },
      footballImport: { findMany: async () => [] }, dailyRunImport: { findMany: async () => [] }, dailyRun: { findUnique: async () => null },
      footballFixture: { async findMany({ where }) {
        const ids = where.id.in;
        hydration.push(ids);
        return ids.toReversed().map((id) => ({ id, homeTeam, awayTeam, season: { competition }, dataVersion: snapshotGeneration,
          kickoff: new Date(at + 3_600_000), retrievedAt: new Date(at - 1), status: 'scheduled', providerStatus: 'NS', activeCycleId: null,
          regulationHome: null, regulationAway: null, regulationVerifiedAt: null, regulationEvidenceRef: null, resultState: null, lifecycleState: null }));
      } },
      async $queryRaw(statement) {
        const text = statement.sql;
        if (text.includes('GROUP BY l.id')) return [{ ...competition, fixtures: BigInt(snapshotOrder.length), knownFixtures: BigInt(snapshotOrder.length) }];
        if (text.includes(' AS performanceAvailable')) return [{ total: BigInt(snapshotOrder.length), available: 0n, performanceAvailable: 0n, void: 0n, exact: null }];
        assert.match(text, /ORDER BY .* LIMIT \? OFFSET \?/su);
        const [limit, offset] = statement.values.slice(-2);
        selections.push({ limit, offset });
        return snapshotOrder.slice(offset, offset + limit).map((id) => ({ id }));
      },
    });
  } };
  const cache = { read: async (_descriptor, read) => { cached++; return read(); } };
  const service = createMatchFeedService({ database, cache, competitionIds: [39], clock: { now: () => at },
    providerOdds: false, includePerformance: false });
  return { service, firstOrder, transactions, selections, hydration, get cached() { return cached; },
    rotate() { generation++; order = [...order.slice(1), order[0]]; return order; } };
}

test('a changed source yields adjacent exact pages from one new transaction and 100-fixture hydration batches', async () => {
  const fixture = fixtureWindow(), before = await fixture.service.query(parameters);
  const revisedOrder = fixture.rotate();
  const pages = await fixture.service.queryWindow(parameters, 2);
  const [first, second] = pages;
  assert.equal(fixture.cached, 1, 'the ordinary single page uses its existing cache, and the window bypasses it');
  assert.deepEqual(fixture.transactions, Array.from({ length: 2 }, () => ({ isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 30_000 })));
  assert.deepEqual(fixture.selections, [{ limit: 100, offset: 0 }, { limit: maximumFeedWindowRecords, offset: 0 }]);
  assert.deepEqual(fixture.hydration.map((batch) => batch.length), [100, 100, 5]);
  assert.notEqual(first.paginationVersion, before.paginationVersion);
  assert.equal(first.paginationVersion, second.paginationVersion);
  assert.equal(first.performanceVersion, second.performanceVersion);
  assert.equal(first.asOf, second.asOf);
  assert.deepEqual(pages.flatMap((page) => page.records.map(({ fixtureId }) => fixtureId)), revisedOrder);
  assert.deepEqual(pages.map(({ page, pageSize, nextPage, previousPage, total }) => [page, pageSize, nextPage, previousPage, total]),
    [[1, 100, 2, null, 105], [2, 100, null, 1, 105]]);
  assert.match(first.links.next, /page=2&pageSize=100$/u);
  assert.ok(Object.isFrozen(pages) && pages.every((page) => Object.isFrozen(page.records) && storedMatchFeedResponseSchema.safeParse(page).success));
});

test('windows keep the requested offset, stop at the genuine end and reject unsafe ranges before opening a transaction', async () => {
  const fixture = fixtureWindow();
  for (const through of [0, 1, 3, 2.5, 10001]) {
    await assert.rejects(fixture.service.queryWindow(parameters, through), (error) => error.code === 'invalid-query');
  }
  assert.equal(fixture.transactions.length, 0);
  const pages = await fixture.service.queryWindow({ ...parameters, page: '2', pageSize: '30' }, 6);
  assert.deepEqual(fixture.selections, [{ limit: 150, offset: 30 }]);
  assert.deepEqual(pages.map(({ page, nextPage, records }) => [page, nextPage, records.length]), [[2, 3, 30], [3, 4, 30], [4, null, 15]]);
  assert.deepEqual(pages.flatMap((page) => page.records.map(({ fixtureId }) => fixtureId)), fixture.firstOrder.slice(30));
});

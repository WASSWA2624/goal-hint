import assert from 'node:assert/strict';
import test from 'node:test';
import { maximumFeedWindowRecords } from '../src/domain/match-feed-rules.ts';
import { storedMatchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { createPublicResponseCache } from '../src/server/cache/public-cache.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';

const at = Date.parse('2026-10-09T08:00:00Z');
const parameters = { date: '2026-10-09', pageSize: '100' };

function fixtureWindow({ knownFixtures } = {}) {
  const firstOrder = Array.from({ length: 105 }, (_, index) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const homeTeam = { id: 'home', name: 'Synthetic Home', code: null, logoUrl: null };
  const awayTeam = { id: 'away', name: 'Synthetic Away', code: null, logoUrl: null };
  const competition = { id: 'competition-1', name: 'Synthetic league', country: null, logoUrl: null, countryFlagUrl: null };
  let order = firstOrder, generation = 1n, cached = 0, completedTransactions = 0;
  const transactions = [], selections = [], hydration = [];
  const database = { async transaction(read, options) {
    transactions.push(options);
    const snapshotOrder = order, snapshotGeneration = generation;
    const result = await read({
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
        if (text.includes('GROUP BY l.id')) return [{ ...competition, fixtures: BigInt(snapshotOrder.length), knownFixtures: BigInt(knownFixtures ?? snapshotOrder.length) }];
        if (text.includes(' AS performanceAvailable')) return [{ total: BigInt(snapshotOrder.length), available: 0n, performanceAvailable: 0n, void: 0n, exact: null }];
        assert.match(text, /ORDER BY .* LIMIT \? OFFSET \?/su);
        const [limit, offset] = statement.values.slice(-2);
        selections.push({ limit, offset });
        return snapshotOrder.slice(offset, offset + limit).map((id) => ({ id }));
      },
    });
    completedTransactions++;
    return result;
  } };
  const entries = new Map();
  const responseCache = createPublicResponseCache({
    async lookup(key) {
      const generations = { date: String(generation) }, entry = entries.get(key);
      return entry?.generations.date === generations.date ? entry : { generations, value: null, createdAt: null, expiresAt: null };
    },
    async fill(key, _tags, generations, value, createdAt, expiresAt) {
      entries.set(key, { generations, value, createdAt, expiresAt });
      return true;
    },
    async reconcile() { return { acknowledged: 0, removed: 0 }; },
  }, () => at);
  const cache = { read: async (...args) => { cached++; return responseCache.read(...args); } };
  const service = createMatchFeedService({ database, cache, competitionIds: [39], clock: { now: () => at },
    providerOdds: false, includePerformance: false });
  return { service, firstOrder, transactions, selections, hydration, get cached() { return cached; },
    get completedTransactions() { return completedTransactions; },
    rotate() { generation++; order = [...order.slice(1), order[0]]; return order; } };
}

test('page validation rejects an inconsistent response after the read transaction completes', async () => {
  const fixture = fixtureWindow({ knownFixtures: 0 });
  await assert.rejects(fixture.service.queryWindow(parameters, 2), (error) => error.code === 'unavailable');
  assert.equal(fixture.completedTransactions, 1);
});

test('a changed source yields adjacent exact pages from one new transaction and 100-fixture hydration batches', async () => {
  const fixture = fixtureWindow(), before = await fixture.service.query(parameters);
  const revisedOrder = fixture.rotate();
  const pages = await fixture.service.queryWindow(parameters, 2);
  const [first, second] = pages;
  assert.equal(fixture.cached, 2);
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

test('an unchanged source reuses the complete window, and a date generation change reloads it', async () => {
  const fixture = fixtureWindow(), first = await fixture.service.queryWindow(parameters, 2);
  assert.deepEqual(await fixture.service.queryWindow(parameters, 2), first);
  assert.equal(fixture.transactions.length, 1);

  const revised = fixture.rotate();
  const next = await fixture.service.queryWindow(parameters, 2);
  assert.equal(fixture.transactions.length, 2);
  assert.notEqual(next[0].paginationVersion, first[0].paginationVersion);
  assert.deepEqual(next.flatMap((page) => page.records.map(({ fixtureId }) => fixtureId)), revised);
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

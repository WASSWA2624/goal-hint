import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { createMatchFeedSummaryService } from '../src/server/matches/feed-summary-service.ts';
import { createMatchFeedSummaryHandler } from '../src/server/matches/feed-summary-http.ts';
import { fullAccess } from './helpers/full-access.ts';

const at = Date.parse('2026-10-09T08:00:00Z'), clock = { now: () => at };
const counts = { total: 80, won: 0, lost: 0, pending: 20, void: 10, unavailable: 50 };
const parameters = new URLSearchParams('date=2026-10-09&page=4&country=England&status=finished&market=match-result&prob=20-90');

function database({ summaryOnly = false } = {}) {
  const statements = [], ancillary = [];
  const tx = {
    publicCacheTag: { findMany: async () => [] },
    async $queryRaw(statement) {
      statements.push(statement);
      if (statement.sql.includes('SUM(CASE WHEN m.available=TRUE')) return [{ total: 80n, available: 30n, void: 10n, exact: null }];
      if (statement.sql.includes('SELECT STRAIGHT_JOIN f.id,f.kickoff')) return [];
      if (summaryOnly) throw new Error('A summary attempted to hydrate the discarded page.');
      if (statement.sql.includes('GROUP BY l.id')) return [{ id: 'league-1', name: 'Example', country: 'England', logoUrl: null, fixtures: 100n, knownFixtures: 100n }];
      if (statement.sql.includes('SELECT STRAIGHT_JOIN f.id')) return [];
      throw new Error('Unexpected database read.');
    },
  };
  if (!summaryOnly) {
    tx.footballImport = { findMany: async () => { ancillary.push('coverage'); return []; } };
    tx.dailyRunImport = { findMany: async () => { ancillary.push('attempts'); return []; } };
    tx.dailyRun = { findUnique: async () => { ancillary.push('run'); return null; } };
  }
  const options = [];
  return { runtime: { transaction: async (read, config) => { options.push(config); return read(tx); } }, statements, ancillary, options };
}

test('lean summaries retain exact feed counts, query filters, cohort versions and invalidation tags', async () => {
  const full = database(), lean = database({ summaryOnly: true }), descriptors = [];
  const cache = { read: async (descriptor, read) => { descriptors.push(descriptor); return read(); } };
  const fullResult = await createMatchFeedService({ database: full.runtime, competitionIds: [39], clock, cache }).query(parameters);
  const summary = await createMatchFeedSummaryService({ database: lean.runtime, competitionIds: [39], clock, cache }).query(parameters);
  assert.deepEqual(summary.performance, fullResult.performance);
  assert.deepEqual(summary.performance, counts);
  assert.equal(summary.total, fullResult.total);
  assert.equal(summary.paginationVersion, fullResult.paginationVersion);
  assert.equal(summary.asOf, fullResult.asOf);
  assert.deepEqual(descriptors[1].tags, descriptors[0].tags);
  assert.equal(descriptors[1].deadlineAt, descriptors[0].deadlineAt);
  assert.equal(descriptors[1].lifetimeMs, descriptors[0].lifetimeMs);
  assert.notEqual(descriptors[1].key, descriptors[0].key, 'compact cached projections cannot replace full feed responses');
  const fullCount = full.statements.find((statement) => statement.sql.includes('SUM(CASE WHEN m.available=TRUE'));
  const leanCount = lean.statements.find((statement) => statement.sql.includes('SUM(CASE WHEN m.available=TRUE'));
  assert.equal(leanCount.sql.slice(leanCount.sql.indexOf('FROM FootballFixture')), fullCount.sql.slice(fullCount.sql.indexOf('FROM FootballFixture')));
  assert.deepEqual(leanCount.values, fullCount.values);
  assert.equal(full.statements.length, 4);
  assert.equal(lean.statements.length, 2, 'only cohort counts and the bounded settlement audit are read');
  assert.deepEqual(full.ancillary, ['coverage', 'attempts', 'run']);
  assert.deepEqual(lean.ancillary, []);
  assert.deepEqual(lean.options, [{ isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 90_000 }]);
  assert.deepEqual(Object.keys(summary).sort(), ['asOf', 'paginationVersion', 'performance', 'total']);
});

test('summary cache identity ignores the discarded page but changes with filters', async () => {
  const keys = [], db = database({ summaryOnly: true });
  const service = createMatchFeedSummaryService({ database: db.runtime, competitionIds: [39], clock,
    cache: { read: async (descriptor, read) => { keys.push(descriptor.key); return read(); } } });
  await service.query(parameters);
  const nextPage = new URLSearchParams(parameters); nextPage.set('page', '8');
  await service.query(nextPage);
  const nextFilter = new URLSearchParams(nextPage); nextFilter.set('country', 'France');
  await service.query(nextFilter);
  assert.equal(keys[0], keys[1]); assert.notEqual(keys[1], keys[2]);
});

test('summary configuration, invalid queries and database errors retain the feed failure contract', async () => {
  assert.throws(() => createMatchFeedSummaryService({ database: {}, competitionIds: [] }), (error) => error.code === 'unavailable');
  assert.throws(() => createMatchFeedSummaryService({ database: {}, competitionIds: [39, 39] }), (error) => error.code === 'unavailable');
  let reads = 0;
  const service = createMatchFeedSummaryService({ database: { transaction: async () => { reads++; throw new Error('private database'); } }, competitionIds: [39], clock });
  await assert.rejects(service.query(new URLSearchParams('page=0')), (error) => error.code === 'invalid-query');
  assert.equal(reads, 0);
  await assert.rejects(service.query(parameters), (error) => error.code === 'unavailable' && !error.message.includes('private database'));
});

test('summary HTTP retains strict feed response-option validation without returning records', async () => {
  let reads = 0;
  const handler = createMatchFeedSummaryHandler(async (query) => {
    reads++; assert.equal(query.has('leagues'), false);
    return { performance: counts, paginationVersion: 'a'.repeat(64), asOf: at };
  }, clock, fullAccess);
  for (const query of ['leagues=1', 'leagues=0&leagues=0', 'token=private', 'page=0']) {
    assert.equal((await handler(new Request(`https://example.test/api/matches/summary?${query}`))).status, 400);
  }
  assert.equal(reads, 0);
  const response = await handler(new Request('https://example.test/api/matches/summary?date=2026-10-09&leagues=0'));
  assert.equal(response.status, 200); assert.equal(reads, 1);
  assert.deepEqual(await response.json(), { performance: counts, paginationVersion: 'a'.repeat(64), asOf: at, access: { tier: 'full', signedIn: false } });
});

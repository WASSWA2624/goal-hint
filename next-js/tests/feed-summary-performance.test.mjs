import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchFeedService, parseMatchFeedQuery, storedFeedVersions } from '../src/server/matches/feed-service.ts';
import { getReportingDate, validateReportingDateRange } from '../src/domain/calendar.ts';
import { createMatchFeedHandler } from '../src/server/matches/feed-http.ts';
import { createMatchFeedSummaryService } from '../src/server/matches/feed-summary-service.ts';
import { createMatchFeedSummaryHandler } from '../src/server/matches/feed-summary-http.ts';
import { fullAccess } from './helpers/full-access.ts';
import { createGatedFeedSummary } from '../src/server/matches/feed-summary-read.ts';

const at = Date.parse('2026-10-09T08:00:00Z'), clock = { now: () => at };
const counts = { total: 80, won: 0, lost: 0, pending: 20, void: 10, unavailable: 50 };
const parameters = new URLSearchParams('date=2026-10-09&page=4&country=England&status=finished&market=match-result&prob=20-90');

test('period scope survives source updates and table selections while versions identify the source snapshot', async () => {
  let generation = '1';
  const tx = { publicCacheTag: { findMany: async () => [{ tag: 'global:catalog', generation }] } };
  const today = getReportingDate(at), range = validateReportingDateRange(today, today, 1);
  const query = parseMatchFeedQuery(parameters, today);
  const version = q => storedFeedVersions(tx, q, today, range, [39]);
  const baseline = await version(query);
  const published = await storedFeedVersions(tx, query, today, range, [39], false, true);
  assert.notEqual(published.performanceVersion, baseline.performanceVersion);
  assert.notEqual(published.paginationVersion, baseline.paginationVersion);
  assert.notEqual(published.performanceScope, baseline.performanceScope);
  for (const result of ['won', 'lost', 'pending', 'void', 'cancelled']) {
    const selected = await version({ ...query, result, page: 9, pageSize: 100, sort: { by: 'probability', direction: 'asc' } });
    assert.equal(selected.performanceVersion, baseline.performanceVersion);
    assert.equal(selected.performanceScope, baseline.performanceScope);
    assert.notEqual(selected.paginationVersion, baseline.paginationVersion);
  }
  for (const change of [{ search: 'Club' }, { countries: ['France'] }, { markets: ['total-goals'] },
    { status: 'scheduled' }, { dates: { kind: 'date', date: '2026-10-08' } }, { zone: 'America/New_York' }]) {
    const selected = await version({ ...query, ...change });
    assert.notEqual(selected.performanceVersion, baseline.performanceVersion);
    assert.notEqual(selected.performanceScope, baseline.performanceScope);
  }
  assert.match(baseline.performanceScope, /^[a-f0-9]{64}$/u);
  generation = '2';
  const changed = await version(query);
  assert.notEqual(changed.paginationVersion, baseline.paginationVersion);
  assert.notEqual(changed.performanceVersion, baseline.performanceVersion);
  assert.equal(changed.performanceScope, baseline.performanceScope);
});

test('period scope canonicalizes equivalent dates and competition ordering and separates projection and odds policies', async () => {
  const tx = { publicCacheTag: { findMany: async () => [] } };
  const today = getReportingDate(at), range = validateReportingDateRange(today, today, 1);
  const parse = (query) => parseMatchFeedQuery(new URLSearchParams(query), today, { providerOdds: true });
  const relative = parse('when=today&odds=2.00-3.00'), pinned = parse(`date=${today}&odds=2.00-3.00`);
  const version = (query, ids, options = {}) => storedFeedVersions(tx, query, today, range, ids,
    options.completedOnly, options.publishedOnly, options.historyBefore, options.providerOdds ?? true,
    options.publishedForecasts ?? true, options.predictedMatchesOnly);
  const baseline = await version(relative, [39, 45]);
  assert.deepEqual(await version(pinned, [45, 39]), baseline);
  const predicted = await version(relative, [39, 45], { predictedMatchesOnly: true });
  assert.notEqual(predicted.paginationVersion, baseline.paginationVersion);
  assert.equal(predicted.performanceVersion, baseline.performanceVersion);
  assert.equal(predicted.performanceScope, baseline.performanceScope, 'the list only shows predictions while the audit also counts unavailable outcomes');
  assert.notEqual((await version(relative, [39, 46])).performanceScope, baseline.performanceScope);
  assert.notEqual((await version(parse('when=today&odds=2.00-4.00'), [39, 45])).performanceScope, baseline.performanceScope);
  for (const options of [{ completedOnly: true }, { publishedOnly: true }, { publishedForecasts: false }, { historyBefore: at }]) {
    assert.notEqual((await version(relative, [39, 45], options)).performanceScope, baseline.performanceScope);
  }
  const noOdds = parse('when=today');
  assert.notEqual((await version(noOdds, [39, 45], { providerOdds: false })).performanceScope, (await version(noOdds, [39, 45])).performanceScope);
});

function database({ summaryOnly = false, cancelled = 0n } = {}) {
  const statements = [], ancillary = [];
  const tx = {
    publicCacheTag: { findMany: async () => [] },
    async $queryRaw(statement) {
      statements.push(statement);
      if (statement.sql.includes('SUM(CASE WHEN m.available=TRUE')) return [{
        total: 80n, available: 30n, performanceAvailable: 30n, void: 10n, cancelled, exact: null,
      }];
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
  assert.deepEqual(summary.performance, { ...fullResult.performance, cancelled: 0 });
  assert.deepEqual(summary.performance, { ...counts, cancelled: 0 });
  assert.equal(summary.total, fullResult.total);
  assert.equal(summary.paginationVersion, fullResult.performanceVersion);
  assert.equal(summary.performanceScope, fullResult.performanceScope);
  assert.equal(descriptors[0].parse(JSON.parse(JSON.stringify(fullResult))).performanceScope, fullResult.performanceScope);
  assert.equal(descriptors[1].parse(JSON.parse(JSON.stringify(summary))).performanceScope, fullResult.performanceScope);
  const listHandler = createMatchFeedHandler(async () => fullResult, clock, fullAccess);
  const summaryHandler = createMatchFeedSummaryHandler(async () => summary, clock, fullAccess);
  const listResponse = await listHandler(new Request(`https://example.test/api/matches?${parameters}&leagues=0`));
  const summaryResponse = await summaryHandler(new Request(`https://example.test/api/matches/summary?${parameters}`));
  assert.equal(listResponse.status, 200);
  assert.equal(summaryResponse.status, 200);
  assert.equal((await listResponse.json()).performanceScope, (await summaryResponse.json()).performanceScope);
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
  assert.deepEqual(full.options, [{ isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 30_000 }]);
  assert.deepEqual(lean.options, [{ isolationLevel: 'RepeatableRead', maxWait: 10_000, timeout: 90_000 }]);
  assert.deepEqual(Object.keys(summary).sort(), ['asOf', 'paginationVersion', 'performance', 'performanceScope', 'total']);
});

test('cancelled predictions have their own category and are excluded from pending and void counts', async () => {
  const db = database({ summaryOnly: true, cancelled: 2n });
  const result = await createMatchFeedSummaryService({ database: db.runtime, competitionIds: [39], clock }).query(parameters);
  assert.deepEqual(result.performance, { ...counts, pending: 18, cancelled: 2 });
  const count = db.statements.find((statement) => statement.sql.includes('AS cancelled'));
  assert.match(count.sql, /c.state='void' AND f.status<>'canceled'/);
  assert.match(count.sql, /m.available=TRUE AND c.state='void' AND f.status='canceled'/);
});

test('summary identity ignores status selections, ordering and pagination but changes with period filters', async () => {
  const keys = [], db = database({ summaryOnly: true });
  const service = createMatchFeedSummaryService({ database: db.runtime, competitionIds: [39], clock,
    cache: { read: async (descriptor, read) => { keys.push(descriptor.key); return read(); } } });
  await service.query(parameters);
  const nextPage = new URLSearchParams(parameters); nextPage.set('page', '8');
  await service.query(nextPage);
  const nextFilter = new URLSearchParams(nextPage); nextFilter.set('country', 'France');
  await service.query(nextFilter);
  const baseline = await service.query(parameters);
  for (const result of ['won', 'lost', 'pending', 'void', 'cancelled']) {
    const selected = new URLSearchParams(parameters);
    selected.set('result', result); selected.set('sort', 'probability'); selected.set('dir', 'asc'); selected.set('pageSize', '100');
    const summary = await service.query(selected);
    assert.deepEqual(summary, baseline);
    assert.equal(keys.at(-1), keys[0]);
  }
  assert.equal(keys[0], keys[1]); assert.notEqual(keys[1], keys[2]);
});

test('only the unfiltered public summary for the current reporting day receives the longer lease', async () => {
  let descriptor;
  const publicScope = { publishedForecasts: true };
  const service = createMatchFeedSummaryService({ database: {}, competitionIds: [39], providerOdds: true, clock,
    cache: { read: async (value) => { descriptor = value; return {}; } } });
  const resolve = async (query, context = publicScope) => { await service.query(new URLSearchParams(query), context); return descriptor; };
  const today = await resolve('when=today');
  const date = await resolve('date=2026-10-09&result=pending&page=2&sort=live-first');
  assert.equal(today.lifetimeMs, 30_000);
  assert.equal(today.deadlineAt, Date.parse('2026-10-09T21:00:00Z'));
  assert.equal(today.key, date.key);
  assert.equal(today.lifetimeMs, date.lifetimeMs);
  assert.deepEqual(today.tags, ['date:2026-10-09', 'global:catalog', 'global:progress']);
  for (const query of ['date=2026-10-08', 'when=tomorrow', 'when=last-7-days', 'when=today&status=finished',
    'when=today&country=England', 'when=today&market=total-goals', 'when=today&prob=20-90',
    'when=today&odds=2.00-3.00', 'when=today&tz=Africa%2FKampala']) {
    assert.equal((await resolve(query)).lifetimeMs, 5_000, query);
  }
  for (const context of [{}, { publishedOnly: true }, { ...publicScope, completedOnly: true }]) {
    assert.equal((await resolve('when=today', context)).lifetimeMs, 5_000);
  }
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
  const performanceScope = 'b'.repeat(64);
  const scoped = createMatchFeedSummaryHandler(async () => ({ performance: counts, paginationVersion: 'a'.repeat(64), performanceScope, asOf: at }), clock, fullAccess);
  const scopedResponse = await scoped(new Request('https://example.test/api/matches/summary?date=2026-10-09'));
  assert.equal(scopedResponse.status, 200);
  assert.equal((await scopedResponse.json()).performanceScope, performanceScope);
});

test('streamed page summaries and HTTP summaries recheck restricted filters after access expires', async () => {
  for (const viaHttp of [false, true]) {
    let checks = 0, reads = 0;
    const access = async () => ({ tier: ++checks === 1 ? 'full' : 'free', signedIn: true, mode: 'on' });
    const source = async () => { reads++; return { performance: counts, paginationVersion: 'a'.repeat(64), asOf: at }; };
    const query = new URLSearchParams('date=2026-10-09&prob=60-100');
    if (viaHttp) {
      const reply = await createMatchFeedSummaryHandler(source, clock, access)(new Request(`https://example.test/api/matches/summary?${query}`));
      assert.equal(reply.status, 403);
    } else await assert.rejects(createGatedFeedSummary(source, access)(query, clock), error => error.code === 'subscription-required');
    assert.equal(reads, 1); assert.equal(checks, 2);
  }
});

test('restricted summaries refuse free viewers before querying; public summaries use the final viewer', async () => {
  let reads = 0;
  const free = async () => ({ tier: 'free', signedIn: false, mode: 'free' });
  const source = async () => { reads++; return { performance: counts, paginationVersion: 'a'.repeat(64), asOf: at }; };
  await assert.rejects(createGatedFeedSummary(source, free)(new URLSearchParams('prob=60-100'), clock), error => error.code === 'subscription-required');
  assert.equal(reads, 0);
  const reply = await createGatedFeedSummary(source, free)(new URLSearchParams('date=2026-10-09'), clock);
  assert.deepEqual(reply.access, { tier: 'free', signedIn: false });
  assert.deepEqual(reply.performance, counts);
});

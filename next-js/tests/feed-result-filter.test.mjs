import assert from 'node:assert/strict';
import test from 'node:test';
import { adjustPerformanceAvailability, displayedFeedResult, filterFeedResult, readFeedResultOverrides, resultOverridesFor } from '../src/server/matches/feed-result-filter.ts';
import { feedSql } from '../src/server/matches/feed-read.ts';
import { parseFeedQuery, resolveFeedDates } from '../src/domain/feed-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
const today = parseReportingDate('2026-11-03'), query = parseFeedQuery({ when: 'yesterday' }, { today });
const sql = feedSql(query, resolveFeedDates(query, today), [39]);

test('outcome membership is resolved across the full cohort before count and page limits', async () => {
  const rows = Array.from({ length: 65 }, (_, index) => ({ id: `match-${index}`, kickoff: new Date(index * 1000),
    cycleState: index === 2 || index === 3 ? 'void' : 'closed', fixtureStatus: index === 3 ? 'canceled' : 'finished-regulation' }));
  const tx = { $queryRaw: async statement => { assert.match(statement.sql, /m.available=TRUE/); assert.doesNotMatch(statement.sql, /OFFSET/); return rows; } };
  const audit = async (_tx, original, counts, cache, onSettled) => {
    assert.equal(original, sql); assert.equal(counts.available, 65); assert.equal(counts.void, 1); assert.equal(counts.cancelled, 1);
    assert.equal(cache, undefined);
    for (const row of rows.slice(4)) onSettled(row.id, Number(row.id.slice(6)) % 2 ? 'won' : 'lost');
    onSettled('match-1', 'cancelled');
  };
  for (const result of ['won', 'lost', 'pending', 'void', 'cancelled']) {
    const filtered = await filterFeedResult(tx, sql, result, audit);
    assert.match(filtered.where.sql, /JSON_TABLE/);
    const ids = JSON.parse(filtered.where.values.at(-1));
    const expected = result === 'pending' ? ['match-0'] : result === 'void' ? ['match-2'] : result === 'cancelled' ? ['match-1', 'match-3']
      : rows.slice(4).filter(row => Number(row.id.slice(6)) % 2 === (result === 'won' ? 1 : 0)).map(row => row.id);
    assert.deepEqual(ids, expected);
    assert.equal(filtered.pageJoins, sql.pageJoins); assert.equal(filtered.order, sql.order);
    assert.match(filtered.cohortWhere.sql, /JSON_TABLE/);
  }
});

test('no prediction is not a pending prediction; empty outcomes cannot broaden the list', async () => {
  const filtered = await filterFeedResult({ $queryRaw: async () => [] }, sql, 'pending', async () => {});
  assert.match(filtered.where.sql, /AND FALSE$/); assert.match(filtered.cohortWhere.sql, /AND FALSE$/);
});

test('a played local fixture without a replay pointer is suppressed without reading replay rows', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  let queries = 0;
  const tx = { $queryRaw: async (statement) => {
    assert.equal(++queries, 1);
    assert.match(statement.sql, /overrideReplay\.fixtureId IS NOT NULL AS hasReplay/u);
    assert.match(statement.sql, /LEFT JOIN NovemberReplayProjection overrideReplay ON overrideReplay\.fixtureId=f\.id\s+AND overrideReplay\.revisionId IS NOT NULL AND overrideReplay\.kickoffAt=f\.kickoff/u);
    assert.match(statement.sql, /overrideClose\.cycleId=c\.id\s+AND overrideClose\.fixtureId=f\.id AND overrideClose\.kind='close' AND overrideClose\.revisionId=rp\.id/u);
    return [{ id, kickoff: new Date(1), cycleState: 'closed', fixtureStatus: 'finished-regulation',
      publishedRevisionId: '00000000-0000-4000-8000-000000000002', legacyAvailable: 1,
      hasLocal: 1, hasFrozen: 0, hasReplay: 0, occurrenceVoid: 0, marketKey: null, selection: null }];
  } };
  const overrides = await readFeedResultOverrides(tx, sql, {
    publishedForecasts: true, useDefaultFeatured: true, includeSettlements: false,
  });
  assert.deepEqual([...overrides], [[id, { baseline: 'pending', result: 'unavailable', hasPrediction: false }]]);
});

test('list and summary ordering share a completed membership audit only for the same snapshot and scope', async () => {
  let reads = 0;
  const tx = { $queryRaw: async () => { reads++; return []; } };
  const options = { publishedForecasts: true, useDefaultFeatured: true };
  const snapshot = { database: {}, version: 'first', locale: 'en', providerOdds: false };
  const listed = { ...query, sort: { by: 'live-first', direction: 'desc' } };
  const listSql = feedSql(listed, resolveFeedDates(listed, today), [39]);
  const summarySql = feedSql(query, resolveFeedDates(query, today), [39]);
  const first = await readFeedResultOverrides(tx, listSql, { ...options, includeSettlements: true }, snapshot);
  assert.equal(await readFeedResultOverrides(tx, summarySql, options, snapshot), first);
  assert.equal(reads, 1);

  const other = { ...query, status: 'finished' };
  const otherSql = feedSql(other, resolveFeedDates(other, today), [39]);
  await readFeedResultOverrides(tx, otherSql, options, snapshot);
  await readFeedResultOverrides(tx, summarySql, options, { ...snapshot, version: 'changed' });
  await readFeedResultOverrides(tx, summarySql, options, { ...snapshot, database: {} });
  await readFeedResultOverrides(tx, summarySql, { ...options, includeSettlements: false }, snapshot);
  assert.equal(reads, 5);
});

test('the displayed exact grade replaces archive membership, including picks without a legacy market', async () => {
  const overrides = new Map([
    ['projected-loss', { baseline: 'pending', result: 'lost' }],
    ['exact-half-win', { baseline: 'unavailable', result: displayedFeedResult({ status: 'half-win' }, false) }],
    ['exact-half-loss', { baseline: 'pending', result: displayedFeedResult({ status: 'half-loss' }, false) }],
    ['exact-push', { baseline: 'pending', result: displayedFeedResult({ status: 'push' }, false) }],
    ['suppressed', { baseline: 'pending', result: 'unavailable' }],
  ]);
  const tx = { $queryRaw: async (statement) => {
    assert.match(statement.sql, /CAST\(f\.id AS BINARY\) NOT IN \(\s*SELECT CAST\(matched\.id AS BINARY\) FROM JSON_TABLE/u);
    assert.deepEqual(JSON.parse(statement.values.at(-1)), [...overrides.keys()]);
    return [{ id: 'legacy-win', kickoff: new Date(1), cycleState: 'closed', fixtureStatus: 'finished-regulation' }];
  } };
  const audit = async (_tx, original, counts, _cache, onSettled) => {
    assert.match(original.where.sql, /NOT IN/u);
    assert.equal(counts.available, 1);
    onSettled('legacy-win', 'won');
  };
  for (const [result, expected] of [
    ['won', ['legacy-win', 'exact-half-win']], ['lost', ['projected-loss', 'exact-half-loss']], ['void', ['exact-push']],
  ]) {
    const filtered = await filterFeedResult(tx, sql, result, audit, overrides);
    assert.deepEqual(JSON.parse(filtered.where.values.at(-1)), expected);
  }
  assert.equal(adjustPerformanceAvailability(5, overrides), 5);
  assert.deepEqual([...resultOverridesFor(overrides, 'lost').keys()], ['projected-loss', 'exact-half-loss']);
});

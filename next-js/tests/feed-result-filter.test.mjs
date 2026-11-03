import assert from 'node:assert/strict';
import test from 'node:test';
import { filterFeedResult } from '../src/server/matches/feed-result-filter.ts';
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

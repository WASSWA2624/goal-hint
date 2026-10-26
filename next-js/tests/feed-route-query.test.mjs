import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getReportingDate, parseUtcInstant } from '../src/domain/calendar.ts';
import { getFeedToday, serializeFeedQuery } from '../src/domain/feed-query.ts';
import { matchFeedRules } from '../src/domain/match-feed.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { parseMatchFeedQuery } from '../src/server/matches/feed-service.ts';

const at = parseUtcInstant('2026-10-09T08:00:00Z');
// 50 distinct leagues of the maximum 128 characters: valid item by item, too long once serialized.
const leagues = Array.from({ length: 50 }, (_, index) => `l${String(index).padStart(2, '0')}${'a'.repeat(125)}`);

test('an oversized canonical feed query is an invalid query (404), not an unhandled page error (500)', async () => {
  const query = parseMatchFeedQuery({ league: leagues.join(',') }, getReportingDate(at), { locale: 'en', asOf: at });
  assert.equal(query.leagues.length, 50);
  const today = getFeedToday(query, at), canonical = serializeFeedQuery(query, today).toString();
  assert.ok(Buffer.byteLength(canonical, 'utf8') > matchFeedRules.maximumQueryBytes);
  // The route's cached load() re-parses this canonical string, which enforces the byte limit.
  assert.throws(() => parseMatchFeedQuery(new URLSearchParams(canonical), getReportingDate(at), { locale: 'en', asOf: at }),
    (error) => error instanceof MatchFeedError && error.code === 'invalid-query');

  // That re-parse must run inside the try whose invalid-query catch calls notFound().
  const source = await readFile(new URL('../src/app/_components/feed-route.tsx', import.meta.url), 'utf8');
  const resolve = source.slice(source.indexOf('async function resolve('));
  const start = resolve.indexOf('try {'), call = resolve.indexOf('await load('), handler = resolve.indexOf('catch (error)');
  assert.ok(start !== -1 && call > start && handler > call, 'load() must run inside the invalid-query try block.');
  assert.match(resolve.slice(handler), /^catch \(error\) \{ if \(error instanceof MatchFeedError && error\.code === "invalid-query"\) notFound\(\); throw error; \}/u);
});

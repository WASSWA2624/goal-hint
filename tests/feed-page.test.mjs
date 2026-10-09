import assert from 'node:assert/strict';
import test from 'node:test';
import { getReportingDate, parseReportingDate, parseUtcInstant } from '../src/domain/calendar.ts';
import { feedDateNavigation } from '../src/domain/feed-date-navigation.ts';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { loadMatchFeedPage } from '../src/server/matches/feed-page.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';

const today = parseReportingDate('2026-10-09'), clock = { now: () => parseUtcInstant('2026-10-09T08:00:00Z') };

test('date navigation retains all applied filters and resets pagination for every link', () => {
  const query = parseFeedQuery({ date: '2020-02-29', q: 'São Club', league: 'league-1', status: 'finished',
    market: 'total-goals', sort: 'probability', page: '9', pageSize: '40' }, { today });
  const links = feedDateNavigation(query, today);
  assert.equal(links.previous.date, '2020-02-28'); assert.equal(links.next.date, '2020-03-01');
  for (const { href } of [...links.presets, links.previous, links.next]) {
    const url = new URL(href, 'https://example.test'), routeDate = url.pathname.split('/predictions/')[1];
    const next = parseFeedQuery(url.searchParams, { today, ...(routeDate ? { routeDate } : {}) });
    assert.equal(next.search, query.search); assert.equal(next.league, query.league); assert.equal(next.status, query.status);
    assert.equal(next.market, query.market); assert.deepEqual(next.sort, query.sort); assert.equal(next.page, 1); assert.equal(next.pageSize, 40);
  }
  assert.ok(links.presets.every((link) => !link.current));
});

test('presets match resolved dates across EAT midnight and seven-day ranges', () => {
  for (const [at, day] of [['2026-10-09T20:59:59.999Z', '2026-10-09'], ['2026-10-09T21:00:00Z', '2026-10-10']]) {
    const date = getReportingDate(parseUtcInstant(at)); assert.equal(date, day);
    const all = feedDateNavigation(parseFeedQuery({ when: 'next-7-days' }, { today: date }), date);
    assert.equal(all.presets.find((link) => link.current).kind, 'next-7-days');
    assert.equal(all.previous.date, day === '2026-10-09' ? '2026-10-08' : '2026-10-09');
    assert.equal(all.next.date, day === '2026-10-09' ? '2026-10-16' : '2026-10-17');
    const dated = feedDateNavigation(parseFeedQuery({ date: day }, { today: date }), date);
    assert.equal(dated.presets.find((link) => link.current).kind, 'today');
  }
});

test('adjacent links stop at the MySQL calendar boundaries', () => {
  const first = feedDateNavigation(parseFeedQuery({ date: '1000-01-01' }, { today }), today);
  const last = feedDateNavigation(parseFeedQuery({ date: '9999-12-31' }, { today }), today);
  assert.equal(first.previous, null); assert.equal(last.next, null);
});

test('page loader uses the exact URL query, locale and request clock and preserves stored response identity', async () => {
  const query = parseFeedQuery({ when: 'tomorrow', status: 'finished', page: '2' }, { today });
  const stored = Object.freeze({ asOf: clock.now() - 4000, records: [], run: null });
  let reads = 0;
  const result = await loadMatchFeedPage(query, today, clock, async (parameters, context, suppliedClock) => {
    reads++; assert.deepEqual(parseFeedQuery(parameters, { today, ...context }), query);
    assert.equal(suppliedClock, clock); return stored;
  });
  assert.equal(reads, 1); assert.equal(result.data, stored); assert.equal(result.error, null);
  assert.equal(result.data.asOf, clock.now() - 4000);
});

test('read failures remain distinct from empty data and never disclose private diagnostics', async () => {
  const query = parseFeedQuery({}, { today });
  for (const error of [new Error('mysql://private-password'), new MatchFeedError('unavailable'), new MatchFeedError('rate-limited', 11)]) {
    const result = await loadMatchFeedPage(query, today, clock, async () => { throw error; });
    assert.deepEqual(result, { data: null, error: error.code === 'rate-limited' ? 'rate-limited' : 'unavailable' });
    assert.doesNotMatch(JSON.stringify(result), /private-password|mysql:/);
  }
});

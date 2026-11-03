import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { defaultBestSlipsQuery, selectSlipSummaryResult } from '../src/domain/best-slips-query.ts';
import { applyFeedPageDefaults, parseFeedQuery, serializeFeedQuery, feedQueryHref, getFeedToday, resolveFeedDates } from '../src/domain/feed-query.ts';
import { performanceFeedQuery, selectFeedSummaryResult } from '../src/domain/feed-performance-summary.ts';
import { predictionResults } from '../src/domain/performance-summary.ts';
import { resetFeedFilters } from '../src/domain/feed-controls.ts';

const today = parseReportingDate('2026-11-03'), asOf = Date.parse(`${today}T10:00:00+03:00`);
test('every result chip on Best Slips and saved-slip history selects yesterday and restarts pagination', () => {
  for (const source of ['best', 'saved']) for (const status of predictionResults) {
    const applied = { ...defaultBestSlipsQuery(), page: 4 };
    const selected = selectSlipSummaryResult(applied, status);
    assert.deepEqual(selected, { period: 'yesterday', status, page: 1 }, source);
    assert.deepEqual(selectSlipSummaryResult(selected, 'all'), { period: 'yesterday', status: 'all', page: 1 });
  }
  const custom = { period: 'custom', from: today, to: today, status: 'all', page: 8 };
  assert.deepEqual(selectSlipSummaryResult(custom, 'void'), { ...custom, status: 'void', page: 1 });
});

test('Matches summary links retain their cohort filters and select the actual result before paging', () => {
  const input = new URLSearchParams('q=Club&country=England&market=total-goals&page=5');
  const original = applyFeedPageDefaults(parseFeedQuery(input, { today }), input, true);
  for (const result of predictionResults) {
    const next = selectFeedSummaryResult(original, result, today, asOf);
    assert.equal(next.result, result); assert.equal(next.summary, undefined); assert.equal(next.page, 1);
    assert.deepEqual(next.dates, { kind: 'yesterday' }); assert.equal(next.zone, 'Africa/Kampala');
    assert.equal(next.search, original.search); assert.deepEqual(next.countries, original.countries);
    assert.deepEqual(next.markets, original.markets); assert.equal(next.picks, original.picks);
    const href = new URL(feedQueryHref(next, today), 'https://goalhint.com');
    assert.equal(href.searchParams.get('result'), result); assert.equal(href.searchParams.get('when'), 'yesterday');
    const restored = parseFeedQuery(serializeFeedQuery(next, today), { today });
    assert.equal(restored.result, result); assert.deepEqual(restored.dates, next.dates); assert.equal(restored.zone, next.zone);
    assert.equal(performanceFeedQuery(next, today, asOf).result, undefined, 'summary totals retain all outcomes');
    assert.equal(resetFeedFilters(next).result, undefined);
  }
});

test('yesterday result navigation follows EAT across a device-calendar date boundary', () => {
  const localDay = parseReportingDate('2026-12-31'), instant = Date.parse('2026-12-31T22:00:00Z');
  const original = applyFeedPageDefaults(parseFeedQuery({ tz: 'America/New_York' }, { today: localDay }), {});
  const next = selectFeedSummaryResult(original, 'won', localDay, instant);
  assert.equal(resolveFeedDates(next, getFeedToday(next, instant)).startDate, '2026-12-31');
});

test('invalid result filters fail strictly; All clears the result without changing the date', () => {
  for (const query of ['result=incorrect', 'result=unknown', 'result=won&result=lost'])
    assert.throws(() => parseFeedQuery(new URLSearchParams(query), { today }));
  assert.equal(parseFeedQuery({ result: 'all' }, { today }).result, undefined);
  const parameters = { pageSize: '100' }, apiQuery = parseFeedQuery(parameters, { today });
  assert.equal(apiQuery.pageSize, 100, 'the transport still supports bounded batch readers');
  assert.equal(applyFeedPageDefaults(apiQuery, parameters).pageSize, 20, 'the interface always shows one 20-item page');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { defaultBestSlipsQuery, selectSlipSummaryResult } from '../src/domain/best-slips-query.ts';
import { applyFeedPageDefaults, parseFeedQuery, serializeFeedQuery, feedQueryHref, getFeedToday, resolveFeedDates } from '../src/domain/feed-query.ts';
import { performanceFeedQuery, selectFeedSummaryResult } from '../src/domain/feed-performance-summary.ts';
import { predictionResults } from '../src/domain/performance-summary.ts';
import { resetFeedFilters } from '../src/domain/feed-controls.ts';

const today = parseReportingDate('2026-11-03');
test('every Best Slips result chip retains its odds band, selects today and restarts pagination', () => {
  for (const oddsBand of ['1.5-5', '5-10', '10-20', '20-50', '50-100']) for (const status of predictionResults) {
    const applied = { ...defaultBestSlipsQuery(), oddsBand, page: 4 };
    const selected = selectSlipSummaryResult(applied, status);
    assert.deepEqual(selected, { period: 'today', oddsBand, status, page: 1 });
    assert.deepEqual(selectSlipSummaryResult(selected, 'all'), { period: 'today', oddsBand, status: 'all', page: 1 });
  }
  const custom = { period: 'custom', oddsBand: '1.5-5', from: today, to: today, status: 'all', page: 8 };
  assert.deepEqual(selectSlipSummaryResult(custom, 'void'), { period: 'today', oddsBand: custom.oddsBand, status: 'void', page: 1 });
});

test('Matches summary links retain their cohort filters and select the actual result before paging', () => {
  const input = new URLSearchParams('q=Club&country=England&market=total-goals&status=finished&tz=Africa%2FKampala&page=5');
  const original = applyFeedPageDefaults(parseFeedQuery(input, { today }), input, true);
  for (const result of predictionResults) {
    const next = selectFeedSummaryResult(original, result);
    assert.equal(next.result, result); assert.equal(next.summary, undefined); assert.equal(next.page, 1);
    assert.deepEqual(next.dates, { kind: 'today' }); assert.equal(next.zone, 'Africa/Kampala');
    assert.equal(next.search, original.search); assert.deepEqual(next.countries, original.countries);
    assert.deepEqual(next.markets, original.markets); assert.equal(next.picks, original.picks);
    const href = new URL(feedQueryHref(next, today), 'https://goalhint.com');
    assert.equal(href.searchParams.get('result'), result); assert.equal(href.searchParams.get('when'), 'today');
    const restored = parseFeedQuery(serializeFeedQuery(next, today), { today });
    assert.equal(restored.result, result); assert.deepEqual(restored.dates, next.dates); assert.equal(restored.zone, next.zone);
    assert.deepEqual(performanceFeedQuery(next), { ...original, result, page: 1 });
    assert.equal(resetFeedFilters(next).result, undefined);
  }
});

test('today result navigation retains the browsing zone across a date boundary', () => {
  const localDay = parseReportingDate('2026-12-31'), instant = Date.parse('2026-12-31T22:00:00Z');
  const original = applyFeedPageDefaults(parseFeedQuery({ tz: 'America/New_York' }, { today: localDay }), {});
  const next = selectFeedSummaryResult(original, 'won');
  assert.equal(resolveFeedDates(next, getFeedToday(next, instant)).startDate, localDay);
});

test('legacy summary-only links open the requested day, with explicit browsing dates taking precedence', () => {
  const input = new URLSearchParams('summary=yesterday');
  const query = applyFeedPageDefaults(parseFeedQuery(input, { today }), input);
  assert.equal(query.summary, undefined);
  assert.deepEqual(query.dates, { kind: 'yesterday' });
  assert.deepEqual(selectFeedSummaryResult(query, 'won').dates, query.dates);
  input.set('when', 'last-30-days');
  assert.deepEqual(applyFeedPageDefaults(parseFeedQuery(input, { today }), input).dates, { kind: 'last-30-days' });
});

test('invalid result filters fail strictly; All clears the result without changing the date', () => {
  for (const query of ['result=incorrect', 'result=unknown', 'result=won&result=lost'])
    assert.throws(() => parseFeedQuery(new URLSearchParams(query), { today }));
  assert.equal(parseFeedQuery({ result: 'all' }, { today }).result, undefined);
  const parameters = { pageSize: '100' }, apiQuery = parseFeedQuery(parameters, { today });
  assert.equal(apiQuery.pageSize, 100, 'the transport still supports bounded batch readers');
  assert.equal(applyFeedPageDefaults(apiQuery, parameters).pageSize, 50, 'the interface always shows one 50-item page');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate, addReportingDays } from '../src/domain/calendar.ts';
import { defaultBestSlipsQuery, resolveBestSlipsDates, serializeBestSlipsQuery, parseBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { applyFeedPageDefaults, parseFeedQuery, feedQueryHref, resolveFeedDates } from '../src/domain/feed-query.ts';
import { selectFeedDates, resetFeedFilters } from '../src/domain/feed-controls.ts';
import { performanceFeedQuery, checkedPeriodPerformance } from '../src/domain/feed-performance-summary.ts';
import { singleSlipPage } from '../src/domain/slip-pagination.ts';
import { createBestSlipsBrowseService } from '../src/server/slips/best-slips-browse.ts';

const today = parseReportingDate('2027-01-01');
test('entry defaults separate yesterday performance from 30 civil days of browsing, with 20 results', () => {
  const slips = defaultBestSlipsQuery();
  assert.equal(slips.summary, 'yesterday');
  assert.deepEqual(resolveBestSlipsDates(slips, today), { from: '2026-12-03', to: today });
  assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(slips), today), slips);
  const matches = applyFeedPageDefaults(parseFeedQuery({}, { today }), {});
  assert.equal(matches.pageSize, 20); assert.equal(matches.summary, 'yesterday');
  assert.deepEqual(matches.sort, { by: 'kickoff', direction: 'desc' });
  const range = resolveFeedDates(matches, today);
  assert.equal(range.startDate, '2026-12-03'); assert.equal(range.endDate, today);
  const summary = performanceFeedQuery(matches, today);
  assert.deepEqual(summary.dates, { kind: 'date', date: '2026-12-31' });
  assert.equal(summary.zone, 'Africa/Kampala'); assert.equal(summary.summary, undefined);
  assert.match(feedQueryHref({ ...matches, page: 3 }, today), /summary=yesterday/);
  const filtered = selectFeedDates(matches, { kind: 'date', date: '2026-10-01' }, today);
  assert.equal(filtered.summary, undefined); assert.deepEqual(performanceFeedQuery(filtered, today).dates, filtered.dates);
  assert.equal(resetFeedFilters(filtered).summary, 'yesterday');
  const deviceDay = parseReportingDate('2026-12-31'), asOf = Date.parse('2026-12-31T22:00:00Z');
  assert.deepEqual(performanceFeedQuery({ ...matches, zone: 'America/New_York' }, deviceDay, asOf).dates,
    { kind: 'date', date: '2026-12-31' }, 'Yesterday uses the EAT day even when the visitor is still on the previous date');
});

test('yesterday slip totals are read independently of list page, filter and today pending slips', async () => {
  const calls = [], previous = addReportingDays(today, -1);
  const counts = { total: 8, won: 3, lost: 1, pending: 2, void: 1, cancelled: 1 };
  const service = createBestSlipsBrowseService({ providerOdds: true, now: () => Date.parse(`${today}T12:00:00+03:00`),
    read: async (query) => { calls.push(query); return { day: today, state: 'generated', slips: [], searchLimited: false, partialCoverage: false,
      statistics: query.period === 'yesterday' ? counts : { ...counts, total: 100, pending: 94 },
      browse: { query, total: 100, hasMore: true, nextCursor: null, pageSize: 20, ...resolveBestSlipsDates(query, today) } }; } });
  const result = await service({ tier: 'free', signedIn: false, mode: 'off' }, { ...defaultBestSlipsQuery(), page: 3 });
  assert.deepEqual(result.summary, { from: previous, to: previous, statistics: counts });
  assert.equal(result.browse.query.page, 3); assert.equal(result.browse.total, 100);
  assert.deepEqual(calls[1], { period: 'yesterday', status: 'all', oddsBand: '1.5-5', page: 1 });
  calls.length = 0;
  const selected = await service({ tier: 'full', signedIn: true, mode: 'off' }, { period: 'today', status: 'won', page: 1 });
  assert.equal(calls.length, 1); assert.equal(selected.summary.from, today); assert.equal(selected.summary.statistics, selected.statistics);
});

function page(number, changes = {}) {
  return { day: today, state: 'generated', entitled: false, access: { tier: 'free', signedIn: false }, searchLimited: false, partialCoverage: false,
    slips: Array.from({ length: 20 }, (_, index) => ({ id: `slip-${(number - 1) * 20 + index}`, rank: index + 1 })),
    browse: { query: { ...defaultBestSlipsQuery(), page: number }, pageSize: 20, total: 300, hasMore: true, nextCursor: null,
      version: 'stable', from: '2026-12-03', to: today }, ...changes };
}
test('slip pages show at most 20 records, including legacy unpaged daily seeds', () => {
  const input = page(3, { slips: Array.from({ length: 60 }, (_, index) => ({ id: `id-${index}` })) });
  const selected = singleSlipPage(input);
  assert.equal(selected.slips.length, 20); assert.equal(selected.browse.firstPage, 3);
  assert.equal(selected.browse.total, 300); assert.equal(input.slips.length, 60);
  const { browse, ...legacy } = input; void browse;
  const first = singleSlipPage(legacy);
  assert.equal(first.slips.length, 20); assert.equal(first.browse.total, 60); assert.equal(first.browse.query.period, 'today');
});

test('a yesterday aggregate can differ from the browsing total but never from the viewer access', () => {
  const access = { tier: 'free', signedIn: false }, reply = { access, asOf: 1, paginationVersion: 'a'.repeat(64),
    performance: { total: 5, won: 1, lost: 1, pending: 1, void: 1, cancelled: 1, unavailable: 0 } };
  assert.equal(checkedPeriodPerformance(reply, { total: 200, paginationVersion: 'b'.repeat(64), access }).performance.total, 5);
  assert.throws(() => checkedPeriodPerformance(reply, { access: { tier: 'full', signedIn: true } }));
});

test('an unavailable yesterday aggregate does not discard the current browsing page or invent zero statistics', async () => {
  const service = createBestSlipsBrowseService({ providerOdds: true, now: () => Date.parse(`${today}T12:00:00+03:00`),
    read: async (query) => {
      if (query.period === 'yesterday') throw new Error('summary unavailable');
      return { ...page(1), slips: [{ rank: 1, totalOdds: '5.00', averageProbability: .7, matchCount: 4 }],
        browse: { ...page(1).browse, query } };
    } });
  const result = await service({ tier: 'free', signedIn: false, mode: 'off' }, defaultBestSlipsQuery());
  assert.equal(result.state, 'generated'); assert.equal(result.slips.length, 1); assert.equal(result.summary.statistics, null);
});

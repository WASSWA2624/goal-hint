import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { defaultBestSlipsQuery, resolveBestSlipsDates, serializeBestSlipsQuery, parseBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { applyFeedPageDefaults, getFeedToday, parseFeedQuery, feedQueryHref, resolveFeedDates } from '../src/domain/feed-query.ts';
import { selectFeedDates, resetFeedFilters } from '../src/domain/feed-controls.ts';
import { performanceFeedQuery, checkedFeedPerformance } from '../src/domain/feed-performance-summary.ts';
import { singleSlipPage } from '../src/domain/slip-pagination.ts';
import { createBestSlipsBrowseService } from '../src/server/slips/best-slips-browse.ts';

const today = parseReportingDate('2027-01-01');
test('Best Slips and Matches default to today', () => {
  const slips = defaultBestSlipsQuery();
  assert.equal(slips.summary, undefined);
  assert.deepEqual(resolveBestSlipsDates(slips, today), { from: today, to: today });
  assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(slips), today), slips);
  const matches = applyFeedPageDefaults(parseFeedQuery({}, { today }), {});
  assert.equal(matches.pageSize, 50); assert.equal(matches.summary, undefined);
  assert.deepEqual(matches.sort, { by: 'live-first', direction: 'desc' });
  const range = resolveFeedDates(matches, today);
  assert.equal(range.startDate, today); assert.equal(range.endDate, today);
  const summary = performanceFeedQuery({ ...matches, page: 3 });
  assert.deepEqual(summary, { ...matches, sort: { by: 'kickoff', direction: 'desc' } });
  assert.match(feedQueryHref({ ...matches, page: 3 }, today), /when=today/);
  const filtered = selectFeedDates(matches, { kind: 'date', date: '2026-10-01' }, today);
  assert.deepEqual(performanceFeedQuery(filtered).dates, filtered.dates);
  assert.deepEqual(resetFeedFilters(filtered).dates, { kind: 'today' });
  const zoned = performanceFeedQuery({ ...matches, zone: 'America/New_York' });
  const deviceDay = getFeedToday(zoned, Date.parse('2026-12-31T22:00:00Z'));
  assert.equal(resolveFeedDates(zoned, deviceDay).startDate, '2026-12-31');
});

test('slip summaries reuse selected-period totals independent of result filters and pagination', async () => {
  const calls = [];
  const counts = { total: 8, won: 3, lost: 1, pending: 2, void: 1, cancelled: 1 };
  const service = createBestSlipsBrowseService({ providerOdds: true, now: () => Date.parse(`${today}T12:00:00+03:00`),
    read: async (query) => { calls.push(query); return { day: today, state: 'generated', slips: [], searchLimited: false, partialCoverage: false,
      statistics: counts,
      browse: { query, total: 100, hasMore: true, nextCursor: null, pageSize: 20, ...resolveBestSlipsDates(query, today) } }; } });
  const result = await service({ tier: 'free', signedIn: false, mode: 'off' }, { ...defaultBestSlipsQuery(), period: 'last30', page: 3 });
  assert.deepEqual(result.summary, { asOf: Date.parse(`${today}T12:00:00+03:00`), from: '2026-12-03', to: today, statistics: counts });
  assert.equal(result.browse.query.page, 3); assert.equal(result.browse.total, 100);
  assert.deepEqual(calls, [{ period: 'last30', status: 'all', oddsBand: '1.5-5', page: 3 }]);
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
  const input = page(3, { slips: Array.from({ length: 60 }, (_, index) => ({ id: `id-${index}`, averageProbability: index / 100 })) });
  const selected = singleSlipPage(input);
  assert.equal(selected.slips.length, 20); assert.equal(selected.browse.firstPage, 3);
  assert.equal(selected.slips[0].id, 'id-0', 'Already paginated responses retain the server order');
  assert.equal(selected.browse.total, 300); assert.equal(input.slips.length, 60);
  const { browse, ...legacy } = input; void browse;
  const first = singleSlipPage(legacy);
  assert.equal(first.slips.length, 20); assert.equal(first.browse.total, 60); assert.equal(first.browse.query.period, 'today');
  assert.equal(first.slips[0].id, 'id-59');
  assert.equal(first.slips.at(-1).id, 'id-40');
  assert.equal(input.slips[0].id, 'id-0', 'Display sorting leaves the source untouched');
});

test('a Matches aggregate matches its period version and viewer independently of table totals', () => {
  const access = { tier: 'free', signedIn: false }, reply = { access, asOf: 1, paginationVersion: 'a'.repeat(64),
    performance: { total: 5, won: 1, lost: 1, pending: 1, void: 1, cancelled: 1, unavailable: 0 } };
  const view = { total: 1, performanceVersion: reply.paginationVersion, paginationVersion: 'b'.repeat(64), access };
  assert.equal(checkedFeedPerformance(reply, view).performance.total, 5);
  assert.equal(checkedFeedPerformance(reply, { ...view, total: 0 }).performance.total, 5);
  assert.throws(() => checkedFeedPerformance(reply, { ...view, performanceVersion: 'b'.repeat(64) }));
  assert.throws(() => checkedFeedPerformance(reply, { ...view, access: { tier: 'full', signedIn: true } }));
});

test('unavailable period statistics do not discard the list or invent zero counts', async () => {
  const service = createBestSlipsBrowseService({ providerOdds: true, now: () => Date.parse(`${today}T12:00:00+03:00`),
    read: async (query) => {
      return { ...page(1), slips: [{ rank: 1, totalOdds: '5.00', averageProbability: .7, matchCount: 4 }],
        browse: { ...page(1).browse, query } };
    } });
  const result = await service({ tier: 'free', signedIn: false, mode: 'off' }, { ...defaultBestSlipsQuery(), period: 'last30' });
  assert.equal(result.state, 'generated'); assert.equal(result.slips.length, 1); assert.equal(result.summary.statistics, null);
});

test('historical requests read their list and period totals in one snapshot', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const started = [];
  const service = createBestSlipsBrowseService({ providerOdds: true, now: () => Date.parse(`${today}T12:00:00+03:00`),
    read: async query => { started.push(query.period); await pending; return { ...page(1), browse: { ...page(1).browse, query } }; } });
  const rendering = service({ tier: 'free', signedIn: false, mode: 'free' }, { ...defaultBestSlipsQuery(), period: 'last30' });
  await new Promise(setImmediate);
  assert.deepEqual(started, ['last30']);
  release();
  assert.equal((await rendering).state, 'generated');
});

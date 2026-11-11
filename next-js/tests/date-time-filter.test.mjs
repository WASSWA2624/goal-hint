import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { dateTimeIntervalRange, localDateTimeValue, parseLocalDateTime } from '../src/domain/date-time.ts';
import { compileFeedFilterDraft, feedFilterDraft, feedFilterDraftIssues } from '../src/domain/feed-filter-draft.ts';
import { applyFeedPageDefaults, feedQueryHref, feedQueryKey, parseFeedQuery, resolveFeedDates, serializeFeedQuery } from '../src/domain/feed-query.ts';
import { resetFeedFilters, selectFeedStatus } from '../src/domain/feed-controls.ts';
import { performanceFeedQuery } from '../src/domain/feed-performance-summary.ts';
import { feedDateNavigation } from '../src/domain/feed-date-navigation.ts';
import { feedDiscovery } from '../src/domain/discovery.ts';
import { feedSql } from '../src/server/matches/feed-read.ts';

const today = parseReportingDate('2026-11-04'), zone = 'Africa/Kampala';
const parse = values => parseFeedQuery(new URLSearchParams(values), { today });
const iso = value => new Date(value).toISOString();
const sample = { from: '2026-11-04T09:00', to: '2026-11-06T17:00' };

test('draft validation separates incomplete dates, range limits and individual probability errors', () => {
  const draft = feedFilterDraft(parse({}), today, zone);
  assert.equal(feedFilterDraftIssues({ ...draft, dateTimes: { from: '', to: sample.to } }).range, null);
  assert.equal(feedFilterDraftIssues({ ...draft, dateTimes: { from: sample.to, to: sample.from } }).range, 'order');
  assert.equal(feedFilterDraftIssues({ ...draft, dateTimes: { from: '2026-01-01T00:00', to: '2027-01-02T00:00' } }).range, 'maximum');
  assert.equal(feedFilterDraftIssues({ ...draft, probability: { min: '0', max: '100' } }).minInvalid, false);
  assert.equal(feedFilterDraftIssues({ ...draft, probability: { min: '101', max: '' } }).minInvalid, true);
  assert.equal(feedFilterDraftIssues({ ...draft, probability: { min: '', max: 'no' } }).maxInvalid, true);
  assert.equal(feedFilterDraftIssues({ ...draft, probability: { min: '80', max: '20' } }).probabilityOrder, true);
});

test('continuous intervals include intervening nights and the complete final minute', () => {
  const range = dateTimeIntervalRange(sample, zone);
  assert.equal(iso(range.window.startInclusive), '2026-11-04T06:00:00.000Z');
  assert.equal(iso(range.window.endExclusive), '2026-11-06T14:01:00.000Z');
  assert.equal(range.dayCount, 3);
  const middleNight = Date.parse('2026-11-05T02:00:00+03:00');
  assert.ok(middleNight >= range.window.startInclusive && middleNight < range.window.endExclusive);
  assert.doesNotThrow(() => dateTimeIntervalRange({ from: '2026-11-04T18:00', to: '2026-11-05T09:00' }, zone));
});

test('invalid, incomplete, reversed and excessive date-time ranges fail without normalizing user input', () => {
  for (const value of ['', '2026-02-30T10:00', '2026-11-04', '2026-11-04T24:00', '2026-11-04T09:00Z', undefined]) assert.throws(() => parseLocalDateTime(value));
  assert.throws(() => dateTimeIntervalRange({ ...sample, to: '2026-11-04T08:59' }, zone));
  assert.throws(() => dateTimeIntervalRange({ ...sample, to: '2027-11-06T17:00' }, zone));
  assert.throws(() => dateTimeIntervalRange(sample, 'Invalid/Zone'));
});

test('DST gaps are rejected and repeated endpoint minutes retain both occurrences', () => {
  assert.throws(() => dateTimeIntervalRange({ from: '2026-03-08T02:30', to: '2026-03-08T03:30' }, 'America/New_York'));
  const fold = dateTimeIntervalRange({ from: '2026-11-01T01:30', to: '2026-11-01T01:30' }, 'America/New_York');
  assert.equal(iso(fold.window.startInclusive), '2026-11-01T05:30:00.000Z');
  assert.equal(iso(fold.window.endExclusive), '2026-11-01T06:31:00.000Z');
  const spring = dateTimeIntervalRange({ from: '2026-03-08T00:00', to: '2026-03-08T23:59' }, 'America/New_York');
  assert.equal(spring.window.endExclusive - spring.window.startInclusive, 23 * 3_600_000);
});

test('canonical interval URLs round-trip through Matches without ambiguous legacy date/time keys', () => {
  const query = parse({ start: sample.from, end: sample.to, tz: zone, page: '2', country: 'Uganda' });
  const href = new URL(feedQueryHref(query, today), 'https://goalhint.com');
  assert.equal(href.pathname, '/en/matches');
  assert.deepEqual(parse(href.searchParams), query);
  assert.deepEqual(parse(serializeFeedQuery(query, today)), query);
  assert.equal(feedDiscovery(query, today).eligible, false);
  assert.notEqual(feedQueryKey(query, today), feedQueryKey(parse({ start: sample.from, end: '2026-11-06T16:59', tz: zone, country: 'Uganda' }), today));
  for (const extra of [{ date: today }, { when: 'today' }, { from: today, to: today }, { timeFrom: '09:00', timeTo: '17:00' }]) {
    assert.throws(() => parse({ start: sample.from, end: sample.to, tz: zone, ...extra }));
  }
  assert.throws(() => parse({ start: sample.from, tz: zone }));
});

test('SQL uses exact interval bounds rather than repeating a daily clock window', () => {
  const query = parse({ start: sample.from, end: sample.to, tz: zone });
  const range = resolveFeedDates(query, today), sql = feedSql(query, range, [39]);
  assert.equal(query.time, undefined);
  for (const boundary of [range.window.startInclusive, range.window.endExclusive]) {
    assert.ok(sql.scope.values.some(value => value instanceof Date && value.getTime() === boundary));
  }
  assert.equal((sql.scope.sql.match(/f\.kickoff>=/gu) ?? []).length, 1);
});

test('applied instants prefill in the device zone and an unchanged draft preserves the exact original query', () => {
  const query = parse({ start: sample.from, end: sample.to, tz: zone, country: 'Uganda', league: 'league-1' });
  const draft = feedFilterDraft(query, today, 'America/New_York');
  assert.deepEqual(draft.dateTimes, { from: '2026-11-04T01:00', to: '2026-11-06T09:00' });
  assert.deepEqual(compileFeedFilterDraft(draft, today), query);
  assert.equal(localDateTimeValue(Date.parse('2026-11-04T06:00:00Z'), 'Asia/Kathmandu'), '2026-11-04T11:45');
});

test('editing a bound creates the requested continuous device-zone interval and keeps other criteria', () => {
  const query = applyFeedPageDefaults(parse({ q: 'Club', country: 'Uganda', page: '4' }), {});
  const draft = { ...feedFilterDraft(query, today, zone), dateTimes: sample };
  const selected = compileFeedFilterDraft(draft, today);
  assert.deepEqual(selected.interval, sample); assert.equal(selected.zone, zone); assert.equal(selected.page, 1);
  assert.equal(selected.summary, undefined); assert.equal(selected.time, undefined);
  assert.equal(selected.search, query.search); assert.deepEqual(selected.countries, query.countries);
  assert.equal(compileFeedFilterDraft({ ...draft, dateTimes: { ...sample, to: '' } }, today), null);
  assert.equal(compileFeedFilterDraft({ ...draft, probability: { min: '90', max: '20' } }, today), null);
});

test('legacy daily-time links remain readable; editing their bounds opts into a continuous range', () => {
  const query = parse({ from: '2026-11-04', to: '2026-11-06', timeFrom: '09:00', timeTo: '17:00', tz: zone });
  const draft = feedFilterDraft(query, today, zone);
  assert.deepEqual(draft.dateTimes, sample);
  assert.deepEqual(compileFeedFilterDraft(draft, today), query);
  const changed = compileFeedFilterDraft({ ...draft, dateTimes: { ...sample, to: '2026-11-06T18:00' } }, today);
  assert.equal(changed.time, undefined); assert.equal(changed.interval.to, '2026-11-06T18:00');
});

test('advanced filters keep the strict default until a probability edit or a historical period', () => {
  const query = applyFeedPageDefaults(parse({ status: 'live' }), {});
  const draft = feedFilterDraft(query, today, zone);
  assert.deepEqual(compileFeedFilterDraft(draft, today).probability, { min: 75, max: 100, minExclusive: true });
  assert.deepEqual(compileFeedFilterDraft({ ...draft, probabilityEdited: true }, today).probability, { min: 75, max: 100 });
  const archived = compileFeedFilterDraft({ ...draft, dateTimes: { from: '2026-10-27T00:00', to: '2026-10-27T23:59' } }, today);
  assert.equal(archived.status, 'all');
  assert.deepEqual(archived.probability, { min: 0, max: 100 });
});

test('Live, Reset and date navigation clear interval bounds while the summary retains them', () => {
  const query = parse({ start: sample.from, end: sample.to, tz: zone });
  assert.equal(selectFeedStatus(query, 'live', today).interval, undefined);
  assert.equal(resetFeedFilters(query).interval, undefined); assert.equal(resetFeedFilters(query).pageSize, 50);
  const previous = new URL(feedDateNavigation(query, today).previous.href, 'https://goalhint.com');
  assert.equal(previous.searchParams.has('start'), false);
  assert.deepEqual(performanceFeedQuery(query).interval, query.interval);
  assert.equal(applyFeedPageDefaults(parse({ pageSize: '100' }), { pageSize: '100' }).pageSize, 50);
  assert.equal(parse({ pageSize: '100' }).pageSize, 100, 'bounded API readers retain their separate limit');
});

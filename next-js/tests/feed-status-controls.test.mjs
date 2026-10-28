import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate, parseUtcInstant } from '../src/domain/calendar.ts';
import { applyFeedDraft, resetFeedFilterSection, resetFeedFilters, selectFeedDates, selectFeedStatus, synchronizeFeedStatusDates } from '../src/domain/feed-controls.ts';
import { feedFilterStatuses, feedQueryHref, getFeedToday, parseFeedQuery, resolveFeedDates } from '../src/domain/feed-query.ts';

const today = parseReportingDate('2026-10-09');
const query = input => parseFeedQuery(input, { today });

test('unified status choices retain stable transport codes and historical API capabilities', () => {
  assert.deepEqual(feedFilterStatuses, ['all', 'scheduled', 'live', 'finished']);
  const historical = query({ date: '2026-10-01', status: 'live' });
  assert.deepEqual(historical.dates, { kind: 'date', date: '2026-10-01' });
  assert.equal(query({ status: 'canceled' }).status, 'canceled');
  assert.throws(() => query({ status: 'invalid' }));
});

test('selecting Live uses Today, clears stale kickoff times and restarts pagination while preserving compatible filters', () => {
  const original = query({ from: '2026-10-01', to: '2026-10-04', tz: 'America/New_York', timeFrom: '08:00', timeTo: '10:00',
    q: 'Example', league: 'league-a', country: 'Spain', market: 'total-goals', prob: '60-90', picks: 'only', sort: 'probability', page: '4', pageSize: '40' });
  const captured = structuredClone(original), selected = selectFeedStatus(original, 'live', today);
  assert.equal(selected.status, 'live'); assert.deepEqual(selected.dates, { kind: 'today' });
  assert.equal(selected.time, undefined); assert.equal(selected.page, 1);
  for (const field of ['zone', 'search', 'leagues', 'countries', 'markets', 'probability', 'picks', 'sort', 'pageSize']) {
    assert.deepEqual(selected[field], original[field], field);
  }
  assert.deepEqual(original, captured);
  assert.equal(feedQueryHref(selected, today), '/en/matches?when=today&tz=America%2FNew_York&q=Example&league=league-a&country=Spain&status=live&market=total-goals&prob=60-90&picks=only&sort=probability&pageSize=40');
});

test('Live remains on Today across date controls until another status is selected', () => {
  const live = selectFeedStatus(query({ when: 'last-7-days' }), 'live', today);
  for (const dates of [{ kind: 'yesterday' }, { kind: 'tomorrow' }, { kind: 'next-30-days' },
    { kind: 'date', date: '2026-10-01' }, { kind: 'range', from: '2026-10-01', to: '2026-10-04' }]) {
    const selected = selectFeedDates(live, dates, today);
    assert.deepEqual(selected.dates, { kind: 'today' }); assert.equal(selected.status, 'live');
    assert.equal(selected.page, 1);
  }
  const all = selectFeedStatus(live, 'all', today), selected = selectFeedDates(all, { kind: 'next-7-days' }, today);
  assert.equal(selected.status, 'all'); assert.deepEqual(selected.dates, { kind: 'next-7-days' });
});

test('Live normalization is idempotent and preserves valid today pagination', () => {
  for (const dates of [{ date: today }, { from: today, to: today }, { when: 'today' }]) {
    const original = query({ ...dates, status: 'live', page: '3' });
    const normalized = synchronizeFeedStatusDates(original, today);
    assert.deepEqual(normalized.dates, { kind: 'today' }); assert.equal(normalized.page, 3);
    assert.equal(synchronizeFeedStatusDates(normalized, today), normalized);
  }
  const staleTime = query({ when: 'today', status: 'live', page: '3', timeFrom: '08:00', timeTo: '10:00', tz: 'Africa/Kampala' });
  const synchronized = synchronizeFeedStatusDates(staleTime, today);
  assert.equal(synchronized.page, 1); assert.equal(synchronized.time, undefined); assert.equal(synchronized.zone, 'Africa/Kampala');
});

test('Upcoming and Completed mirror incompatible relative periods and retain compatible choices', () => {
  for (const [past, future] of [['last-30-days', 'next-30-days'], ['last-7-days', 'next-7-days'], ['last-3-days', 'next-3-days']]) {
    assert.deepEqual(selectFeedStatus(query({ when: past }), 'scheduled', today).dates, { kind: future });
    assert.deepEqual(selectFeedStatus(query({ when: future }), 'finished', today).dates, { kind: past });
  }
  assert.deepEqual(selectFeedStatus(query({ when: 'yesterday' }), 'scheduled', today).dates, { kind: 'today' });
  assert.deepEqual(selectFeedStatus(query({ when: 'tomorrow' }), 'finished', today).dates, { kind: 'today' });
  for (const [status, dates] of [['scheduled', { from: '2026-10-09', to: '2026-10-15' }],
    ['finished', { from: '2026-10-01', to: '2026-10-09' }], ['all', { date: '2026-10-01' }]]) {
    const original = query({ ...dates, page: '4', league: 'league-a' }), selected = selectFeedStatus(original, status, today);
    assert.deepEqual(selected.dates, original.dates); assert.deepEqual(selected.leagues, original.leagues); assert.equal(selected.page, 1);
  }
});

test('wholly incompatible custom dates are repaired without changing compatible historical scopes', () => {
  const upcoming = synchronizeFeedStatusDates(query({ status: 'scheduled', from: '2026-10-01', to: '2026-10-04', page: '2' }), today);
  assert.deepEqual(upcoming.dates, { kind: 'next-30-days' }); assert.equal(upcoming.page, 1);
  const completed = synchronizeFeedStatusDates(query({ status: 'finished', from: '2026-10-10', to: '2026-10-14', page: '2' }), today);
  assert.deepEqual(completed.dates, { kind: 'last-30-days' }); assert.equal(completed.page, 1);
  const compatible = query({ status: 'finished', from: '2026-10-01', to: '2026-10-04', page: '2' });
  assert.equal(synchronizeFeedStatusDates(compatible, today), compatible);
});

test('submission validates malformed drafts before coordinating status and dates', () => {
  const original = query({ when: 'yesterday', status: 'live', q: 'Example', page: '3' });
  const applied = applyFeedDraft({ ...original, search: '  Example  FC  ' }, today);
  assert.deepEqual(applied.dates, { kind: 'today' }); assert.equal(applied.search, 'Example FC'); assert.equal(applied.page, 1);
  assert.throws(() => applyFeedDraft({ ...original, dates: { kind: 'range', from: '2026-10-09', to: '2026-10-01' } }, today));
  assert.throws(() => applyFeedDraft({ ...original, time: { from: '25:00', to: '26:00', zone: 'Africa/Kampala' } }, today));
  assert.throws(() => applyFeedDraft({ ...original, status: 'invalid' }, today));
});

test('Live uses the same browsing calendar date as stored queries, including midnight and zone differences', () => {
  const at = parseUtcInstant('2026-10-09T22:30:00Z');
  for (const zone of ['Africa/Kampala', 'America/New_York', 'Pacific/Kiritimati']) {
    const original = query({ status: 'live', date: '2026-10-01', tz: zone });
    const localToday = getFeedToday(original, at), synchronized = synchronizeFeedStatusDates(original, localToday);
    const range = resolveFeedDates(synchronized, localToday);
    assert.equal(range.startDate, localToday); assert.equal(range.endDate, localToday);
    assert.equal(range.dayCount, 1); assert.equal(synchronized.zone, zone);
  }
});

test('date-section reset stays compatible with status while reset-all clears the status filter', () => {
  for (const status of ['live', 'scheduled', 'finished', 'all']) {
    const original = query({ status, when: 'next-7-days', q: 'Example', timeFrom: '08:00', timeTo: '10:00', tz: 'America/New_York' });
    const section = resetFeedFilterSection(original, 'dates');
    assert.deepEqual(section.dates, { kind: 'today' }); assert.equal(section.status, status); assert.equal(section.time, undefined);
    assert.equal(section.search, 'Example'); assert.equal(section.zone, 'America/New_York');
    const all = resetFeedFilters(original);
    assert.equal(all.status, 'all'); assert.deepEqual(all.dates, { kind: 'today' }); assert.equal(all.time, undefined);
    assert.equal(all.zone, 'America/New_York'); assert.equal(all.search, '');
  }
});

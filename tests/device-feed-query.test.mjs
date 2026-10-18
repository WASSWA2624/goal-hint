import assert from 'node:assert/strict';
import test from 'node:test';
import { createPredictionWindow, getReportingDate, parseReportingDate, parseUtcInstant } from '../src/domain/calendar.ts';
import { feedQueryHref, feedQueryKey, getFeedToday, parseFeedQuery, resolveFeedDates, serializeFeedQuery } from '../src/domain/feed-query.ts';
import { checkedFeedPage, feedPageApiHref, feedPageHref } from '../src/domain/feed-pagination.ts';
import { feedDiscovery } from '../src/domain/discovery.ts';
import { createMatchFeedService, parseMatchFeedQuery } from '../src/server/matches/feed-service.ts';
import { createMatchFeedHandler } from '../src/server/matches/feed-http.ts';
import { feedSql, storedFeedRun, storedFeedRunContext } from '../src/server/matches/feed-read.ts';
import { selectionPolicy } from './helpers/selection-fixtures.mjs';

const asOf = parseUtcInstant('2026-10-13T20:45:00Z'), reportingToday = getReportingDate(asOf);
const text = (value) => new Date(value).toISOString();
const query = (parameters, at = asOf) => parseFeedQuery(new URLSearchParams(parameters), { today: getReportingDate(at), asOf: at });
function emptyDatabase(at) {
  const observed = { sql: [], tags: [], runDates: [], coverageReads: 0 };
  const tx = {
    publicCacheTag: { findMany: async ({ where }) => { observed.tags.push(...where.tag.in); return []; } },
    $queryRaw: async (statement) => {
      observed.sql.push(statement);
      return statement.sql.trimStart().startsWith('SELECT COUNT') ? [{ total: 0n, available: 0n }] : [];
    },
    // Coverage reads the whole range in one batch: the first seven days have complete receipts, the eighth none.
    footballImport: { findMany: async ({ where }) => {
      observed.coverageReads++;
      if (where.id) return [];
      return where.scopeKey.in.slice(0, 7).map((scopeKey, index) => ({ id: `receipt-${index + 1}`, scopeKey, status: 'complete', observedAt: new Date(at) }));
    } },
    dailyRunImport: { findMany: async () => [] },
    dailyRun: { findUnique: async ({ where }) => { observed.runDates.push(where.eatDate.toISOString()); return null; } },
  };
  return { observed, database: { transaction: async (operation) => operation(tx) } };
}

test('timezone survives all-day browsing and clearing only the kickoff minute filter', () => {
  const allDay = query('when=next-7-days&tz=Asia%2FTehran');
  assert.equal(allDay.zone, 'Asia/Tehran'); assert.equal(allDay.time, undefined);
  assert.deepEqual(parseFeedQuery(serializeFeedQuery(allDay, getFeedToday(allDay, asOf)), { today: reportingToday, asOf }), allDay);
  const minutes = query('timeFrom=18:00&timeTo=20:00&tz=Asia%2FTehran');
  assert.equal(serializeFeedQuery({ ...minutes, time: null }, getFeedToday(minutes, asOf)).toString(), 'tz=Asia%2FTehran');
  assert.equal(query('timeFrom=&timeTo=&tz=Asia%2FTehran').time, undefined);
  assert.throws(() => query('tz=Invalid/Zone')); assert.throws(() => query('tz=UTC&tz=Asia/Tehran'));
  assert.throws(() => serializeFeedQuery({ ...minutes, zone: 'UTC' }, reportingToday));
  assert.equal(feedDiscovery(allDay, getFeedToday(allDay, asOf)).eligible, false);
});

test('seven named local dates resolve from the captured instant rather than EAT today', () => {
  const local = query('when=next-7-days&tz=Asia%2FTehran'), range = resolveFeedDates(local, reportingToday, asOf);
  assert.equal(getFeedToday(local, asOf), '2026-10-14');
  assert.equal(range.startDate, '2026-10-14'); assert.equal(range.endDate, '2026-10-20'); assert.equal(range.dayCount, 7);
  assert.equal(text(range.window.startInclusive), '2026-10-13T20:30:00.000Z'); assert.equal(text(range.window.endExclusive), '2026-10-20T20:30:00.000Z');
  assert.deepEqual(resolveFeedDates(local, getFeedToday(local, asOf)), range);
  const behind = query('when=next-7-days&tz=Etc%2FGMT%2B12');
  assert.equal(getFeedToday(behind, asOf), '2026-10-13');
  assert.equal(text(resolveFeedDates(behind, reportingToday, asOf).window.endExclusive), '2026-10-20T12:00:00.000Z');
});

test('explicit dates remain named local dates across timezone application and date rollover', () => {
  const selected = query('from=2026-10-01&to=2026-10-07&tz=America%2FNew_York'), range = resolveFeedDates(selected, reportingToday, asOf);
  assert.equal(range.startDate, '2026-10-01'); assert.equal(range.endDate, '2026-10-07');
  assert.equal(text(range.window.startInclusive), '2026-10-01T04:00:00.000Z');
  assert.deepEqual(resolveFeedDates(selected, parseReportingDate('2026-11-01')), range);
  assert.equal(feedQueryHref(selected, reportingToday), '/en/predictions/2026-10-01?to=2026-10-07&tz=America%2FNew_York');
});

test('DST weeks preserve actual calendar bounds and timezone-sensitive cohort identities', () => {
  const at = parseUtcInstant('2026-10-31T12:00:00Z'), local = query('when=next-7-days&tz=America%2FNew_York', at);
  const day = getFeedToday(local, at), range = resolveFeedDates(local, day);
  assert.equal(range.window.endExclusive - range.window.startInclusive, 169 * 3600_000);
  assert.equal(text(range.window.endExclusive), '2026-11-07T05:00:00.000Z');
  assert.notEqual(feedQueryKey(local, day), feedQueryKey({ ...local, zone: 'UTC' }, day));
  const sql = feedSql(local, range, [39]);
  for (const boundary of [range.window.startInclusive, range.window.endExclusive]) {
    assert.ok(sql.scope.values.some((value) => value instanceof Date && value.getTime() === boundary));
  }
});

test('local envelope reports eight overlapping EAT coverage dates and retains operational run identity', async () => {
  const { database, observed } = emptyDatabase(asOf), descriptors = [];
  const service = createMatchFeedService({ database, competitionIds: [39], clock: { now: () => asOf },
    cache: { read: async (descriptor, load) => { descriptors.push(descriptor); return load(); } } });
  const response = await service.query(new URLSearchParams('when=next-7-days&tz=Asia%2FTehran'));
  assert.equal(response.today, '2026-10-14'); assert.equal(response.range.from, '2026-10-14'); assert.equal(response.range.to, '2026-10-20');
  assert.equal(text(response.range.startInclusive), '2026-10-13T20:30:00.000Z'); assert.equal(text(response.range.endExclusive), '2026-10-20T20:30:00.000Z');
  assert.deepEqual(response.coverage.dates.map((entry) => entry.date), Array.from({ length: 8 }, (_, index) => `2026-10-${13 + index}`));
  assert.equal(response.coverage.partial, true); assert.equal(response.coverage.dates.at(-1).status, 'unknown');
  assert.equal(response.state, 'data-unavailable');
  assert.deepEqual(observed.runDates, ['2026-10-13T00:00:00.000Z']); assert.equal(response.run.date, '2026-10-13');
  assert.ok(observed.tags.includes('date:2026-10-20')); assert.ok(descriptors[0].tags.includes('date:2026-10-20'));
  assert.equal(text(descriptors[0].deadlineAt), '2026-10-13T21:00:00.000Z');
  const worker = createPredictionWindow(reportingToday);
  assert.equal(worker.lastDate, '2026-10-19'); assert.equal(text(worker.endExclusive), '2026-10-19T21:00:00.000Z');
  const q = query('when=next-7-days&tz=Asia%2FTehran');
  assert.deepEqual(checkedFeedPage(response, q, response.today, 1), response);
  assert.throws(() => checkedFeedPage({ ...response, range: { ...response.range, startInclusive: worker.startInclusive } }, q, response.today, 1));
});

test('local midnight bounds explicit-date caches independently of the later EAT midnight', async () => {
  const at = parseUtcInstant('2026-10-13T20:15:00Z'), { database } = emptyDatabase(at), descriptors = [];
  const service = createMatchFeedService({ database, competitionIds: [39], clock: { now: () => at },
    cache: { read: async (descriptor, load) => { descriptors.push(descriptor); return load(); } } });
  await service.query({ date: '2026-10-13', tz: 'Asia/Tehran' });
  assert.equal(text(descriptors[0].deadlineAt), '2026-10-13T20:30:00.000Z');
});

test('pagination pins local dates and retains timezone across midnight', () => {
  const q = query('when=next-7-days&tz=Asia%2FTehran&q=Example'), day = getFeedToday(q, asOf);
  assert.equal(feedPageHref(q, day, 2), '/en/predictions/2026-10-14?to=2026-10-20&tz=Asia%2FTehran&q=Example&page=2');
  const params = new URL(feedPageApiHref(q, day, 2), 'https://example.test').searchParams;
  const after = parseMatchFeedQuery(params, parseReportingDate('2026-10-15'), { asOf: parseUtcInstant('2026-10-14T22:00:00Z') });
  assert.equal(after.dates.from, day); assert.equal(after.dates.to, '2026-10-20'); assert.equal(after.zone, 'Asia/Tehran');
});

test('run overlap compares UTC boundaries rather than local date names', async () => {
  let reads = 0;
  const range = resolveFeedDates(query('date=2026-10-20&tz=Pacific%2FKiritimati'), reportingToday);
  const run = await storedFeedRun({ dailyRun: { findUnique: async () => { reads++; return null; } } }, reportingToday, range);
  assert.equal(reads, 1); assert.equal(run.date, reportingToday);
});

test('the eighth EAT day is authorized by a frozen eight-day run, while legacy runs remain seven days', async () => {
  const range = resolveFeedDates(query('date=2026-10-20'), reportingToday);
  for (const days of [7, 8]) {
    const window = createPredictionWindow(reportingToday, days);
    const row = { id: '99999999-9999-4999-8999-999999999999', sequence: 20261013n, eatDate: new Date(`${reportingToday}T00:00:00Z`),
      selectionJson: selectionPolicy(days === 7 ? {} : { windowDays: 8 }), windowStart: new Date(window.startInclusive), windowEnd: new Date(window.endExclusive), committedAt: null };
    const context = await storedFeedRunContext({ dailyRun: { findUnique: async () => row }, dailyRunManifest: { findUnique: async () => null } }, reportingToday, range);
    assert.deepEqual(context.window, window);
    assert.equal(context.run?.phase ?? null, days === 8 ? 'selecting' : null);
  }
  const eight = createPredictionWindow(reportingToday, 8);
  const invalid = { eatDate: new Date(`${reportingToday}T00:00:00Z`), selectionJson: selectionPolicy(),
    windowStart: new Date(eight.startInclusive), windowEnd: new Date(eight.endExclusive) };
  await assert.rejects(storedFeedRunContext({ dailyRun: { findUnique: async () => invalid } }, reportingToday, range));
});

test('HTTP validation and stored reading share exactly one injected request instant', async () => {
  let clockReads = 0, receivedClock;
  const handler = createMatchFeedHandler(async (parameters, context, clock) => {
    receivedClock = clock; assert.equal(clock.now(), asOf);
    assert.equal(getFeedToday(parseFeedQuery(parameters, { today: reportingToday, asOf: clock.now() }), clock.now()), '2026-10-14');
    return { ready: true, links: { next: null, previous: null } };
  }, { now: () => { clockReads++; return asOf; } });
  const response = await handler(new Request('https://example.test/api/matches?tz=Asia%2FTehran'));
  assert.equal(response.status, 200); assert.equal(clockReads, 1); assert.equal(receivedClock.now(), asOf);
});

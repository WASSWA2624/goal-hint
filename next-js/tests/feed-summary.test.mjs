import assert from 'node:assert/strict';
import test from 'node:test';
import { checkedFeedPerformance, feedPerformanceApiHref } from '../src/domain/feed-performance-summary.ts';
import { createMatchFeedSummaryHandler } from '../src/server/matches/feed-summary-http.ts';
import { makeStore } from '../src/state/store.ts';
import { consumeRefresh, refreshApi } from '../src/state/refresh-api.ts';
import { fullAccess } from './helpers/full-access.ts';
import { liveFeed, liveRecord, query, today, now } from './helpers/live-refresh-fixtures.mjs';

const counts = { total: 1, won: 0, lost: 0, pending: 1, void: 0, unavailable: 0 };
const data = () => liveFeed([liveRecord()], { performance: counts });
const summary = (feed = data()) => ({ performance: feed.performance, asOf: feed.asOf,
  paginationVersion: feed.paginationVersion, access: feed.access });
const stored = () => { const feed = data(); Reflect.deleteProperty(feed, "access"); return feed; };

test('deferred summaries retain the exact date, timezone, filters and page while rejecting another cohort or viewer', () => {
  const applied = query('when=last-7-days&status=finished&tz=Africa%2FKampala&picks=only&page=2');
  const href = new URL(feedPerformanceApiHref(applied, today), 'https://example.test');
  assert.equal(href.pathname, '/api/matches/summary');
  assert.equal(href.searchParams.get('status'), 'finished');
  assert.equal(href.searchParams.get('page'), '2');
  assert.equal(href.searchParams.get('tz'), 'Africa/Kampala');
  assert.equal(href.searchParams.has('when'), false, 'relative dates are pinned for a pending request');
  const feed = data(), value = summary(feed);
  assert.deepEqual(checkedFeedPerformance(value, feed), value);
  for (const invalid of [{ ...value, paginationVersion: 'b'.repeat(64) },
    { ...value, access: { tier: 'free', signedIn: false } },
    { ...value, access: { tier: 'full', signedIn: true } },
    { ...value, performance: { ...counts, total: 2, pending: 2 } }]) {
    assert.throws(() => checkedFeedPerformance(invalid, feed), error => error.code === 'changed');
  }
  assert.throws(() => checkedFeedPerformance({ ...value, performance: { ...counts, won: 1 } }, feed), error => error.code === 'invalid-response');
});

test('summary HTTP uses the ordinary gated feed boundary and returns only complete counts', async () => {
  let reads = 0;
  const handler = createMatchFeedSummaryHandler(async (parameters, _context, clock) => {
    reads++; assert.equal(parameters.get('when'), 'today'); assert.equal(clock.now(), now); return stored();
  }, { now: () => now }, fullAccess);
  const response = await handler(new Request('https://example.test/api/matches/summary?when=today'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  const value = await response.json();
  assert.deepEqual(value, summary());
  assert.equal(reads, 1);
  assert.doesNotMatch(JSON.stringify(value), /fixtureId|forecast|prices|revisionId|records/);
});

test('missing audits and private filter oracles fail explicitly instead of producing invented zero outcomes', async () => {
  let reads = 0;
  const read = async () => { reads++; return { ...stored(), performance: null }; };
  const absent = await createMatchFeedSummaryHandler(read, { now: () => now }, fullAccess)(
    new Request('https://example.test/api/matches/summary?when=today'));
  assert.equal(absent.status, 503);
  assert.equal((await absent.json()).error.code, 'unavailable');
  const gated = createMatchFeedSummaryHandler(read, { now: () => now }, async () => ({ tier: 'free', signedIn: false, mode: 'off' }));
  const forbidden = await gated(new Request('https://example.test/api/matches/summary?when=today&picks=only'));
  assert.equal(forbidden.status, 403);
  assert.equal(reads, 1, 'subscriber-only filters are checked before reading');
});

test('summary consumers share one request and a cancelled view cannot cancel another subscriber', async t => {
  const original = globalThis.fetch, calls = [], pending = [];
  globalThis.fetch = async (href, options) => { calls.push({ href, options }); return new Promise(resolve => pending.push(resolve)); };
  const store = makeStore({ today, query: query(), data: null });
  t.after(() => { globalThis.fetch = original; store.dispatch(refreshApi.util.resetApiState()); });
  const args = { query: query(), today };
  const first = store.dispatch(refreshApi.endpoints.feedSummary.initiate(args));
  const second = store.dispatch(refreshApi.endpoints.feedSummary.initiate(args, { forceRefetch: true }));
  const controller = new AbortController(), cancelled = consumeRefresh(first, controller.signal);
  controller.abort(); await assert.rejects(cancelled, error => error.name === 'AbortError');
  assert.equal(calls.length, 1); assert.equal(calls[0].options.signal.aborted, false);
  assert.match(calls[0].href, /^\/api\/matches\/summary\?date=/u);
  assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.credentials, 'same-origin');
  pending.shift()(Response.json(summary()));
  assert.deepEqual(await second.unwrap(), summary()); second.unsubscribe();
});

test('an audit rechecks expired access before returning private-filter counts or a viewer projection', async () => {
  const full = await fullAccess(), free = { tier: 'free', signedIn: false, mode: 'off' };
  for (const parameters of ['when=today&picks=only', 'when=today']) {
    let checks = 0;
    const handler = createMatchFeedSummaryHandler(async () => stored(), { now: () => now }, async () => checks++ === 0 ? full : free);
    const response = await handler(new Request(`https://example.test/api/matches/summary?${parameters}`));
    assert.equal(checks, 2);
    assert.equal(response.status, parameters.includes('picks=only') ? 403 : 200);
    const body = await response.json();
    if (response.ok) assert.deepEqual(body.access, { tier: 'free', signedIn: false });
    else assert.equal(body.error.code, 'subscription-required');
  }
});

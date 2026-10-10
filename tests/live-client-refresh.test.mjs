import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fixtureAdvance } from '../src/domain/fixture-reconciliation.ts';
import { acceptRun, mergeLiveDetail, startLiveRefresh } from '../src/domain/live-refresh.ts';
import { initialLoadedFeed, replaceFeedPages } from '../src/domain/feed-pagination.ts';
import { feedQueryHref } from '../src/domain/feed-query.ts';
import { matchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { makeStore } from '../src/state/store.ts';
import { consumeRefresh, refreshApi } from '../src/state/refresh-api.ts';
import { liveDetail, liveFeed, liveRecord, liveRun, ids, query, today, now } from './helpers/live-refresh-fixtures.mjs';

test('reversed publication, locking, score/status and correction responses cannot undo accepted snapshots', () => {
  const first = liveDetail(), publication = liveDetail(liveRecord({ dataVersion: '10', forecast: {
    ...first.fixture.forecast, revisionId: randomUUID(), publishedAt: now + 1 } }));
  publication.asOf++; publication.snapshot.fixtureRevision = 2; publication.snapshot.runSequence = '20261010';
  let current = mergeLiveDetail(first, publication);
  const locked = structuredClone(current); locked.fixture.dataVersion = '11'; locked.asOf++;
  locked.fixture.cycle = { ...locked.fixture.cycle, state: 'closed', mode: 'locked', lockedAt: now + 2 };
  locked.selectedCycle = { ...locked.selectedCycle, state: 'closed', lockedRevisionId: current.snapshot.revisionId, lockedAt: now + 2 };
  locked.snapshot = { ...locked.snapshot, applicability: 'locked', cycle: locked.selectedCycle };
  const final = structuredClone(locked); final.fixture.dataVersion = '12'; final.asOf++;
  final.fixture.status = 'finished-regulation'; final.fixture.score = { home: 2, away: 0 }; final.fixture.scorePeriod = 'regulation';
  final.snapshot.outcomes = [{ family: 'match-result', cycleId: ids.cycle, revisionId: current.snapshot.revisionId,
    selection: 'home-win', status: 'correct', explanation: 'Verified result', settledAt: now + 3, correctedAt: null, voidedAt: null, reason: 'verified-result' }];
  const corrected = structuredClone(final); corrected.fixture.dataVersion = '13'; corrected.asOf++;
  corrected.fixture.score = { home: 0, away: 2 }; corrected.snapshot.outcomes[0].status = 'incorrect'; corrected.snapshot.outcomes[0].correctedAt = now + 4;
  current = mergeLiveDetail(current, corrected);
  for (const late of [final, locked, publication, first]) assert.throws(() => mergeLiveDetail(current, late), e => e.code === 'stale-data');
  assert.deepEqual(current.fixture.score, { home: 0, away: 2 }); assert.equal(current.snapshot.outcomes[0].status, 'incorrect');
  assert.equal(current.snapshot.revisionId, corrected.snapshot.revisionId);
  const forged = structuredClone(publication); forged.fixture.dataVersion = '14'; forged.asOf = current.asOf + 1;
  assert.throws(() => mergeLiveDetail(current, forged), e => e.code === 'stale-data');
});

test('cycle ordinal, run order and immutable lock references fence even higher-version malformed data', () => {
  const before = liveRecord(), nextCycle = liveRecord({ dataVersion: '12', cycleId: randomUUID(), cycle: { ...before.cycle, ordinal: 2 } });
  assert.equal(fixtureAdvance(before, nextCycle), 1);
  assert.equal(fixtureAdvance(nextCycle, { ...before, dataVersion: '13' }), -1);
  assert.equal(fixtureAdvance(nextCycle, { ...nextCycle, dataVersion: '13', cycleId: randomUUID() }), -1);
  const locked = liveRecord({ dataVersion: '10', cycle: { ...before.cycle, state: 'closed', mode: 'locked', lockedAt: now } });
  assert.equal(fixtureAdvance(locked, { ...locked, dataVersion: '11', forecast: { ...locked.forecast, revisionId: randomUUID() } }), -1);
  const sequenced = { ...before, forecast: { ...before.forecast, runSequence: '20261010' } };
  assert.equal(fixtureAdvance(sequenced, { ...sequenced, dataVersion: '11', forecast: { ...sequenced.forecast, runSequence: '20261009' } }), -1);
  const newRun = liveDetail(); newRun.snapshot.runSequence = '20261010';
  const oldRun = structuredClone(newRun); oldRun.fixture.dataVersion = '10'; oldRun.snapshot.runSequence = '20261009';
  assert.throws(() => mergeLiveDetail(newRun, oldRun), e => e.code === 'stale-data');
  const historical = structuredClone(newRun); historical.selection = 'revision'; historical.snapshot.historical = true;
  assert.throws(() => mergeLiveDetail(newRun, historical), e => e.code === 'invalid-response');
});

test('whole-revision replacement drops unsupported old families and equal versions retain accepted explanations', () => {
  const first = liveDetail(), partial = structuredClone(first); partial.fixture.dataVersion = '10';
  partial.fixture.forecast.revisionId = randomUUID(); partial.snapshot.revisionId = partial.fixture.forecast.revisionId;
  partial.fixture.forecast.markets = []; partial.snapshot.markets = [];
  partial.fixture.unavailableMarkets = ['match-result', 'double-chance', 'total-goals', 'both-teams-to-score'].map(family => ({ family, reason: 'unsupported' }));
  partial.snapshot.unavailableMarkets = partial.fixture.unavailableMarkets;
  const accepted = mergeLiveDetail(first, partial); assert.equal(accepted.snapshot.markets.length, 0);
  const conflict = structuredClone(accepted); conflict.snapshot.analysis.limitedNews = true;
  assert.equal(mergeLiveDetail(accepted, conflict).snapshot, accepted.snapshot);
  assert.equal(first.snapshot.markets.length, 2);
});

test('loaded feeds rebase atomically with run/coverage updates and reject old envelope or fixture data', () => {
  const first = liveFeed(), next = liveFeed([liveRecord({ dataVersion: '10', status: 'live', score: { home: 1, away: 0 } })],
    { asOf: now + 1, run: liveRun({ completed: 2, terminal: 2, published: 2 }) });
  const accepted = replaceFeedPages(initialLoadedFeed(first), [next]);
  assert.equal(accepted.records[0].score.home, 1); assert.equal(accepted.data.run.completed, 2);
  assert.throws(() => replaceFeedPages(accepted, [first]), e => e.code === 'stale-data');
  const older = liveFeed([liveRecord()], { asOf: now + 2 });
  assert.throws(() => replaceFeedPages(accepted, [older]), e => e.code === 'stale-data');
  assert.throws(() => acceptRun(next.run, liveRun({ sequence: '20261008' })), e => e.code === 'stale-data');
  assert.equal(acceptRun(first.run, null, '2026-10-10'), null);
});

test('unchanged forecasts retain original clocks while observation, delayed jobs and partial coverage stay fresh', () => {
  const previous = liveDetail(), next = structuredClone(previous); next.asOf++;
  next.fixture.syncedAt++; next.fixture.update.prediction = 'delayed'; next.fixture.forecast.updateDelayed = true;
  next.fixture.partialCoverage = true;
  const accepted = mergeLiveDetail(previous, next);
  assert.equal(accepted.snapshot, previous.snapshot); assert.equal(accepted.fixture.forecast.publishedAt, previous.fixture.forecast.publishedAt);
  assert.equal(accepted.fixture.syncedAt, next.fixture.syncedAt); assert.equal(accepted.fixture.update.prediction, 'delayed');
  assert.equal(accepted.fixture.forecast.updateDelayed, true); assert.equal(accepted.fixture.partialCoverage, true);
  assert.deepEqual(accepted.fixture.forecast.markets, previous.fixture.forecast.markets);
  const mixed = structuredClone(previous); mixed.snapshot.runId = randomUUID();
  assert.equal(matchDetailResponseSchema.safeParse(mixed).success, false);
  const permitted = structuredClone(previous); permitted.snapshot.analysis = { state: 'available', limitedNews: false, sources: [],
    reasons: [{ text: 'Original summary', sourceUrls: [] }, { text: 'Second summary', sourceUrls: [] }], uncertainty: { text: 'Original uncertainty', sourceUrls: [] } };
  const withdrawn = mergeLiveDetail(permitted, next);
  assert.equal(withdrawn.snapshot.analysis.state, 'withheld');
  assert.deepEqual(withdrawn.snapshot.markets, permitted.snapshot.markets);
});

test('RTK Query deduplicates consumers, cancels an obsolete consumer, and only makes anonymous stored GET reads', async (t) => {
  const original = globalThis.fetch, calls = [], pending = [];
  globalThis.fetch = async (href, options) => { calls.push({ href, options }); return new Promise(resolve => pending.push(resolve)); };
  const store = makeStore({ today, query: query(), data: null });
  t.after(() => { globalThis.fetch = original; store.dispatch(refreshApi.util.resetApiState()); });
  const args = { query: query(), today, page: 1 }, first = store.dispatch(refreshApi.endpoints.feed.initiate(args));
  const second = store.dispatch(refreshApi.endpoints.feed.initiate(args, { forceRefetch: true }));
  const controller = new AbortController(), canceled = consumeRefresh(first, controller.signal);
  controller.abort(); await assert.rejects(canceled, e => e.name === 'AbortError');
  assert.equal(calls.length, 1); assert.equal(calls[0].options.signal.aborted, false);
  const response = liveFeed(); pending.shift()(Response.json(response));
  assert.deepEqual(await second.unwrap(), response); second.unsubscribe();
  assert.match(calls[0].href, /^\/api\/matches\?date=/); assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.method, undefined); assert.equal(calls[0].options.body, undefined);
  assert.equal(makeStore({ today, query: query(), data: null }).getState().publicRefresh.queries[calls[0].href], undefined);
});

test('refresh endpoint errors and historical/foreign detail responses cannot become successful live data', async (t) => {
  const original = globalThis.fetch, store = makeStore({ today, query: query(), data: null });
  t.after(() => { globalThis.fetch = original; store.dispatch(refreshApi.util.resetApiState()); });
  const foreign = liveDetail(); foreign.fixture.fixtureId = randomUUID(); foreign.route.fixtureId = foreign.fixture.fixtureId;
  for (const [body, status, code] of [[{}, 503, 'unavailable'], [{}, 429, 'rate-limited'], [{}, 200, 'invalid-response'],
    [liveDetail(liveRecord(), { selection: 'cycle' }), 200, 'invalid-response'], [foreign, 200, 'invalid-response']]) {
    globalThis.fetch = async () => Response.json(body, { status });
    const request = store.dispatch(refreshApi.endpoints.detail.initiate(ids.fixture, { forceRefetch: true }));
    await assert.rejects(request.unwrap(), e => e.code === code); request.unsubscribe();
  }
});

function clock(at = now) {
  let visible = true, connected = true, event, time = at, sequence = 0; const timers = new Map();
  return { env: { now: () => time, available: () => visible && connected,
    schedule: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, delay }); return id; }, cancel: id => timers.delete(id),
    listen: callback => { event = callback; return () => { event = null; }; } },
    timers, set: value => { time = value; }, fire: async () => { const timer = [...timers.values()][0]; timers.clear(); time += timer.delay; timer.callback(); await new Promise(setImmediate); },
    visible: async value => { visible = value; event?.(); await new Promise(setImmediate); },
    connected: async value => { connected = value; event?.(); await new Promise(setImmediate); } };
}
test('visible polling is serial at 20 seconds, pauses hidden/offline, resumes once and stops on unmount', async () => {
  const c = clock(); let reads = 0, finish;
  const stop = startLiveRefresh({ today, interval: () => 20000, refresh: () => { reads++; return new Promise(resolve => { finish = resolve; }); }, rollover: () => {} }, c.env);
  assert.equal(reads, 0); assert.equal([...c.timers.values()][0].delay, 20000);
  await c.fire(); assert.equal(reads, 1);
  await c.visible(false); await c.visible(true); assert.equal(reads, 1);
  finish(); await new Promise(setImmediate); await c.visible(false); assert.equal(c.timers.size, 0);
  await c.visible(true); assert.equal(reads, 2); finish(); await new Promise(setImmediate);
  await c.connected(false); assert.equal(c.timers.size, 0); await c.connected(true); assert.equal(reads, 3);
  stop(); finish(); await new Promise(setImmediate); assert.equal(c.timers.size, 0);
});

test('EAT midnight rolls relative dates and seven-day URLs without changing explicit historical positions', async () => {
  const c = clock(Date.parse('2026-10-09T20:59:55Z')), rolled = []; let reads = 0;
  const stop = startLiveRefresh({ today, interval: () => 20000, refresh: async () => { reads++; }, rollover: day => rolled.push(day) }, c.env);
  assert.equal([...c.timers.values()][0].delay, 5000); await c.fire();
  assert.deepEqual(rolled, ['2026-10-10']); assert.equal(reads, 0);
  assert.equal(feedQueryHref(query('when=next-7-days&q=Club&market=total-goals'), rolled[0]), '/en?when=next-7-days&q=Club&market=total-goals');
  const historical = query('date=2026-10-01&page=3&q=Club');
  assert.equal(feedQueryHref(historical, today), feedQueryHref(historical, rolled[0]));
  await c.fire(); assert.equal(reads, 1); stop();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { canReplaceFeedPerformance, checkedFeedPerformance, retainedFeedPerformance } from '../src/domain/feed-performance-summary.ts';
import { predictedPerformanceSummary } from '../src/domain/performance-summary.ts';

test('predicted match totals include actual forecasts and exclude unavailable or filtered-out fixtures', () => {
  const counts = { total: 200, won: 30, lost: 15, pending: 50, void: 5, unavailable: 80, filteredOut: 20 };
  assert.deepEqual(predictedPerformanceSummary(counts), { total: 100, won: .3, lost: .15, pending: .5 });
});

test('outcome percentages use the complete predicted sample, including predictions later voided', () => {
  const summary = predictedPerformanceSummary({ total: 9, won: 2, lost: 1, pending: 1, void: 1, unavailable: 4 });
  assert.equal(summary.total, 5);
  assert.equal(summary.won, .4);
  assert.equal(summary.lost, .2);
  assert.equal(summary.pending, .2);
  assert.equal(summary.won + summary.lost + summary.pending, .8, 'Void predictions remain a distinct outcome');
});

test('zero predictions have no inferred outcome percentage, even when fixtures are present', () => {
  for (const total of [0, 7]) assert.deepEqual(predictedPerformanceSummary({ total, won: 0, lost: 0, pending: 0,
    unavailable: total }), { total: 0, won: null, lost: null, pending: null });
});

test('optional coverage and void counts do not change ordinary won, lost and pending proportions', () => {
  assert.deepEqual(predictedPerformanceSummary({ total: 10, won: 6, lost: 3, pending: 1 }),
    { total: 10, won: .6, lost: .3, pending: .1 });
});

test('distinct cancelled slips remain in the denominator without being counted as void twice', () => {
  assert.deepEqual(predictedPerformanceSummary({ total: 8, won: 2, lost: 1, pending: 1, void: 1, cancelled: 3 }),
    { total: 8, won: .25, lost: .125, pending: .125 });
});

const href = '/api/matches/summary?date=2026-11-28';
const observation = { requestedHref: href, currentHref: href };
const access = { tier: 'free', signedIn: false };
const list = { asOf: 100, access, performanceVersion: 'a'.repeat(64), performanceScope: '1'.repeat(64) };
const summary = (asOf, generation, overrides = {}) => ({ asOf, access, paginationVersion: generation.repeat(64),
  performanceScope: list.performanceScope, performance: { total: 50, won: 11, lost: 7, pending: 31, void: 1, unavailable: 0 }, ...overrides });
const changed = error => error.code === 'changed';

test('an exact guest summary observation can advance through multiple source generations', () => {
  const first = checkedFeedPerformance(summary(101, 'b'), list, observation);
  const second = checkedFeedPerformance(summary(103, 'c'), { ...list, asOf: 102, performanceVersion: 'b'.repeat(64) }, observation);
  assert.ok(canReplaceFeedPerformance(first, second));
  const seed = { href, reply: second, observed: true };
  assert.equal(retainedFeedPerformance(seed, href, list), seed);
  assert.equal(seed.reply.paginationVersion, 'c'.repeat(64));
  assert.equal(seed.reply.asOf, 103);
});

test('late older or equal-clock different summaries cannot replace a verified newer observation', () => {
  const accepted = checkedFeedPerformance(summary(110, 'b'), list, observation);
  for (const value of [summary(99, 'b'), summary(100, 'b')]) assert.throws(() => checkedFeedPerformance(value, list, observation), changed);
  assert.equal(canReplaceFeedPerformance(accepted, checkedFeedPerformance(summary(109, 'c'), list, observation)), false);
  assert.equal(canReplaceFeedPerformance(accepted, checkedFeedPerformance(summary(110, 'c'), list, observation)), false);
  assert.equal(canReplaceFeedPerformance(accepted, accepted), true);
});

test('summary generation relaxation requires the exact href, server cohort and anonymous viewer', () => {
  const fresh = summary(101, 'b');
  assert.throws(() => checkedFeedPerformance(fresh, list, { ...observation, currentHref: '/api/matches/summary?date=2026-11-27' }), changed);
  assert.throws(() => checkedFeedPerformance(summary(101, 'a'), list, { ...observation, currentHref: '/api/matches/summary?q=changed' }), changed);
  assert.throws(() => checkedFeedPerformance(fresh, { ...list, performanceScope: '2'.repeat(64) }, observation), changed);
  assert.throws(() => checkedFeedPerformance(fresh, { ...list, access: { tier: 'free', signedIn: true } }, observation), changed);
  for (const tier of ['free', 'full']) {
    const member = { tier, signedIn: true }, memberList = { ...list, access: member };
    assert.throws(() => checkedFeedPerformance(summary(101, 'b', { access: member }), memberList, observation), changed);
    assert.deepEqual(checkedFeedPerformance(summary(101, 'a', { access: member }), memberList, observation).access, member);
  }
});

test('SSR seeds and legacy replies still require exact generation evidence', () => {
  const fresh = summary(101, 'b');
  assert.throws(() => checkedFeedPerformance(fresh, list), changed);
  assert.equal(retainedFeedPerformance({ href, reply: fresh }, href, list), null);
  for (const [candidate, current] of [
    [{ ...fresh, performanceScope: undefined }, list],
    [fresh, { ...list, performanceScope: undefined }],
  ]) {
    assert.throws(() => checkedFeedPerformance(candidate, current, observation), changed);
    const exact = { ...candidate, paginationVersion: list.performanceVersion };
    assert.deepEqual(checkedFeedPerformance(exact, current, observation), exact);
  }
});

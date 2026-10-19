import assert from 'node:assert/strict';
import test from 'node:test';
import { gateDetailResponse, gateFeedResponse, gateInsights, isFreeFixture, usesSubscriberFeedOracle } from '../src/domain/paywall.ts';
import { matchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { matchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { mergeLiveDetail } from '../src/domain/live-refresh.ts';
import { appendFeedPage, initialLoadedFeed, replaceFeedPages } from '../src/domain/feed-pagination.ts';
import { createGatedReads } from '../src/server/members/gated-reads.ts';
import { createMatchFeedHandler } from '../src/server/matches/feed-http.ts';
import { publicMatchFailure } from '../src/server/matches/public-http.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { scenarios, today, sentinel, now } from './helpers/paywall-fixtures.mjs';

const free = { tier: 'free', signedIn: false, mode: 'on' }, full = { ...free, tier: 'full' };
const premiumKeys = new Set(['market', 'markets', 'probabilities', 'selectedProbability', 'reasons', 'uncertainty', 'alternatives', 'analysis']);
function walk(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) { assert.equal(premiumKeys.has(key), false, key); walk(item); }
}
test('only played finals, cancellations and awards are free', () => {
  for (const status of ['finished-regulation', 'finished-extra-time', 'finished-penalties', 'canceled', 'awarded']) assert.equal(isFreeFixture(status), true);
  for (const status of ['scheduled', 'live', 'postponed', 'abandoned', 'unknown']) assert.equal(isFreeFixture(status), false);
});
for (const [name, scenario] of Object.entries(scenarios)) test(`${name}: gates current and prior snapshots by fixture status and keeps raw data intact`, () => {
  const raw = JSON.stringify(scenario);
  const feed = matchFeedResponseSchema.parse(gateFeedResponse(scenario.feed, free));
  const details = [scenario.detail, scenario.prior].map(value => matchDetailResponseSchema.parse(gateDetailResponse(value, free)));
  if (!isFreeFixture(scenario.detail.fixture.status)) {
    for (const value of [feed, ...details]) {
      assert.doesNotMatch(JSON.stringify(value), /SENTINEL-|0\.6173|7\.73|"home-win"/);
      for (const record of 'records' in value ? value.records : [value.fixture]) { walk(record.forecast); assert.deepEqual(record.prices, []); }
    }
    for (const value of details) { walk(value.snapshot); assert.deepEqual(value.history, { gated: true }); assert.equal('odds' in value, false); }
  } else assert.match(JSON.stringify(details[0]), /SENTINEL-REASON-7Q/);
  assert.deepEqual(gateFeedResponse(scenario.feed, full).records, scenario.feed.records);
  assert.deepEqual(gateDetailResponse(scenario.prior, full).snapshot, scenario.prior.snapshot);
  assert.equal(JSON.stringify(scenario), raw);
  const news = gateInsights(scenario.insights, free, scenario.detail.fixture.status).sections.news.items;
  assert.equal(news.some(item => item.kind === 'analysis'), isFreeFixture(scenario.detail.fixture.status));
  assert.ok(news.some(item => item.kind === 'report'));
});
test('strict wire schemas reject full data disguised as free or gated and reject unordered families', () => {
  const scenario = scenarios.scheduled;
  const access = { tier: 'free', signedIn: false };
  assert.equal(matchFeedResponseSchema.safeParse({ ...scenario.feed, access }).success, false);
  assert.equal(matchDetailResponseSchema.safeParse({ ...scenario.detail, access }).success, false);
  const gated = gateDetailResponse(scenario.detail, free);
  for (const snapshot of [{ ...gated.snapshot, reasons: [sentinel.reason] }, { ...gated.snapshot, families: ['total-goals', 'match-result'] }]) {
    assert.equal(matchDetailResponseSchema.safeParse({ ...gated, snapshot }).success, false);
  }
});
test('parsed oracle filters detect every probability, picks, sort and odds path', () => {
  for (const query of ['', 'prob=0-100', 'status=finished', 'market=total-goals', 'sort=kickoff&dir=asc']) assert.equal(usesSubscriberFeedOracle(parseFeedQuery(new URLSearchParams(query), { today })), false);
  for (const query of ['prob=1-100', 'prob=0-99', 'sort=probability', 'picks=only', 'odds=1.50-3.00']) {
    assert.equal(usesSubscriberFeedOracle(parseFeedQuery(new URLSearchParams(query), { today, providerOdds: true })), true);
  }
});
test('oracle requests return nonrecoverable private 403 before any raw read', async () => {
  for (const query of ['prob=1-100', 'sort=probability', 'picks=only', 'odds=1.50-3.00']) {
    const response = await createMatchFeedHandler(async () => { assert.fail('oracle read'); }, { now: () => now }, async () => free)(new Request(`https://example.test/api/matches?${query}`));
    assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
    assert.equal(response.headers.get('set-cookie'), null);
    const body = await response.json(); assert.equal(body.error.code, 'subscription-required'); assert.equal(body.error.recoverable, false);
  }
  assert.equal(publicMatchFailure(new MatchFeedError('subscription-required')).status, 403);
});
test('free and failing resolvers never read slips and malformed gated bodies fail closed', async () => {
  for (const resolveAccess of [async () => free, async () => { throw Error('private'); }]) {
    const reads = createGatedReads({ resolveAccess, readSlips: async () => { assert.fail('slips read'); }, readDetail: async () => ({ ...scenarios.scheduled.detail, secret: 'private' }) });
    await assert.rejects(reads.slips({}), e => e.code === 'subscription-required');
    await assert.rejects(reads.detail(scenarios.scheduled.detail.fixture.fixtureId), e => e.code === 'unavailable');
  }
});
test('equal-version expiry or revocation withdraws all accepted prediction content', () => {
  const before = gateDetailResponse(scenarios.scheduled.detail, full), after = gateDetailResponse(scenarios.scheduled.detail, free);
  const merged = mergeLiveDetail(before, after);
  assert.deepEqual(merged, after); assert.doesNotMatch(JSON.stringify(merged), /SENTINEL-|0\.6173|7\.73/);
  assert.deepEqual(mergeLiveDetail(before, { ...after, asOf: after.asOf - 1 }), { ...after, asOf: after.asOf - 1 });
  const view = initialLoadedFeed(gateFeedResponse(scenarios.scheduled.feed, full)), page = gateFeedResponse(scenarios.scheduled.feed, free);
  assert.throws(() => appendFeedPage(view, page), e => e.code === 'subscription-required');
  assert.throws(() => replaceFeedPages(view, [page]), e => e.code === 'subscription-required');
});

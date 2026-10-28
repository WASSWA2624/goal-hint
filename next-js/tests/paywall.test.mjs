import assert from 'node:assert/strict';
import test from 'node:test';
import { gateDetailResponse, gateFeedResponse, gateInsights, usesSubscriberFeedOracle } from '../src/domain/paywall.ts';
import { matchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { matchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { mergeLiveDetail } from '../src/domain/live-refresh.ts';
import { appendFeedPage, initialLoadedFeed, replaceFeedPages } from '../src/domain/feed-pagination.ts';
import { createGatedReads } from '../src/server/members/gated-reads.ts';
import { createMatchFeedHandler } from '../src/server/matches/feed-http.ts';
import { publicMatchFailure } from '../src/server/matches/public-http.ts';
import { sameCardFixture } from '../src/domain/match-card.ts';
import { cheapestActivePlan } from '../src/domain/subscription-offer.ts';
import { createMessages } from '../src/i18n/messages.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { isPlayedFinalStatus } from '../src/domain/market-settlement.ts';
import { subscriberHref } from '../src/domain/subscriber-navigation.ts';
import { scenarios, today, sentinel, now } from './helpers/paywall-fixtures.mjs';

const free = { tier: 'free', signedIn: false, mode: 'on' }, full = { ...free, tier: 'full' };
const premiumKeys = new Set(['market', 'markets', 'selectedProbability', 'reasons', 'uncertainty', 'alternatives', 'analysis']);
function walk(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) { assert.equal(premiumKeys.has(key), false, key); walk(item); }
}
for (const [name, scenario] of Object.entries(scenarios)) test(`${name}: exposes probabilities, unlocks finished history, and preserves raw data`, () => {
  const raw = JSON.stringify(scenario);
  const feed = matchFeedResponseSchema.parse(gateFeedResponse(scenario.feed, free));
  const details = [scenario.detail, scenario.prior].map(value => matchDetailResponseSchema.parse(gateDetailResponse(value, free)));
  if (isPlayedFinalStatus(scenario.detail.fixture.status)) {
    assert.deepEqual(feed.records, scenario.feed.records);
    assert.deepEqual(details[0].snapshot, scenario.detail.snapshot);
    assert.deepEqual(details[1].history, scenario.prior.history);
    assert.equal('odds' in details[0], true);
  } else {
    for (const value of [feed, ...details]) {
      assert.doesNotMatch(JSON.stringify(value), /SENTINEL-|7\.73|"home-win"/);
      for (const record of 'records' in value ? value.records : [value.fixture]) { walk(record.forecast); assert.deepEqual(record.prices, []); if (record.forecast) assert.equal(record.forecast.probabilities[0].probability, sentinel.probability); }
    }
    for (const value of details) { walk(value.snapshot); assert.deepEqual(value.history, { gated: true }); assert.equal('odds' in value, false); }
  }
  assert.deepEqual(gateFeedResponse(scenario.feed, full).records, scenario.feed.records);
  assert.deepEqual(gateDetailResponse(scenario.prior, full).snapshot, scenario.prior.snapshot);
  assert.equal(JSON.stringify(scenario), raw);
  const news = gateInsights(scenario.insights, free).sections.news.items;
  assert.equal(news.some(item => item.kind === 'analysis'), false);
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

test('all played final statuses expose the original result and revision to guests and unsubscribed members', () => {
  const original = scenarios['finished-regulation'].detail;
  for (const status of ['finished-regulation', 'finished-extra-time', 'finished-penalties']) {
    const raw = { ...original, fixture: { ...original.fixture, status } };
    for (const signedIn of [false, true]) {
      const response = matchDetailResponseSchema.parse(gateDetailResponse(raw, { ...free, signedIn }));
      assert.deepEqual(response.snapshot, raw.snapshot);
      assert.deepEqual(response.history, raw.history);
      assert.deepEqual(response.fixture.prices, raw.fixture.prices);
    }
  }
});
test('probability filters and finished odds are public; active selection and price oracles stay locked', () => {
  for (const query of ['', 'prob=0-100', 'status=finished', 'market=total-goals', 'sort=kickoff&dir=asc', 'prob=1-100', 'prob=0-99', 'sort=probability', 'status=finished&picks=only', 'status=finished&odds=1.50-3.00']) assert.equal(usesSubscriberFeedOracle(parseFeedQuery(new URLSearchParams(query), { today, providerOdds: true })), false);
  for (const query of ['picks=only', 'odds=1.50-3.00']) {
    assert.equal(usesSubscriberFeedOracle(parseFeedQuery(new URLSearchParams(query), { today, providerOdds: true })), true);
  }
});
test('oracle requests return nonrecoverable private 403 before any raw read', async () => {
  for (const query of ['picks=only', 'odds=1.50-3.00']) {
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
  assert.deepEqual(merged, after); assert.doesNotMatch(JSON.stringify(merged), /SENTINEL-|7\.73/);
  assert.deepEqual(mergeLiveDetail(before, { ...after, asOf: after.asOf - 1 }), { ...after, asOf: after.asOf - 1 });
  const view = initialLoadedFeed(gateFeedResponse(scenarios.scheduled.feed, full)), page = gateFeedResponse(scenarios.scheduled.feed, free);
  assert.throws(() => appendFeedPage(view, page), e => e.code === 'changed');
  assert.throws(() => replaceFeedPages(view, [page]), e => e.code === 'changed');
});


test('equal-version card variants invalidate memoization in both directions', () => {
  const full = scenarios.scheduled.feed.records[0];
  const gated = { ...full, forecast: gateFeedResponse(scenarios.scheduled.feed, free).records[0].forecast };
  assert.equal(sameCardFixture(full, gated), false);
  assert.equal(sameCardFixture(gated, full), false);
  assert.equal(sameCardFixture(gated, { ...gated }), true);
});
test('public offer uses the cheapest active purchase, retains owner ordering for ties, and exposes only price and days', () => {
  const plan = (priceUgx, durationDays, active = true) => ({ priceUgx, durationDays, active, id: 'private', name: 'Owner plan' });
  assert.equal(cheapestActivePlan([]), null);
  assert.equal(cheapestActivePlan([plan(100, 1, false)]), null);
  assert.deepEqual(cheapestActivePlan([plan(5000, 7), plan(100, 30, false), plan(1000, 1), plan(1000, 2)]), { priceUgx: 1000, durationDays: 1 });
  const messages = createMessages('en');
  assert.equal(messages.text('paywall.from', { price: messages.number(1000), days: messages.plural('paywall.days', 1) }), 'From UGX 1,000 for 1 day.');
  assert.equal(messages.plural('paywall.days', 2), '2 days');
});


test('finished analysis is public only with verified canonical final status', async () => {
  const fixture = scenarios['finished-regulation'];
  for (const status of ['finished-regulation', 'finished-extra-time', 'finished-penalties']) {
    const insights = await createGatedReads({ resolveAccess: async () => free, readInsights: async () => fixture.insights, readStatus: async () => status }).insights(fixture.detail.fixture.fixtureId);
    assert.equal(insights.sections.news.items.some(item => item.kind === 'analysis'), true);
  }
  const insights = await createGatedReads({ resolveAccess: async () => free, readInsights: async () => fixture.insights, readStatus: async () => { throw Error('unavailable'); } }).insights(fixture.detail.fixture.fixtureId);
  assert.equal(insights.sections.news.items.some(item => item.kind === 'analysis'), false);
});

test('locked destinations preserve safe return paths and distinguish guests from members', () => {
  assert.equal(subscriberHref(false, '/en/matches'), '/en/account?view=register&return=%2Fen%2Fmatches');
  assert.equal(subscriberHref(true, '/en/slips'), '/en/subscribe?return=%2Fen%2Fslips');
  assert.equal(subscriberHref(false, 'https://outside.test'), '/en/account?view=register');
  assert.equal(subscriberHref(false, '/en', 'login'), '/en/account?view=login&return=%2Fen');
  assert.equal(subscriberHref(true, '/en', 'login'), '/en/subscribe?return=%2Fen');
  assert.equal(subscriberHref(false, 'https://outside.test', 'login'), '/en/account?view=login');
});

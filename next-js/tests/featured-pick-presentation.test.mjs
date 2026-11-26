import assert from 'node:assert/strict';
import test from 'node:test';
import { featuredPredictionSchema, featuredPriceValue, retrospectivePredictionSchema } from '../src/domain/extended-markets.ts';
import { binaryFeaturedSettlement, localFeaturedDecisionVersion, modeledFeaturedReturn } from '../src/domain/local-featured-decision.ts';
import { parseDecimalOdds } from '../src/domain/odds.ts';
import { fixtureSnapshotSchema } from '../src/domain/fixture-snapshot.ts';
import { gateFixture } from '../src/domain/paywall.ts';
import { toFeaturedLocalDecision } from '../src/server/matches/featured-pick-presentation.ts';
import { scenarios } from './helpers/paywall-fixtures.mjs';

const fixture = scenarios.scheduled.detail.fixture;
const cutoff = fixture.kickoffAt - 300_000;
const decision = { version: 'local-featured-pre-match-v3', marketKey: 'goal:full-time:totals:total:4.5:binary', selection: 'under', probability: 0.7 };
const quote = { bookmakerId: 6, bookmakerName: 'Synthetic bookmaker', betId: 5, betName: 'Goals Over/Under',
  providerSelection: 'Under 4.5', decimal: '1.25', observedAt: cutoff - 1000, checkedAt: cutoff,
  providerUpdatedAt: null, snapshotId: 'b'.repeat(64), receiptId: 'c'.repeat(64) };
const fallback = { ...decision, status: 'priced', tier: 'priced-fallback', expectedNetReturn: '-0.125', quote };
const forecastOnly = { ...decision, status: 'forecast-only', reason: 'no-comparable-quote' };

test('the public fallback preserves the exact signed return while restricting saved quote provenance to public fields', () => {
  const pick = featuredPredictionSchema.parse(toFeaturedLocalDecision(fallback));
  assert.deepEqual([pick.key, pick.selection, pick.tier, pick.odds, pick.featuredExpectedNetReturn],
    [decision.marketKey, decision.selection, 'priced-fallback', '1.25', '-0.125']);
  assert.deepEqual([pick.featuredQuote.bookmakerId, pick.featuredQuote.checkedAt], [6, cutoff]);
  assert.equal(pick.featuredQuote.snapshotId, undefined);
  assert.equal(pick.featuredQuote.receiptId, undefined);
  assert.equal(featuredPredictionSchema.safeParse({ ...pick, tier: 'standard' }).success, false);
});

test('forecast-only preserves the selection and names the actual odds restriction', () => {
  const pick = retrospectivePredictionSchema.parse(toFeaturedLocalDecision(forecastOnly));
  const withheld = featuredPredictionSchema.parse(toFeaturedLocalDecision(fallback, 'en', false));
  assert.equal(pick.forecastOnlyReason, 'no-comparable-quote');
  assert.deepEqual(withheld, { ...pick, forecastOnlyReason: 'odds-not-permitted' });
  assert.equal(pick.odds, null);
  assert.equal(pick.featuredQuote, undefined);
  assert.equal(featuredPredictionSchema.safeParse({ ...pick, odds: '1.25' }).success, false);
  assert.equal(featuredPredictionSchema.safeParse({ ...pick, forecastOnlyReason: undefined }).success, false);
  assert.equal(toFeaturedLocalDecision({ ...fallback, version: localFeaturedDecisionVersion }, 'en', false), null);
});

test('the shared featured V threshold uses the exact covered quote and is inclusive at 5%', () => {
  const decimal = '1.5';
  const expectedNetReturn = modeledFeaturedReturn(binaryFeaturedSettlement(0.7), parseDecimalOdds(decimal), 'binary');
  const pick = featuredPredictionSchema.parse(toFeaturedLocalDecision({ ...fallback, tier: 'standard', expectedNetReturn, quote: { ...quote, decimal } }));
  assert.equal(featuredPriceValue(pick, '1.50'), '0.05');
  assert.equal(featuredPriceValue({ ...pick, featuredExpectedNetReturn: '0.0499999999999999999999999999' }, '1.50'), null);
  assert.equal(featuredPriceValue({ ...pick, featuredExpectedNetReturn: '0.0500000000000000000000000001' }, '1.50'), '0.0500000000000000000000000001');
  assert.equal(featuredPriceValue(pick, '1.5001'), null);
  assert.equal(featuredPriceValue(pick, null), null);
  assert.equal(featuredPriceValue(toFeaturedLocalDecision(forecastOnly), null), null);
  assert.equal(featuredPriceValue(toFeaturedLocalDecision(fallback), fallback.quote.decimal), null);
  assert.equal(featuredPriceValue(toFeaturedLocalDecision({ ...fallback, tier: 'standard', expectedNetReturn, quote: { ...quote, decimal } }, 'en', false), '1.50'), null);
});

test('unfinished access redacts the frozen default and featured tier without affecting the fixture', () => {
  const pick = toFeaturedLocalDecision(fallback);
  const live = fixtureSnapshotSchema.parse({ ...fixture, status: 'live', featuredPrediction: pick, featuredDecisionFrozen: true,
    cycle: { ...fixture.cycle, state: 'closed', mode: 'locked', lockedAt: cutoff } });
  assert.equal(fixtureSnapshotSchema.safeParse({ ...live, featuredDecisionFrozen: null }).success, false);
  const free = fixtureSnapshotSchema.parse(gateFixture(live, { tier: 'free', signedIn: false }));
  assert.equal(free.status, 'live');
  assert.equal(free.forecast.gated, true);
  assert.equal(free.featuredPrediction, null);
  assert.equal(free.featuredDecisionFrozen, null);
});

test('the same void occurrence retains a previously frozen selection without allowing early grading', () => {
  const pick = { ...toFeaturedLocalDecision(fallback), settlementStatus: 'void' };
  const value = { ...fixture, status: 'canceled', featuredPrediction: pick, featuredDecisionFrozen: true,
    cycle: { ...fixture.cycle, state: 'void', mode: 'void', lockedAt: cutoff,
      voidReason: { code: 'fixture-canceled', explanation: 'The fixture was cancelled.' } } };
  assert.equal(fixtureSnapshotSchema.parse(value).featuredPrediction.selection, 'under');
  assert.equal(fixtureSnapshotSchema.safeParse({ ...value, status: 'postponed' }).success, false);
  assert.equal(fixtureSnapshotSchema.safeParse({ ...value, featuredPrediction: { ...pick, settlementStatus: 'correct' } }).success, false);
});

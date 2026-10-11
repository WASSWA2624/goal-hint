import assert from 'node:assert/strict';
import test from 'node:test';
import { fixturePriceSchema, parseFixtureSnapshot } from '../src/domain/fixture-snapshot.ts';
import { mergeFixtureObservation } from '../src/domain/fixture-reconciliation.ts';
import { sameCardFixture, selectedCardPrice } from '../src/domain/match-card.ts';
import { matchFeedRecordSchema } from '../src/domain/match-feed.ts';
import { marketRules, validateMarketSnapshot } from '../src/domain/markets.ts';
import { fixture, now } from './helpers/client-state-fixtures.mjs';
import { liveRecord } from './helpers/live-refresh-fixtures.mjs';

// Prompt 052 read path: a price belongs to exactly one published pick of its own family. Prices are synthetic.
const period = marketRules.period;
const markets = Object.values(validateMarketSnapshot({
  'match-result': { source: 'ai', period, probabilities: { 'home-win': 0.6, draw: 0.25, 'away-win': 0.15 } },
  'total-goals': { source: 'ai', period, line: 2.5, probabilities: { 'over-2.5': 0.55, 'under-2.5': 0.45 } },
}).markets).filter((entry) => entry.available).map((entry) => ({ market: entry.market, reasons: ['Synthetic explanation'], uncertainty: null }));
const price = (family, selection, value, overrides = {}) => ({ family, selection, price: value, basis: 'bookmaker', retrievedAt: now - 60_000,
  providerUpdatedAt: now - 120_000, ...overrides });
const home = price('match-result', 'home-win', '1.85'), over = price('total-goals', 'over-2.5', '1.90');
const priced = (prices, overrides = {}) => fixture({ forecast: { runId: 'run-z', revisionId: 'revision-z', publishedAt: now, markets }, prices, ...overrides });

test('fixture prices validate against the published picks, two places and no bookmaker identity', () => {
  assert.deepEqual(priced([home, over]).prices, [home, over]);
  assert.deepEqual(priced([]).prices, []);
  assert.equal(priced(undefined).prices, undefined, 'older snapshots without prices stay valid');
  for (const prices of [
    [price('both-teams-to-score', 'yes', '1.80')], // a family with no published pick
    [price('match-result', 'away-win', '4.20')], // another selection of the shown family
    [home, home], // one price per family
    [price('match-result', 'home-win', '1.855')], [price('match-result', 'home-win', '1.8')], [price('match-result', 'home-win', '01.85')],
    [price('match-result', 'home-win', 1.85)], [price('match-result', 'home-win', '10000.00')],
    [{ ...home, bookmakerName: 'Synthetic bookmaker' }], [{ ...home, link: 'https://example.test/bet' }], [{ ...home, basis: 'exchange' }],
    [{ ...home, retrievedAt: now + 0.5 }], [{ ...home, providerUpdatedAt: undefined }],
  ]) {
    assert.throws(() => priced(prices), undefined, JSON.stringify(prices).slice(0, 120));
  }
  assert.throws(() => fixture({ forecast: null, cycleId: null, prices: [home] }), undefined, 'no forecast means no price');
  assert.equal(fixturePriceSchema.safeParse({ ...home, providerUpdatedAt: null }).success, true);
  assert.equal(fixturePriceSchema.safeParse({ ...home, price: '9999.99' }).success, true);
});

test('feed records default to no prices, so cached pre-052 records and the rights-off projection stay empty', () => {
  const record = liveRecord();
  assert.deepEqual(record.prices, []);
  const legacy = { ...record }; delete legacy.prices;
  assert.deepEqual(matchFeedRecordSchema.parse(legacy).prices, []);
  assert.equal(matchFeedRecordSchema.safeParse({ ...record, prices: [price('match-result', 'draw', '3.40')] }).success, false);
  assert.deepEqual(matchFeedRecordSchema.parse({ ...record, prices: [home] }).prices, [home]);
});

test('the card price is the shown pick\'s own price; another family, line or selection never fills it', () => {
  const both = priced([home, over]);
  assert.deepEqual(selectedCardPrice(both, 'match-result'), home);
  assert.deepEqual(selectedCardPrice(both, 'total-goals'), over);
  const goalsOnly = priced([over]);
  assert.equal(selectedCardPrice(goalsOnly, 'match-result'), null, 'no fallback to the total-goals price');
  assert.equal(selectedCardPrice(goalsOnly, 'both-teams-to-score'), null, 'no pick, no price');
  assert.equal(selectedCardPrice(priced(undefined), 'match-result'), null);
  // Defence in depth for hand-built objects that skipped validation.
  assert.equal(selectedCardPrice({ ...both, prices: [price('match-result', 'away-win', '4.20')] }, 'match-result'), null);
  assert.equal(selectedCardPrice({ ...both, forecast: null }, 'match-result'), null);
});

test('equal-version observations carry price changes and card memoization notices them', () => {
  const previous = priced([home]);
  const moved = priced([{ ...home, price: '1.90', retrievedAt: now }]);
  assert.equal(sameCardFixture(previous, priced([home])), true);
  assert.equal(sameCardFixture(previous, moved), false);
  assert.equal(sameCardFixture(previous, priced([])), false);
  assert.equal(sameCardFixture(previous, priced([{ ...home, providerUpdatedAt: null }])), false);
  assert.equal(sameCardFixture(priced(undefined), priced([])), true, 'absent and empty prices both mean no price');
  assert.deepEqual(mergeFixtureObservation(previous, moved).prices, moved.prices);
  assert.deepEqual(mergeFixtureObservation(previous, priced([])).prices, []);
  assert.deepEqual(mergeFixtureObservation(previous, priced(undefined)).prices, [home], 'a snapshot without the field keeps the accepted prices');
  // Another revision at the same version is incoherent: nothing is adopted, prices included.
  const other = parseFixtureSnapshot({ ...moved, forecast: { ...moved.forecast, revisionId: 'revision-other' } });
  assert.strictEqual(mergeFixtureObservation(previous, other), previous);
});

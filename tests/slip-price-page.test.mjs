import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { marketRules, marketSelections, validateMarketSnapshot } from '../src/domain/markets.ts';
import { slipPricePageRules, slipPricePageSchema } from '../src/domain/slip-price-page.ts';
import { liveFeed, liveRecord, now } from './helpers/live-refresh-fixtures.mjs';

function price(family = 'match-result', selection = 'draw', overrides = {}) {
  return { family, selection, price: '2.00', basis: 'bookmaker', retrievedAt: now - 1000, providerUpdatedAt: null, ...overrides };
}
function page(prices = [price()], record = liveRecord({ fixtureId: 'fixture-a' })) {
  return { feed: liveFeed([record]), selectionPrices: { [record.fixtureId]: prices } };
}

test('supplemental prices preserve full published alternatives without changing selected-pick feed prices', () => {
  const input = page([price('match-result', 'home-win'), price('match-result', 'draw'), price('match-result', 'away-win')]);
  const parsed = slipPricePageSchema.parse(input);
  assert.deepEqual(parsed, input);
  assert.equal(parsed.feed.records[0].forecast.markets[0].market.selection, 'home-win');
  assert.deepEqual(parsed.feed.records[0].prices, []);
  assert.equal(matchFeedResponseSchema.safeParse({ ...input.feed, records: [{ ...input.feed.records[0], prices: [price()] }] }).success, false);
});

test('all ten supported outcomes fit one pool when their full distributions are published', () => {
  const snapshot = validateMarketSnapshot({
    'match-result': { source: 'ai', period: marketRules.period, probabilities: { 'home-win': 0.6, draw: 0.25, 'away-win': 0.15 } },
    'total-goals': { source: 'ai', period: marketRules.period, line: 2.5, probabilities: { 'over-2.5': 0.55, 'under-2.5': 0.45 } },
    'both-teams-to-score': { source: 'ai', period: marketRules.period, probabilities: { yes: 0.5, no: 0.5 } },
  });
  const base = liveRecord({ fixtureId: 'fixture-all' });
  const record = { ...base, unavailableMarkets: [], forecast: { ...base.forecast,
    markets: Object.values(snapshot.markets).filter(item => item.available).map(({ market }) => ({ market, reasons: [], uncertainty: null })),
  } };
  const prices = Object.entries(marketSelections).flatMap(([family, selections]) => selections.map(selection => price(family, selection)));
  assert.equal(slipPricePageRules.maximumPricesPerFixture, 10);
  assert.equal(slipPricePageSchema.parse(page(prices, record)).selectionPrices['fixture-all'].length, 10);
  assert.equal(slipPricePageSchema.safeParse(page([...prices, prices[0]], record)).success, false);
});

test('each fixture has its own pool, including empty pools for unpriced or unpublished fixtures', () => {
  const a = liveRecord({ fixtureId: 'fixture-a' }), b = liveRecord({ fixtureId: 'fixture-b', forecast: null,
    unavailableMarkets: Object.keys(marketSelections).map(family => ({ family, reason: 'not-published' })),
  });
  const input = { feed: liveFeed([a, b]), selectionPrices: { 'fixture-a': [price()], 'fixture-b': [] } };
  assert.equal(slipPricePageSchema.safeParse(input).success, true);
  assert.equal(slipPricePageSchema.safeParse({ ...input, selectionPrices: { 'fixture-a': [price()] } }).success, false);
  assert.equal(slipPricePageSchema.safeParse({ ...input, selectionPrices: { ...input.selectionPrices, extra: [] } }).success, false);
  assert.equal(slipPricePageSchema.safeParse({ ...input, selectionPrices: { ...input.selectionPrices, 'fixture-b': [price()] } }).success, false);
  assert.equal(slipPricePageSchema.safeParse({ feed: liveFeed([]), selectionPrices: {} }).success, true);
});

test('pool membership checks use own keys even for fixture identities shared with object properties', () => {
  const input = page([], liveRecord({ fixtureId: 'constructor' }));
  assert.equal(slipPricePageSchema.safeParse(input).success, true);
  assert.equal(slipPricePageSchema.safeParse({ ...input, selectionPrices: {} }).success, false);
});

for (const [description, prices] of [
  ['duplicate outcomes', [price(), price()]],
  ['a selection from another family', [price('match-result', 'yes')]],
  ['an unsupported market', [price('corners', 'over-2.5')]],
  ['an unsupported goal line', [price('total-goals', 'over-2.4')]],
  ['an unpublished family', [price('both-teams-to-score', 'yes')]],
  ['a future retrieval', [price('match-result', 'draw', { retrievedAt: now + 1 })]],
  ['a future provider update', [price('match-result', 'draw', { providerUpdatedAt: now + 1 })]],
  ['a malformed decimal price', [price('match-result', 'draw', { price: '2e0' })]],
]) {
  test(`supplemental price pages reject ${description}`, () => {
    assert.equal(slipPricePageSchema.safeParse(page(prices)).success, false);
  });
}

test('price observations include equality at the feed observation timestamp', () => {
  const input = page([price('match-result', 'draw', { retrievedAt: now, providerUpdatedAt: now })]);
  assert.equal(slipPricePageSchema.safeParse(input).success, true);
});

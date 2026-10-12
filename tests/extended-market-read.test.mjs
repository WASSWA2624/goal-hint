import assert from 'node:assert/strict';
import test from 'node:test';
import { publicExtendedMarketSchema } from '../src/domain/extended-markets.ts';
import { goalResultMarket, goalAsianHandicapMarket, goalDoubleChanceMarket } from '../src/domain/goal-market-definitions.ts';
import { SCORE_DISTRIBUTION_VERSION } from '../src/domain/score-distribution.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { prepareGoalMarketExtension } from '../src/server/predictions/goal-market-store.ts';
import { publicGoalMarketExtension, readCurrentExtendedMarkets, readExtendedMarketSnapshot } from '../src/server/predictions/extended-market-read.ts';

const fixtureId = '10000000-0000-4000-8000-000000000001', cycleId = '20000000-0000-4000-8000-000000000001',
  revisionId = '30000000-0000-4000-8000-000000000001', at = Date.parse('2026-10-12T08:00:00Z');
function extension() {
  const prepared = prepareGoalMarketExtension({ scoreDistribution: { version: SCORE_DISTRIBUTION_VERSION,
    unrepresentedProbability: 0, states: [
      { home: 0, away: 0, halfHome: 0, halfAway: 0, probability: .2 },
      { home: 2, away: 0, halfHome: 1, halfAway: 0, probability: .8 },
    ] }, definitions: [goalResultMarket(), goalDoubleChanceMarket(), goalAsianHandicapMarket(-.25)] });
  return { ...prepared, fixtureId, cycleId, revisionId, recordedAt: at, contentHash: evidenceFingerprint(prepared) };
}

test('default-disabled extension reads perform no database, provider or predictor operations', async () => {
  const refused = new Proxy({}, { get() { throw Error('Unexpected database access'); } });
  assert.equal(await readCurrentExtendedMarkets(refused, fixtureId), null);
  assert.equal(await readExtendedMarketSnapshot(refused, {}), null);
  assert.equal(await readCurrentExtendedMarkets(refused, fixtureId, { enabled: false }), null);
});

test('public goal projection keeps exact published selection and distinct payout probabilities without private PMF or rules', () => {
  const value = extension(), projected = publicGoalMarketExtension(value);
  assert.equal(projected.length, 3); assert.ok(Object.isFrozen(projected));
  for (const [index, publicMarket] of projected.entries()) {
    const original = value.markets[index].derivation.market;
    assert.equal(publicMarket.selection, original.selection);
    assert.equal(publicMarket.selectedProbability, original.selectedProbability);
    assert.equal(publicMarket.sourceLabel, 'AI score distribution');
    assert.equal(Object.hasOwn(publicMarket, 'scoreDistribution'), false);
    assert.equal(Object.hasOwn(publicMarket, 'price'), false);
    assert.equal(publicMarket.selections.some((selection) => Object.hasOwn(selection, 'rule')), false);
    assert.equal(publicMarket.result.status, 'pending');
  }
  assert.equal(projected[2].probabilityBasis, 'model-positive-payout');
  assert.equal(projected[2].selections[0].settlementProbabilities['half-loss'], .2);
  assert.equal(projected[1].selections.reduce((sum, selection) => sum + selection.probability, 0), 2);
});

test('result corrections project only the same source-qualified revision, market, selection and raw probability', () => {
  const value = extension(), market = value.markets[0].derivation.market, key = market.definition.key;
  const settlement = { fixtureId, cycleId, predictionRevisionId: revisionId, source: 'ai-score-distribution', marketKey: key,
    ruleVersion: market.ruleVersion, selection: market.selection, selectedProbability: market.selectedProbability,
    status: 'incorrect', reason: 'selection-loss', correctedAt: at + 1000 };
  assert.deepEqual(publicGoalMarketExtension(value, new Map([[key, settlement]]))[0].result,
    { status: 'incorrect', reason: 'selection-loss', correctedAt: at + 1000 });
  for (const wrong of [{ ...settlement, selection: 'away' }, { ...settlement, predictionRevisionId: '40000000-0000-4000-8000-000000000001' },
    { ...settlement, source: 'market-implied' }, { ...settlement, selectedProbability: .99 }, { ...settlement, marketKey: 'goal:half-time:result' }]) {
    assert.throws(() => publicGoalMarketExtension(value, new Map([[key, wrong]])), (error) => error.reason === 'invalid-state');
  }
});

test('public contract refuses mislabeled bookmaker/model probabilities or a selection from another market', () => {
  const valid = publicGoalMarketExtension(extension())[0];
  for (const bad of [{ ...valid, selection: 'missing' }, { ...valid, selectionLabel: 'Another pick' },
    { ...valid, selectedProbability: .99 }, { ...valid, probabilityBasis: 'normalized-bookmaker-price' },
    { ...valid, sourceLabel: 'Market-implied' }, { ...valid, period: 'half-time' }]) {
    assert.equal(publicExtendedMarketSchema.safeParse(bad).success, false);
  }
});

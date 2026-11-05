import assert from 'node:assert/strict';
import test from 'node:test';
import { selectShadowSlips, shadowSlipSearchLimits } from '../src/server/slips/shadow-slip-selection.ts';
import { bestSlipOddsBands } from '../src/domain/best-slip-odds-bands.ts';
import { shadowAt, shadowCandidate, shadowModel, shadowStudy } from './helpers/shadow-slip-fixtures.mjs';

const select = (candidates, studies = [], options = {}) => selectShadowSlips({ candidates, model: shadowModel(candidates, studies), asOf: shadowAt, ...options });
const slips = result => result.bands.flatMap(band => band.slips);

test('shadow selection preserves all six exact odds boundaries and excludes out-of-range quotes', () => {
  const prices = ['2.49', '2.50', '4.99', '5.00', '10.00', '20.00', '50.00', '100.00', '200.00', '200.01'];
  const candidates = prices.map((price, index) => shadowCandidate(`f${index}`, price));
  const result = select(candidates);
  assert.equal(result.mode, 'shadow');
  assert.deepEqual(result.bands.map(band => band.band), bestSlipOddsBands.map(band => band.id));
  assert.deepEqual(result.bands.map(band => band.slips.map(slip => slip.totalOdds).sort()),
    [['2.50', '4.99'], ['5.00'], ['10.00'], ['20.00'], ['50.00'], ['100.00', '200.00']]);
  assert.ok(slips(result).every(slip => slip.id.startsWith('shadow:')));
});

test('whole-slip probability and evidence rank before global fixture exposure across bands', () => {
  const a = shadowCandidate('a', '2.50', 0.8), b = shadowCandidate('b', '2.00', 0.7);
  const candidates = [a, b], study = shadowStudy(candidates), one = select(candidates, [study]);
  assert.deepEqual(slips(one).map(slip => slip.totalOdds), ['2.50']);
  const two = select(candidates, [study], { maximumFixtureExposure: 2 });
  assert.deepEqual(slips(two).map(slip => slip.totalOdds), ['2.50', '5.00']);
  assert.equal(two.bands[1].slips[0].estimatedProbability, 0.8 * 0.7);
  assert.equal(two.bands[1].slips[0].averageProbability, 0.75);
  const lower = shadowCandidate('lower', '2.50', 0.8, { evidenceReliability: 0.5 });
  assert.equal(select([lower, a]).bands[0].slips[0].selections[0].fixtureId, 'a');
  const c = shadowCandidate('c', '1.10', 0.9);
  const sameBand = select([a, c], [shadowStudy([a, c])], { maximumFixtureExposure: 2 });
  assert.equal(sameBand.bands[0].slips.length, 1, 'relaxed global exposure never relaxes within-band fixture diversity');
});

test('unknown correlations, missing calibration, stale facts and empty cohorts do not manufacture slips', () => {
  const candidates = [shadowCandidate('a'), shadowCandidate('b')];
  assert.equal(slips(select(candidates)).length, 0);
  assert.ok(select(candidates).excludedUnestimated > 0);
  assert.equal(slips(select([])).length, 0);
  const invalid = shadowCandidate('invalid', '2.50', 0.8, { calibrated: false });
  assert.equal(slips(select([invalid])).length, 0);
  const stale = shadowCandidate('stale', '2.50', 0.8, { validUntil: shadowAt });
  assert.equal(slips(select([stale])).length, 0);
  assert.equal(slips(select(candidates, [], { model: null })).length, 0);
  assert.equal(slips(select([shadowCandidate('low', '2.50')], [], { minimumJointProbability: 0.9 })).length, 0);
});

test('rounded quotes never cross existing exact band eligibility or the top boundary', () => {
  const candidates = [shadowCandidate('a', '1.85'), shadowCandidate('b', '2.70')];
  assert.equal(slips(select(candidates, [shadowStudy(candidates)])).filter(slip => slip.selections.length === 2).length, 0,
    '4.995 rounds to 5.00 but does not satisfy exact 5.00 minimum or 4.99 maximum');
});

test('search and retained cohorts stay bounded and deterministic without mutating candidates', () => {
  const candidates = Array.from({ length: 105 }, (_, index) => shadowCandidate(`f${index}`, '2.50', 0.8));
  const before = structuredClone(candidates), result = select(candidates);
  assert.equal(result.searchLimited, true);
  assert.ok(result.examined <= shadowSlipSearchLimits.nodes);
  assert.ok(result.bands.every(band => band.slips.length <= 20));
  assert.deepEqual(select([...candidates].reverse()), result);
  assert.deepEqual(candidates, before);
});

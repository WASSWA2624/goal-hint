import assert from 'node:assert/strict';
import test from 'node:test';
import { captureShadowSlipForEvaluation, evaluateShadowSlips } from '../src/server/slips/shadow-slip-evaluation.ts';
import { selectShadowSlips } from '../src/server/slips/shadow-slip-selection.ts';
import { shadowAt, shadowCandidate, shadowModel, shadowStudy } from './helpers/shadow-slip-fixtures.mjs';
import { bestSlipOddsBandFor, bestSlipOddsBands } from '../src/domain/best-slip-odds-bands.ts';

const asOf = shadowAt + 7_200_000;
function capture(id, probability = 0.8, odds = '2.50', changes = {}) {
  const candidate = shadowCandidate(id, odds, probability);
  const slip = selectShadowSlips({ candidates: [candidate], model: shadowModel([candidate]), asOf: shadowAt }).bands.flatMap(band => band.slips)[0];
  return captureShadowSlipForEvaluation({ id, mode: 'synthetic', capturedAt: shadowAt, evidenceCutoffAt: shadowAt - 1000,
    modelVersion: 'synthetic-v1', evidenceReference: 'synthetic-original', band: bestSlipOddsBandFor(odds),
    slip, oddsObservedAt: [shadowAt - 2000], ...changes });
}
function result(original, status = 'finished-regulation', home = 2, away = 0, changes = {}) {
  const selection = original.slip.selections[0];
  return { fixtureId: selection.fixtureId, cycleId: selection.forecast?.cycleId ?? null, scheduledKickoffAt: selection.kickoffAt,
    observedAt: asOf - 1000, evidenceReference: 'synthetic-result', context: { status, cycleEligibility: { eligible: true },
      regulationScore: { verified: true, period: 'regulation-including-stoppage-time', home, away } }, ...changes };
}

test('whole-slip metrics retain all outcome categories, calibration and exact illustrative returns', () => {
  const captures = [capture('win'), capture('loss', 0.6, '5.00'), capture('void'), capture('cancel'),
    capture('pending'), capture('missing'), capture('unverified'), capture('withheld', 0.8, '2.50', { slip: null, oddsObservedAt: [] })];
  const results = [result(captures[0]), result(captures[1], 'finished-regulation', 0, 1),
    result(captures[2], 'postponed'), result(captures[3], 'canceled'), result(captures[4], 'live'),
    result(captures[6], 'finished-regulation', 2, 0, { context: { status: 'finished-regulation', cycleEligibility: { eligible: true }, regulationScore: null } })];
  const report = evaluateShadowSlips({ captures, results, asOf }), metrics = report.overall;
  assert.equal(report.productionQualified, false);
  assert.deepEqual(report.sourceModes, ['synthetic']);
  assert.deepEqual(report.originals.map(sample => sample.outcome), ['won', 'lost', 'void', 'cancelled', 'pending', 'unavailable', 'unavailable', 'unavailable']);
  assert.equal(metrics.opportunities, 8); assert.equal(metrics.forecasts, 7); assert.equal(metrics.abstained, 1);
  assert.equal(metrics.coverage, 7 / 8); assert.equal(metrics.sampleCount, 2); assert.equal(metrics.hitRate, 0.5);
  assert.ok(Math.abs(metrics.brier - 0.2) < 1e-12);
  assert.ok(Math.abs(metrics.logLoss - (-Math.log(0.8) - Math.log(0.4)) / 2) < 1e-12);
  assert.equal(metrics.calibration.reduce((sum, bin) => sum + bin.count, 0), 2);
  assert.deepEqual(metrics.illustrativeReturns, { basis: 'one-unit-per-binary-slip-original-quoted-odds',
    quoteConvention: 'captured-two-decimal-total-quote',
    sampleCount: 2, stakeUnits: 2, returnUnits: 2.5, profitUnits: 0.5, roi: 0.25 });
  assert.equal(metrics.void, 1); assert.equal(metrics.cancelled, 1); assert.equal(metrics.pending, 1); assert.equal(metrics.unavailable, 3);
  assert.ok(Object.isFrozen(report) && Object.isFrozen(captures[0].slip.selections));
});

test('each existing odds band reports its own original sample and empty cohorts stay unavailable', () => {
  const captures = ['2.50', '5.00', '10.00', '20.00', '50.00', '100.00', '200.00'].map((odds, index) => capture(`f${index}`, 0.5, odds));
  const report = evaluateShadowSlips({ captures, results: captures.map(original => result(original)), asOf });
  assert.deepEqual(report.bands.map(band => band.band), bestSlipOddsBands.map(band => band.id));
  assert.deepEqual(report.bands.map(band => band.metrics.sampleCount), [1, 1, 1, 1, 1, 2]);
  const empty = evaluateShadowSlips({ captures: [], results: [], asOf }).overall;
  assert.equal(empty.sampleCount, 0); assert.equal(empty.coverage, null); assert.equal(empty.brier, null);
  assert.equal(empty.logLoss, null); assert.equal(empty.illustrativeReturns.roi, null);
});

test('future result observations, conflicting same-time evidence and different original cycles cannot settle a capture', () => {
  const original = capture('original');
  for (const results of [[result(original, 'finished-regulation', 2, 0, { observedAt: asOf + 1 })],
    [result(original, 'finished-regulation', 2, 0, { cycleId: 'different-cycle' })],
    [result(original), result(original, 'finished-regulation', 0, 1)],
    [result(original, 'finished-regulation', 2, 0, { observedAt: shadowAt + 1000 })]]) {
    assert.equal(evaluateShadowSlips({ captures: [original], results, asOf }).overall.unavailable, 1);
  }
  const after = result(original, 'finished-regulation', 0, 1, { observedAt: asOf + 1 });
  assert.equal(evaluateShadowSlips({ captures: [original], results: [result(original), after], asOf }).overall.won, 1);
});

test('only regulation evidence settles; void and cancelled outcomes never invent refunds', () => {
  const original = capture('original');
  const wrongPeriod = result(original, 'finished-extra-time');
  wrongPeriod.context.regulationScore.period = 'including-extra-time';
  assert.equal(evaluateShadowSlips({ captures: [original], results: [wrongPeriod], asOf }).overall.unavailable, 1);
  for (const status of ['postponed', 'abandoned', 'awarded', 'canceled']) {
    const metrics = evaluateShadowSlips({ captures: [original], results: [result(original, status)], asOf }).overall;
    assert.equal(metrics.sampleCount, 0); assert.equal(metrics.illustrativeReturns.stakeUnits, 0);
    assert.equal(metrics.illustrativeReturns.returnUnits, 0); assert.equal(metrics.illustrativeReturns.roi, null);
  }
});

test('a verified losing leg settles the original whole-slip loss while other legs remain unavailable', () => {
  const candidates = [shadowCandidate('a', '2.50'), shadowCandidate('b', '2.00', 0.7)];
  const slip = selectShadowSlips({ candidates, model: shadowModel(candidates, [shadowStudy(candidates)]), asOf: shadowAt,
    maximumFixtureExposure: 2 }).bands[1].slips[0];
  const original = captureShadowSlipForEvaluation({ id: 'pair', mode: 'synthetic', capturedAt: shadowAt, evidenceCutoffAt: shadowAt - 1000,
    modelVersion: 'synthetic-v1', evidenceReference: 'synthetic-original', band: '5-10', slip,
    oddsObservedAt: [shadowAt - 2000, shadowAt - 2000] });
  assert.equal(evaluateShadowSlips({ captures: [original], results: [result(original, 'finished-regulation', 0, 1)], asOf }).overall.lost, 1);
});

test('seals, pre-cutoff timestamps and original quote arithmetic reject changed history', () => {
  const original = capture('original'), before = JSON.stringify(original), { hash, ...input } = original;
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.throws(() => evaluateShadowSlips({ captures: [{ ...original, modelVersion: 'changed' }], results: [], asOf }), /history changed/);
  assert.throws(() => evaluateShadowSlips({ captures: [original, original], results: [], asOf }), /history changed/);
  assert.throws(() => captureShadowSlipForEvaluation({ ...input, capturedAt: original.slip.selections[0].kickoffAt }), /pre-cutoff/);
  assert.throws(() => captureShadowSlipForEvaluation({ ...input, oddsObservedAt: [shadowAt + 1] }), /pre-cutoff/);
  assert.throws(() => captureShadowSlipForEvaluation({ ...input, slip: { ...original.slip, totalOdds: '3.00' } }), /total price/);
  assert.equal(JSON.stringify(original), before);
});

test('impossible binary forecasts report infinite log loss explicitly without clipping probabilities', () => {
  const original = capture('zero', 0);
  const metrics = evaluateShadowSlips({ captures: [original], results: [result(original)], asOf }).overall;
  assert.equal(metrics.brier, 1); assert.equal(metrics.logLoss, null); assert.equal(metrics.infiniteLogLoss, true);
  assert.match(JSON.stringify(metrics), /"infiniteLogLoss":true/);
});

function pairCapture(prices, totalOdds, band) {
  const selections = prices.map((price, index) => shadowCandidate(`pair-${index}`, price).selection);
  return captureShadowSlipForEvaluation({ id: 'priced-pair', mode: 'synthetic', capturedAt: shadowAt,
    evidenceCutoffAt: shadowAt - 1000, modelVersion: 'synthetic-v1', evidenceReference: 'synthetic-original', band,
    oddsObservedAt: [shadowAt - 2000, shadowAt - 2000], slip: { id: 'shadow:priced-pair', selections,
      totalOdds, oddsBasis: 'bookmaker', averageProbability: 0.8, estimatedProbability: 0.64,
      evidenceReliability: 0.8, candidateKeys: ['synthetic-a', 'synthetic-b'] } });
}

test('capture uses the same exact existing odds-band bounds as selection, regardless of display rounding', () => {
  assert.throws(() => pairCapture(['2.23', '2.24'], '5.00', '5-10'), /exact price is outside/);
  assert.throws(() => pairCapture(['1.02', '196.08'], '200.00', '100-200'), /exact price is outside/);
});

test('illustrative returns state the retained total quote convention and never mix synthetic with real cohorts', () => {
  const original = pairCapture(['2.23', '2.25'], '5.02', '5-10');
  const results = original.slip.selections.map(selection => result({ slip: { selections: [selection] } }));
  const returns = evaluateShadowSlips({ captures: [original], results, asOf }).overall.illustrativeReturns;
  assert.equal(returns.quoteConvention, 'captured-two-decimal-total-quote');
  assert.equal(returns.returnUnits, 5.02);
  const historical = capture('historical', 0.8, '2.50', { mode: 'historical' });
  assert.throws(() => evaluateShadowSlips({ captures: [original, historical], results, asOf }), /cohorts separately/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { marketRules } from '../src/domain/markets.ts';
import { SCORE_DISTRIBUTION_VERSION } from '../src/domain/score-distribution.ts';
import { applyGoalScoreCalibration, evaluateFittedGoalHoldouts } from '../src/server/intelligence/fitted-goals-evaluation.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';

const day = 86_400_000;
const start = Date.parse('2026-04-01T10:00:00Z');
const holdouts = { validationFrom: start, calibrationFrom: start + 15 * day, finalTestFrom: start + 75 * day,
  finalTestUntil: start + 90 * day };

function match(index, availableLater = 0) {
  const home = (index + 160) % 8, away = (home + 1 + Math.floor((index + 160) / 8) % 7) % 8;
  const forecastAt = start + index * day + 60_000;
  const fixture = { fixtureId: `fixture-${index}`, competitionId: 'league-a', homeTeamId: `team-${home}`, awayTeamId: `team-${away}`,
    kickoffAt: forecastAt + 4 * 3_600_000, forecastAt };
  const row = { fixtureId: fixture.fixtureId, cycleId: `cycle-${index}`, competitionId: fixture.competitionId,
    homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, kickoffAt: fixture.kickoffAt,
    availableAt: fixture.kickoffAt + 2 * 3_600_000 + availableLater, homeGoals: (index + 160 + home) % 4,
    awayGoals: (index + 160 + away) % 3, period: marketRules.period, evidenceRef: 'synthetic-fixture-result' };
  return { fixture, status: 'settled', result: { ...row, observationHash: evidenceFingerprint(row) } };
}

const history = Array.from({ length: 160 }, (_, index) => match(index - 160).result);
const fixtures = Array.from({ length: 90 }, (_, index) => match(index, index === 74 ? day : 0));
const input = { mode: 'synthetic', holdouts, history, fixtures, verifyHistory: ({ evidenceRef }) => evidenceRef === 'synthetic-fixture-result' };

test('chronological goal folds fit once per boundary, retain metrics and leave the diagnostic unpublished', () => {
  const report = evaluateFittedGoalHoldouts(input);
  assert.equal(report.approvedForPublication, false);
  assert.equal(report.predictiveAccuracyEstablished, false);
  const [{ folds, calibration }] = report.cohorts;
  assert.deepEqual(folds.map(fold => [fold.fixtures, fold.training, fold.fitStatus]), [[15, 160, 'fitted'], [60, 175, 'fitted'], [15, 234, 'fitted']]);
  assert.equal(new Set(folds.map(({ modelHash }) => modelHash)).size, 3);
  assert.equal(calibration.samples, 59);
  assert.equal(calibration.fitThrough, holdouts.finalTestFrom);
  assert.equal(folds[1].systems.calibrated.available, 0);
  for (const system of ['independent', 'low-score-corrected', 'calibrated']) {
    const cell = folds[2].systems[system];
    assert.equal(cell.available, 15);
    assert.equal(cell.abstained, 0);
    for (const metric of Object.values(cell.markets)) {
      assert.equal(metric.count, 15);
      assert.ok(Number.isFinite(metric.brier) && Number.isFinite(metric.logLoss));
      assert.ok(metric.calibration.some(bin => bin.count > 0 && bin.interval));
    }
  }
});

test('future outcomes cannot change a fold fit or calibration, and late history never trains an earlier fold', () => {
  const report = evaluateFittedGoalHoldouts(input);
  const finalRow = fixtures.at(-1);
  const revised = { ...finalRow, result: { ...finalRow.result, homeGoals: 8, observationHash: 'a'.repeat(64) } };
  const next = evaluateFittedGoalHoldouts({ ...input, fixtures: [...fixtures.slice(0, -1), revised] });
  assert.deepEqual(next.cohorts[0].calibration, report.cohorts[0].calibration);
  assert.deepEqual(next.cohorts[0].folds.map(fold => fold.modelHash), report.cohorts[0].folds.map(fold => fold.modelHash));
  assert.notEqual(next.hash, report.hash);
  assert.throws(() => evaluateFittedGoalHoldouts({ ...input, history: [...history, history[0]] }), /duplicate/);
  assert.throws(() => evaluateFittedGoalHoldouts({ ...input, verifyHistory: () => false }), /Unverified/);
  assert.throws(() => evaluateFittedGoalHoldouts({ ...input, holdouts: { ...holdouts, finalTestFrom: holdouts.validationFrom } }));
});

test('joint calibration keeps exact score masses and nested outcomes coherent', () => {
  const score = (home, away, probability) => ({ home, away, halfHome: null, halfAway: null, probability });
  const model = { version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0.0000001,
    states: [score(0, 1, 0.3999999), score(2, 1, 0.6)] };
  const prior = { version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0, states: [score(1, 1, 1)] };
  const forecast = applyGoalScoreCalibration(model, prior, 0.5);
  assert.equal(forecast.distribution.unrepresentedProbability, 0.00000005);
  assert.ok(Math.abs(forecast.probabilities['match-result']['home-win'] - forecast.probabilities['total-goals']['over-2.5']) < 1e-12);
  assert.ok(Math.abs(forecast.probabilities['double-chance']['home-or-draw'] - forecast.probabilities['both-teams-to-score'].yes) < 1e-12);
  assert.equal(applyGoalScoreCalibration(model, prior, 1.1), null);
});

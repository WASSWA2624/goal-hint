import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveGoalMarket } from '../src/domain/score-distribution-markets.ts';
import { goalHalfFullMarket, goalResultMarket } from '../src/domain/goal-market-definitions.ts';
import { SCORE_DISTRIBUTION_VERSION, scoreDistributionRules } from '../src/domain/score-distribution.ts';
import { applyPeriodGoalModel, fitPeriodGoalModel } from '../src/server/intelligence/period-goal-model.ts';

const day = 86_400_000, split = Date.parse('2025-01-01T00:00:00Z'), fittedAt = split + 20 * day;
const hash = (id) => id.toString(16).padStart(64, '0');
const score = (home, away) => ({ home, away });
function result(id, dayOfSplit, homeGoals, awayGoals, halfTime, overrides = {}) {
  const kickoffAt = split + dayOfSplit * day;
  return { fixtureId: `fixture-${id}`, competitionId: 'target', homeTeamId: 'home', awayTeamId: 'away', kickoffAt,
    availableAt: kickoffAt + day / 4, homeGoals, awayGoals, period: 'regulation-including-stoppage-time',
    observationHash: hash(id), evidenceRef: `result:${id}`, halfTime, ...overrides };
}
const base = [result(1, -5, 2, 1, score(2, 0)), result(2, -4, 2, 1, score(0, 1)),
  result(3, -3, 1, 2, score(0, 2)), result(4, -2, 1, 2, score(0, 2))];
function fit(history, overrides = {}) {
  return fitPeriodGoalModel({ competitionId: 'target', mode: 'synthetic', validationStartsAt: split, fittedAt,
    policy: { lookbackMs: 100 * day, minimumScorelineSamples: 2 }, history, verifyHistory: () => true, ...overrides });
}
const state = (home, away, probability) => ({ home, away, halfHome: null, halfAway: null, probability });
const distribution = (states, unrepresentedProbability = 0) => ({ version: SCORE_DISTRIBUTION_VERSION, states, unrepresentedProbability });
function apply(artifact, regulationDistribution, overrides = {}) {
  return applyPeriodGoalModel({ artifact, regulationDistribution, verifyArtifact: (row) => row === artifact,
    fixture: { competitionId: 'target', forecastAt: fittedAt + day, kickoffAt: fittedAt + 2 * day }, ...overrides });
}

test('only sealed as-of paired regulation scores fit the competition, preserving chronology and deduplication', () => {
  const holdout = result(6, 1, 2, 1, score(2, 0));
  const knownLater = { ...base[0], halfTime: score(0, 0), availableAt: split + day, observationHash: hash(10) };
  const holdoutCorrectionAfterFit = { ...holdout, halfTime: score(0, 0), availableAt: fittedAt + day, observationHash: hash(11) };
  const data = [...base, base[0], knownLater, holdout, holdoutCorrectionAfterFit, result(7, 2, 2, 1, null),
    result(8, 3, 3, 2, score(2, 1)), result(9, -1, 2, 1, score(3, 0)), result(12, -1, 2, 1, score(0, 0), { competitionId: 'other' }),
    result(13, -1, 2, 1, score(0, 1), { availableAt: split }), result(14, -1, 2, 1, score(1, 1))];
  const authority = { verifyHistory: (row) => row.fixtureId !== 'fixture-14' };
  const first = fit(data, authority), second = fit([...data].reverse(), authority);
  assert.equal(first.status, 'fitted');
  assert.deepEqual(first, second);
  const { artifact } = first;
  assert.equal(artifact.mode, 'synthetic');
  assert.equal(artifact.training.verifiedPairs, 4);
  assert.deepEqual(artifact.training.observationHashes, [1, 2, 3, 4].map(hash));
  assert.deepEqual(artifact.scorelines.find((line) => line.home === 2).halves, [{ home: 0, away: 1, count: 1 }, { home: 2, away: 0, count: 1 }]);
  assert.equal(artifact.validation.basis, 'half-score-conditional-on-observed-regulation-score');
  assert.equal(artifact.validation.evaluated, 1);
  assert.equal(artifact.validation.missingPairs, 1);
  assert.equal(artifact.validation.unsupportedScorelines, 1);
  assert.equal(artifact.validation.coverage, 1 / 3);
  assert.equal(artifact.validation.brier, 0.5);
  assert.equal(artifact.validation.logLoss, Math.log(2));
  assert.equal(artifact.validation.reliability.find(({ count }) => count === 1).meanProbability, 0.5);
  assert.ok(Object.isFrozen(artifact.scorelines[0].halves));
});

test('an unseen held-out half split reports unbounded log loss without data leakage or clipping', () => {
  const fitted = fit([...base, result(5, 1, 2, 1, score(1, 1))]);
  assert.equal(fitted.status, 'fitted');
  assert.equal(fitted.artifact.validation.zeroProbabilityResults, 1);
  assert.equal(fitted.artifact.validation.logLoss, null);
  assert.equal(fitted.artifact.validation.brier, 1.5);
  assert.deepEqual(fit([...base, { ...base[0], observationHash: hash(9), halfTime: score(1, 1) }]),
    { status: 'unavailable', reason: 'conflicting-period-history' });
  assert.deepEqual(fit([base[0], base[0]]), { status: 'unavailable', reason: 'insufficient-paired-period-history' });
});

test('joint period allocation preserves regulation marginals and derives coherent dependent outcomes', () => {
  const artifact = fit([...base, result(5, 1, 2, 1, score(2, 0))]).artifact;
  const regulation = distribution([state(2, 1, 0.6), state(1, 2, 0.35), state(0, 0, 0.05)]);
  const projected = apply(artifact, regulation);
  assert.equal(projected.status, 'estimated');
  assert.equal(projected.evidence, 'conditional-holdout-only');
  assert.equal(projected.diagnostics.unresolvedProbability, 0);
  const full = deriveGoalMarket(projected.distribution, goalResultMarket());
  const halves = deriveGoalMarket(projected.distribution, goalHalfFullMarket());
  const second = deriveGoalMarket(projected.distribution, goalResultMarket('second-half'));
  assert.deepEqual(full.market.selections.map((row) => row.winProbability), [0.6, 0.05, 0.35]);
  assert.equal(halves.market.selections.find((row) => row.key === 'home-home').winProbability, 0.3);
  assert.equal(halves.market.selections.find((row) => row.key === 'away-home').winProbability, 0.3);
  assert.equal(halves.market.selections.find((row) => row.key === 'away-away').winProbability, 0.35);
  assert.equal(halves.market.selections.find((row) => row.key === 'home-away').winProbability, 0);
  assert.ok(Math.abs(second.market.selections.find((row) => row.key === 'home').winProbability - 0.65) < 1e-12);
});

test('unseen scorelines and distribution tails stay distinct and are never silently normalized', () => {
  const artifact = fit(base).artifact;
  const projected = apply(artifact, distribution([state(2, 1, 0.6), state(5, 1, 0.35)], 0.05));
  assert.equal(projected.status, 'estimated');
  assert.equal(projected.evidence, 'no-conditional-holdout');
  assert.equal(projected.distribution.unrepresentedProbability, 0.05);
  assert.equal(projected.diagnostics.unknownHalfProbability, 0.35);
  assert.ok(Math.abs(projected.diagnostics.unresolvedProbability - 0.4) < 1e-12);
  assert.deepEqual(projected.distribution.states.at(-1), state(5, 1, 0.35));
  const fullyRepresented = apply(artifact, distribution([state(2, 1, 0.6), state(5, 1, 0.4)]));
  assert.deepEqual(deriveGoalMarket(fullyRepresented.distribution, goalHalfFullMarket()),
    { available: false, reason: 'missing-half-time-distribution' });
  assert.equal(deriveGoalMarket(fullyRepresented.distribution, goalResultMarket()).market.selectedProbability, 1);
});

test('full score states remain intact when fitting cannot expand the shared score grid', () => {
  const artifact = fit(base).artifact;
  const count = scoreDistributionRules.maximumStates;
  const full = Array.from({ length: count }, (_, index) => state(index % 31, Math.floor(index / 31), 1 / count));
  const projected = apply(artifact, distribution(full));
  assert.equal(projected.status, 'estimated');
  assert.equal(projected.diagnostics.limitedByStateCount, true);
  assert.equal(projected.distribution.states.length, count);
  assert.deepEqual(projected.distribution.states.find((row) => row.home === 2 && row.away === 1), state(2, 1, 1 / count));
});

test('the artifact must be authentic, within the correct competition, and fit before forecast cutoff', () => {
  const artifact = fit(base).artifact, full = distribution([state(2, 1, 1)]);
  for (const overrides of [{ verifyArtifact: () => false }, { verifyArtifact: async () => true },
    { fixture: { competitionId: 'other', forecastAt: fittedAt, kickoffAt: fittedAt + day } },
    { fixture: { competitionId: 'target', forecastAt: fittedAt - 1, kickoffAt: fittedAt + day } }]) {
    assert.equal(apply(artifact, full, overrides).reason, 'unverified-or-out-of-scope-period-artifact');
  }
  assert.equal(apply({ ...artifact, fittedAt: fittedAt - 1 }, full).reason, 'invalid-period-artifact');
  assert.equal(apply(artifact, distribution([{ ...state(2, 1, 1), halfHome: 1, halfAway: 1 }])).reason,
    'regulation-distribution-already-has-period-scores');
});

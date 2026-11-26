import assert from 'node:assert/strict';
import test from 'node:test';
import {
  goalDefinitionsForLocalFirstProfile, goalExactScoreMarket, LEGACY_LOCAL_FIRST_GOAL_EVALUATION_PROFILE,
  LOCAL_FIRST_GOAL_EVALUATION_PROFILE, LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE, localFirstRegulationScoreMarketDefinitions,
} from '../src/domain/goal-market-definitions.ts';
import { deriveLocalGoalMarket, settleGoalSelection } from '../src/domain/score-distribution-markets.ts';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { goalProbabilities } from '../src/server/intelligence/local-goals-model.ts';
import { publicGoalMarketExtension } from '../src/server/predictions/extended-market-read.ts';
import { goalMarketExtensionFromRow, prepareGoalMarketExtension } from '../src/server/predictions/goal-market-store.ts';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `Expected ${actual} to equal ${expected}`);
const scoreDefinitions = new Map(localFirstRegulationScoreMarketDefinitions.map((definition) => [definition.key, definition]));
const fullTimeKey = (market) => `goal:full-time:${market}`;
const rates = { home: 1.55, away: 0.87 };
function derive(market, input = rates) {
  const result = deriveLocalGoalMarket(input, scoreDefinitions.get(fullTimeKey(market)), 'outright-win');
  assert.equal(result.available, true);
  assert.equal(result.market.source, 'local-poisson');
  return Object.fromEntries(result.market.selections.map(({ key, outcomes }) => [key, outcomes]));
}

test('the score profile adds only reviewed full-time definitions and preserves the old profiles', () => {
  const count = goalDefinitionsForLocalFirstProfile(LOCAL_FIRST_GOAL_EVALUATION_PROFILE);
  const score = goalDefinitionsForLocalFirstProfile(LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE);
  assert.equal(scoreDefinitions.size, 14);
  assert.ok(localFirstRegulationScoreMarketDefinitions.every(({ period }) => period === 'full-time'));
  assert.deepEqual(score.filter(({ key }) => !scoreDefinitions.has(key)), count);
  assert.ok(goalDefinitionsForLocalFirstProfile(LEGACY_LOCAL_FIRST_GOAL_EVALUATION_PROFILE).every(({ key }) => !scoreDefinitions.has(key)));
  assert.equal(deriveLocalGoalMarket(rates, goalExactScoreMarket([{ home: 0, away: 0 }], 'half-time', true), 'outright-win').available, false);
  assert.equal(deriveLocalGoalMarket(rates, scoreDefinitions.get(fullTimeKey('exact-score'))).available, false);
  assert.throws(() => prepareGoalMarketExtension({ evaluationProfile: LOCAL_FIRST_GOAL_EVALUATION_PROFILE, localPoisson: rates, definitions: score }));
});

test('exact score and win-to-nil probabilities agree with the same regulation Poisson rates', () => {
  const exact = derive('exact-score');
  close(exact['0-0'].win, Math.exp(-rates.home - rates.away));
  close(exact['2-1'].win, exact['0-0'].win * rates.home ** 2 * rates.away / 2);
  close(exact.other.win, 1 - Object.entries(exact).filter(([key]) => key !== 'other').reduce((sum, [, grade]) => sum + grade.win, 0));
  const homeToNil = derive('win-to-nil:home');
  close(homeToNil.yes.win, (1 - Math.exp(-rates.home)) * Math.exp(-rates.away));
  close(homeToNil.yes.win + homeToNil.no.win, 1);
});

test('handicap grades preserve the existing result totals, pushes and quarter payouts', () => {
  const result = goalProbabilities(rates.home, rates.away)['match-result'];
  const noBet = derive('draw-no-bet');
  close(noBet.home.win, result['home-win']);
  close(noBet.home.push, result.draw);
  close(noBet.home.loss, result['away-win']);
  const asian = derive('asian-handicap:-0.25');
  close(asian.home['half-loss'], result.draw);
  close(asian.away['half-win'], result.draw);
  close(asian.home.win, result['home-win']);
  close(asian.away.win, result['away-win']);
  assert.equal(asian.home.push, 0);

  const european = derive('european-handicap:1');
  close(european.home.win + european.draw.win + european.away.win, 1);
  const draw = { status: 'finished-regulation', cycleEligibility: { eligible: true }, halfTimeScore: null,
    regulationScore: { verified: true, period: 'regulation-including-stoppage-time', home: 1, away: 1 } };
  assert.equal(settleGoalSelection(scoreDefinitions.get(fullTimeKey('draw-no-bet')), 'home', draw).status, 'push');
  assert.equal(settleGoalSelection(scoreDefinitions.get(fullTimeKey('asian-handicap:-0.25')), 'home', draw).status, 'half-loss');
  assert.equal(settleGoalSelection(scoreDefinitions.get(fullTimeKey('asian-handicap:-0.25')), 'away', draw).status, 'half-win');
});

test('all reviewed selections remain normalized and project with existing public probability and payout fields', () => {
  for (const localPoisson of [{ home: 0.05, away: 6 }, { home: 6, away: 6 }]) {
    const definitions = goalDefinitionsForLocalFirstProfile(LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE);
    const extension = prepareGoalMarketExtension({ evaluationProfile: LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE, definitions, localPoisson });
    const published = publicGoalMarketExtension(extension).filter(({ key }) => scoreDefinitions.has(key));
    assert.equal(published.length, scoreDefinitions.size);
    for (const market of published) {
      assert.equal(market.probabilityBasis, 'model-event');
      for (const { settlementProbabilities: grades, probability } of market.selections) {
        close(Object.values(grades).reduce((sum, grade) => sum + grade, 0), 1);
        assert.equal(probability, grades.win);
        assert.ok(Object.values(grades).every((grade) => Number.isFinite(grade) && grade >= 0 && grade <= 1));
      }
    }
  }
  assert.equal(deriveLocalGoalMarket({ home: 6.01, away: 0.05 }, scoreDefinitions.get(fullTimeKey('exact-score')), 'outright-win').available, false);
});

test('sealed score and count revisions rehydrate through their original definitions and rates', () => {
  const fixtureId = '71110000-0000-4000-8000-000000000001', cycleId = '71110000-0000-4000-8000-000000000002';
  const revisionId = '71110000-0000-4000-8000-000000000003', recordedAt = Date.parse('2026-11-26T10:25:00Z');
  for (const evaluationProfile of [LOCAL_FIRST_GOAL_EVALUATION_PROFILE, LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE]) {
    const definitions = goalDefinitionsForLocalFirstProfile(evaluationProfile);
    const prepared = prepareGoalMarketExtension({ evaluationProfile, definitions, localPoisson: rates });
    const sealed = { ...prepared, fixtureId, cycleId, revisionId, recordedAt, contentHash: evidenceFingerprint(prepared) };
    const row = { ...sealed, validIntegrity: 1, recordedAt: new Date(recordedAt), body: evidenceSerialize(sealed) };
    assert.deepEqual(goalMarketExtensionFromRow(row), sealed);
    assert.throws(() => goalMarketExtensionFromRow({ ...row, body: evidenceSerialize({ ...sealed,
      localPoisson: { ...rates, home: rates.home + 0.1 } }) }));
  }
});

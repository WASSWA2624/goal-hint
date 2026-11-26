import assert from 'node:assert/strict';
import test from 'node:test';
import { goalHighestScoringHalfMarket, goalScoringInBothHalvesMarket, liveGoalMarketDefinitions, LOCAL_FIRST_GOAL_EVALUATION_PROFILE,
  legacyLocalFirstGoalMarketDefinitions, LEGACY_LOCAL_FIRST_GOAL_EVALUATION_PROFILE, localFirstGoalMarketDefinitions,
  goalDefinitionsForLocalFirstProfile, LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE, registeredForecastGoalMarkets } from '../src/domain/goal-market-definitions.ts';
import { LEGACY_LOCAL_FIRST_MARKET_REGISTRY_VERSION, LOCAL_FIRST_MARKET_REGISTRY_VERSION, MARKET_REGISTRY_VERSION, marketRegistry,
  SCORE_LOCAL_FIRST_MARKET_REGISTRY_VERSION } from '../src/domain/market-registry.ts';
import { marketRules, validateMarketSnapshot } from '../src/domain/markets.ts';
import { settleGoalSelection } from '../src/domain/score-distribution-markets.ts';
import { SCORE_DISTRIBUTION_VERSION } from '../src/domain/score-distribution.ts';
import { evaluateForecastMarkets, FORECAST_MARKET_EVALUATION_VERSION, legacyForecastMarketKey,
  LEGACY_LOCAL_FIRST_FORECAST_MARKET_EVALUATION_VERSION, LOCAL_FIRST_FORECAST_MARKET_EVALUATION_VERSION,
  SCORE_LOCAL_FIRST_FORECAST_MARKET_EVALUATION_VERSION } from '../src/server/predictions/forecast-market-evaluator.ts';
import { prepareGoalMarketExtension } from '../src/server/predictions/goal-market-store.ts';

const state = (home, away, halfHome, halfAway, probability) => ({ home, away, halfHome, halfAway, probability });
const modelGrid = { version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0, states: [
  state(2, 1, 1, 0, 0.31), state(1, 0, 0, 0, 0.17), state(1, 1, 0, 1, 0.19), state(0, 0, 0, 0, 0.13), state(0, 2, 0, 2, 0.20),
] };
const model = (qualifiedMarkets, scoreDistribution = modelGrid) => ({ source: 'local-engine', modelVersion: 'fixture-goal-model-test',
  scoreDistribution, qualifiedMarkets });
const resolved = (source = 'ai', home = 0.48, draw = 0.32, away = 0.20) => validateMarketSnapshot({
  'match-result': { source, period: marketRules.period, probabilities: { 'home-win': home, draw, 'away-win': away } },
  ...(source === 'api-football' ? {} : {
    'total-goals': { source, period: marketRules.period, line: 2.5, probabilities: { 'over-2.5': 0.31, 'under-2.5': 0.69 } },
    'both-teams-to-score': { source, period: marketRules.period, probabilities: { yes: 0.50, no: 0.50 } },
  }),
}).markets;
const rowsByKey = (result) => new Map(result.markets.map((row) => [row.marketKey, row]));
const wins = (row, key) => row.selections.find((selection) => selection.key === key).outcomes.win;
const assertNear = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}`);

test('new decisions seal approved exact lines and retain independent family and period abstentions', () => {
  const candidateMarkets = resolved('local-engine');
  const rates = { home: 1.7, away: 1.3, firstHalfShare: { home: 0.4, away: 0.45 } };
  const published = prepareGoalMarketExtension({ evaluationProfile: LOCAL_FIRST_GOAL_EVALUATION_PROFILE,
    localPoisson: rates, definitions: localFirstGoalMarketDefinitions });
  const evaluated = evaluateForecastMarkets({ candidateMarkets, localFirst: true, publishedLocalMarkets: published.markets });
  assert.equal(evaluated.registryVersion, LOCAL_FIRST_MARKET_REGISTRY_VERSION);
  assert.equal(evaluated.version, LOCAL_FIRST_FORECAST_MARKET_EVALUATION_VERSION);
  const rows = rowsByKey(evaluated), quarter = rows.get('goal:full-time:totals:total:5.25:asian');
  assert.equal(quarter.source, 'local-engine');
  assert.ok(quarter.selections.find((selection) => selection.key === 'under').outcomes['half-win'] > 0);
  assert.equal(rows.get(legacyForecastMarketKey('match-result')).source, 'local-engine');
  const lines = Array.from({ length: 17 }, (_, index) => 1.5 + index / 4);
  for (const metric of ['total', 'home', 'away']) {
    for (const line of [0.5, 6.5]) assert.equal(rows.get(`goal:full-time:totals:${metric}:${line}:binary`).reason, 'outside-full-match-totals-range');
    assert.deepEqual([...rows.values()].filter((row) => row.status === 'estimated' && row.marketKey.startsWith(`goal:full-time:totals:${metric}:`))
      .map(({ definition }) => definition.selections[0].rule.line).sort((left, right) => left - right), lines);
  }
  assert.equal(rows.get('goal:full-time:team-to-score:away').reason, 'unsupported-publication-projection');
  assert.equal(rows.get('goal:full-time:clean-sheet:home').reason, 'unsupported-publication-projection');
  assertNear(wins(rows.get('goal:full-time:count-range:total:1-3'), 'yes'), (3 + 9 / 2 + 27 / 6) * Math.exp(-3));
  assert.equal(rows.get('goal:second-half:totals:total:1.5:binary').reason, 'no-qualified-period-model');
  assert.equal(rows.get('goal:full-time:asian-handicap:-0.25').reason, 'no-qualified-goal-model');
  assert.equal(rows.get('registry:statistic-totals').detail, 'no-qualified-statistic-model');
  assert.equal(rows.get('registry:player-totals').reason, 'unsupported-settlement');
  const supportedMatureModel = model(['goal:half-time:totals:total:0.5:binary', 'goal:full-time:totals:total:0.5:binary']);
  const independent = rowsByKey(evaluateForecastMarkets({ candidateMarkets: resolved('api-football', .5, .3, .2), localFirst: true,
    goalModel: supportedMatureModel, verifyGoalModel: () => true }));
  assert.equal(independent.get('goal:half-time:totals:total:0.5:binary').status, 'estimated');
  assert.equal(independent.get('goal:full-time:totals:total:0.5:binary').reason, 'outside-full-match-totals-range');
});

test('v4 local-first decisions retain their original team totals and historical evaluation identity', () => {
  const localFirst = LEGACY_LOCAL_FIRST_GOAL_EVALUATION_PROFILE;
  const input = { evaluationProfile: localFirst, localPoisson: { home: 1.7, away: 1.3 }, definitions: legacyLocalFirstGoalMarketDefinitions };
  const published = prepareGoalMarketExtension(input);
  const evaluated = evaluateForecastMarkets({ candidateMarkets: resolved('local-engine'), localFirst, publishedLocalMarkets: published.markets });
  assert.equal(evaluated.registryVersion, LEGACY_LOCAL_FIRST_MARKET_REGISTRY_VERSION);
  assert.equal(evaluated.version, LEGACY_LOCAL_FIRST_FORECAST_MARKET_EVALUATION_VERSION);
  const rows = rowsByKey(evaluated);
  assert.equal(rows.get('goal:full-time:totals:home:6.5:binary').status, 'estimated');
  assert.equal(rows.get('goal:full-time:totals:total:6.5:binary').reason, 'outside-full-match-totals-range');
  assert.equal(rows.has('goal:full-time:totals:away:5.25:asian'), false);
  assert.throws(() => prepareGoalMarketExtension({ ...input, definitions: localFirstGoalMarketDefinitions }));
  assert.throws(() => prepareGoalMarketExtension({ ...input, evaluationProfile: LOCAL_FIRST_GOAL_EVALUATION_PROFILE }));
});

test('the new profile qualifies published regulation score markets without inferring period or statistic probabilities', () => {
  const localFirst = LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE;
  const { markets } = prepareGoalMarketExtension({ evaluationProfile: localFirst, localPoisson: { home: 1.7, away: 1.3 },
    definitions: goalDefinitionsForLocalFirstProfile(localFirst) });
  const candidateMarkets = resolved('local-engine');
  const evaluated = evaluateForecastMarkets({ candidateMarkets, localFirst, publishedLocalMarkets: markets });
  assert.equal(evaluated.registryVersion, SCORE_LOCAL_FIRST_MARKET_REGISTRY_VERSION);
  assert.equal(evaluated.version, SCORE_LOCAL_FIRST_FORECAST_MARKET_EVALUATION_VERSION);
  const rows = rowsByKey(evaluated);
  const handicap = rows.get('goal:full-time:asian-handicap:-0.25');
  assert.equal(handicap.source, 'local-engine');
  assert.equal(handicap.status, 'estimated');
  const home = handicap.selections.find((selection) => selection.key === 'home').outcomes;
  assert.ok(home.win > 0 && home['half-loss'] > 0 && home.loss > 0);
  assertNear(home.win + home['half-loss'] + home.loss, 1);
  assert.equal(rows.get('goal:second-half:totals:total:1.5:binary').reason, 'no-qualified-period-model');
  assert.equal(rows.get('registry:statistic-totals').detail, 'no-qualified-statistic-model');
});

test('the sealed legacy candidate survives while every registered family gets an explicit result or abstention', () => {
  const candidateMarkets = resolved('api-football');
  const result = evaluateForecastMarkets({ candidateMarkets }), rows = rowsByKey(result);
  assert.equal(result.version, FORECAST_MARKET_EVALUATION_VERSION);
  assert.equal(result.registryVersion, MARKET_REGISTRY_VERSION);
  assert.equal(rows.size, result.markets.length);
  assert.deepEqual(new Set(result.markets.map(({ family }) => family)), new Set(Object.keys(marketRegistry)));
  const home = rows.get('goal:full-time:result');
  assert.deepEqual(home.recommendation, { selection: 'home', winProbability: 0.48, winProbabilityUpperBound: 0.48 });
  assert.equal(home.source, 'api-football');
  assert.equal(home.definition.key, home.marketKey);
  const doubleChance = rows.get('goal:full-time:double-chance');
  assert.equal(doubleChance.group, 'overlapping');
  assertNear(wins(doubleChance, 'home-draw'), 0.8);
  assertNear(doubleChance.selections.reduce((sum, selection) => sum + selection.winProbability, 0), 2);
  assert.equal(rows.get('goal:full-time:totals:total:2.5:binary').status, 'unavailable');
  assert.equal(rows.get('goal:full-time:totals:total:1.5:binary').reason, 'no-qualified-goal-model');
  assert.equal(rows.get('goal:second-half:result').reason, 'no-qualified-period-model');
  assert.equal(rows.get('registry:player-scorer').detail, 'no-qualified-player-model');
  assert.equal(rows.get('registry:player-totals').reason, 'unsupported-settlement');
  assert.equal(rows.get('registry:statistic-totals').detail, 'no-qualified-statistic-model');
  assert.equal(rows.get('registry:first-or-last-team-event').detail, 'no-qualified-event-order-model');
  assert.ok(result.markets.filter(({ status }) => status === 'unavailable').every((row) => !Object.hasOwn(row, 'selections')));
});

test('the reviewed market instances preserve the current stored extension order and obey every registered family', () => {
  const registered = registeredForecastGoalMarkets(), keys = registered.map(({ definition }) => definition.key);
  assert.equal(keys.length, new Set(keys).size);
  assert.deepEqual(registered.slice(0, liveGoalMarketDefinitions.length).map(({ definition }) => definition), liveGoalMarketDefinitions);
  for (const { family, definition } of registered) {
    const entry = marketRegistry[family];
    assert.ok(entry.periods.includes(definition.period), definition.key);
    assert.equal(entry.settlement.basis, 'score', definition.key);
    assert.ok(definition.selections.every(({ rule }) => entry.settlement.rules.includes(rule.kind)), definition.key);
    if (entry.selections.kind === 'fixed') assert.deepEqual(definition.selections.map(({ key }) => key), entry.selections.keys, definition.key);
  }
});

test('qualified parameterized markets use coherent totals, ranges, scores, handicap grades and combination bounds', () => {
  const candidateMarkets = resolved();
  const keys = registeredForecastGoalMarkets().map(({ definition }) => definition.key);
  const rows = rowsByKey(evaluateForecastMarkets({ candidateMarkets, goalModel: model(keys), verifyGoalModel: () => true }));
  const goals = (line) => rows.get(`goal:full-time:totals:total:${line}:binary`), result = rows.get('goal:full-time:result');
  const btts = rows.get('goal:full-time:btts');
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) assert.ok(wins(goals(line), 'over') >= wins(goals(line + 1), 'over'));
  assert.ok(wins(goals(1.5), 'over') >= wins(btts, 'yes'));
  assertNear(wins(goals(1.5), 'over'), 0.7);
  const combo = rows.get('goal:full-time:combination:result:total:2.5');
  assertNear(wins(combo, 'home-over'), 0.31);
  assert.ok(wins(combo, 'home-over') <= wins(result, 'home') && wins(combo, 'home-over') <= wins(goals(2.5), 'over'));
  const doubleCombo = rows.get('goal:full-time:combination:double-chance:total:2.5');
  assertNear(doubleCombo.selections.reduce((sum, row) => sum + row.winProbability, 0), 2);
  assertNear(wins(rows.get('goal:full-time:goal-range:total:1-3'), 'yes'), 0.87);
  assertNear(wins(rows.get('goal:full-time:exact-score'), '2-1'), 0.31);
  assertNear(wins(rows.get('goal:full-time:clean-sheet:home'), 'yes'), 0.3);
  const noBet = rows.get('goal:full-time:draw-no-bet'), asian = rows.get('goal:full-time:asian-handicap:-0.25');
  assertNear(noBet.selections[0].outcomes.push, 0.32);
  assertNear(asian.selections[1].outcomes['half-win'], 0.32);
  assertNear(asian.selections[0].outcomes['half-loss'], 0.32);
  assert.equal(asian.recommendation.selection, 'home');
  assertNear(asian.recommendation.winProbability, 0.48);
  const asianTotal = rows.get('goal:full-time:totals:total:2:asian');
  assertNear(asianTotal.selections.find(({ key }) => key === 'over').outcomes.push, 0.39);
  const european = rows.get('goal:full-time:european-handicap:-1');
  assertNear(wins(european, 'draw'), 0.48);
  for (const row of rows.values()) if (row.status === 'estimated') {
    for (const choice of row.selections) {
      assert.ok(Object.values(choice.outcomes).every((p) => Number.isFinite(p) && p >= 0 && p <= 1));
      assertNear(Object.values(choice.outcomes).reduce((sum, p) => sum + p, row.unrepresentedProbability), 1);
    }
    if (row.group === 'partition') assertNear(row.selections.reduce((sum, s) => sum + s.winProbability, row.unrepresentedProbability), 1);
  }
});

test('period decisions require exact authorized keys and preserve verified first-half and second-half dependence', () => {
  const keys = ['goal:full-time:half-full-result', 'goal:full-time:highest-scoring-half', 'goal:full-time:scoring-in-both-halves:total',
    'goal:full-time:scoring-in-both-halves:home', 'goal:half-time:result', 'goal:second-half:btts'];
  const candidateMarkets = resolved(), goalModel = model(keys);
  const rows = rowsByKey(evaluateForecastMarkets({ candidateMarkets, goalModel, verifyGoalModel: (proof) => proof === goalModel }));
  assertNear(wins(rows.get(keys[0]), 'away-draw'), 0.19);
  assertNear(wins(rows.get(keys[1]), 'equal'), 0.32);
  assertNear(wins(rows.get(keys[2]), 'yes'), 0.5);
  assertNear(wins(rows.get(keys[3]), 'yes'), 0.31);
  assertNear(wins(rows.get(keys[4]), 'home'), 0.31);
  assertNear(wins(rows.get(keys[5]), 'yes'), 0.31);
  assert.equal(rows.get('goal:half-time:double-chance').reason, 'no-qualified-period-model');
  assert.equal(rows.get('goal:full-time:totals:total:1.5:binary').reason, 'no-qualified-market-model');
  const missingPeriod = model(keys, { ...modelGrid, states: modelGrid.states.map((row) => ({ ...row, halfHome: null, halfAway: null })) });
  const missing = rowsByKey(evaluateForecastMarkets({ candidateMarkets, goalModel: missingPeriod, verifyGoalModel: () => true }));
  assert.equal(missing.get(keys[4]).reason, 'missing-half-time-distribution');
});

test('bounded tail, incompatible grid and unproved model never manufacture point estimates', () => {
  const key = 'goal:full-time:totals:total:0.5:binary';
  const none = validateMarketSnapshot({}).markets;
  const raw = model([key]);
  for (const verifyGoalModel of [undefined, () => false, async () => true]) {
    const unproved = rowsByKey(evaluateForecastMarkets({ candidateMarkets: none, goalModel: raw, verifyGoalModel }));
    assert.equal(unproved.get(key).reason, 'unverified-goal-model');
  }
  const invalid = rowsByKey(evaluateForecastMarkets({ candidateMarkets: none,
    goalModel: model([key], { ...modelGrid, unrepresentedProbability: 1e-6, states: [state(2, 1, 1, 0, 1 - 1e-6)] }), verifyGoalModel: () => true }));
  assert.equal(invalid.get(key).reason, 'unrepresented-score-mass');
  const conflict = rowsByKey(evaluateForecastMarkets({ candidateMarkets: resolved('api-football', 0.5, 0.3, 0.2),
    goalModel: raw, verifyGoalModel: () => true }));
  assert.equal(conflict.get(key).reason, 'model-cross-market-conflict');
  assert.equal(conflict.get('goal:full-time:result').status, 'estimated');
  const tail = 0.0000005, grid = { ...modelGrid, unrepresentedProbability: tail,
    states: [state(0, 0, 0, 0, 0.6), state(1, 0, 1, 0, 0.4 - tail)] };
  const doubleCounted = resolved('api-football', 0.4800004, 0.3200004, 0.20 - tail);
  const conflictingTail = { ...modelGrid, unrepresentedProbability: tail,
    states: [...modelGrid.states.slice(0, -1), state(0, 2, 0, 2, 0.20 - tail)] };
  const doubleCountedRows = rowsByKey(evaluateForecastMarkets({ candidateMarkets: doubleCounted,
    goalModel: model([key], conflictingTail), verifyGoalModel: () => true }));
  assert.equal(doubleCountedRows.get(key).reason, 'model-cross-market-conflict');
  const bounded = rowsByKey(evaluateForecastMarkets({ candidateMarkets: none, goalModel: model([key], grid), verifyGoalModel: () => true }));
  assert.equal(bounded.get(key).unrepresentedProbability, tail);
  assertNear(bounded.get(key).recommendation.winProbability, 0.6);
  assertNear(bounded.get(key).recommendation.winProbabilityUpperBound, 0.6 + tail);
  const unresolved = rowsByKey(evaluateForecastMarkets({ candidateMarkets: none, goalModel: model([key], { ...grid,
    states: [state(0, 0, 0, 0, (1 - tail) / 2), state(1, 0, 1, 0, (1 - tail) / 2)] }), verifyGoalModel: () => true }));
  assert.equal(unresolved.get(key).reason, 'unresolved-selection-order');
});

test('an approved coherent distribution can evaluate an otherwise absent registered legacy instance', () => {
  const candidateMarkets = validateMarketSnapshot({}).markets, key = 'goal:full-time:result', goalModel = model([key]);
  const rows = rowsByKey(evaluateForecastMarkets({ candidateMarkets, goalModel, verifyGoalModel: (proof) => proof === goalModel }));
  assert.equal(rows.get(key).source, 'local-engine');
  assert.equal(rows.get(key).recommendation.selection, 'home');
  assertNear(rows.get(key).recommendation.winProbability, 0.48);
  assert.equal(rows.get('goal:full-time:double-chance').status, 'unavailable');
});

test('cross-period settlements use verified regulation and first-half scores even after extra time', () => {
  const context = { status: 'finished-extra-time', cycleEligibility: { eligible: true },
    regulationScore: { verified: true, period: 'regulation-including-stoppage-time', home: 2, away: 2 },
    halfTimeScore: { verified: true, period: 'first-half-including-stoppage-time', home: 1, away: 1 } };
  assert.equal(settleGoalSelection(goalHighestScoringHalfMarket(), 'equal', context).status, 'correct');
  assert.equal(settleGoalSelection(goalScoringInBothHalvesMarket('home'), 'yes', context).status, 'correct');
  assert.equal(settleGoalSelection(goalScoringInBothHalvesMarket('total'), 'yes', { ...context, halfTimeScore: null }).reason, 'missing-verified-half-time-score');
  const corrected = { ...context, halfTimeScore: { ...context.halfTimeScore, home: 0, away: 0 } };
  assert.equal(settleGoalSelection(goalHighestScoringHalfMarket(), 'second-half', corrected).status, 'correct');
  assert.equal(settleGoalSelection(goalScoringInBothHalvesMarket('home'), 'yes', corrected).status, 'incorrect');
});

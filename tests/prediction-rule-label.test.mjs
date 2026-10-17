import assert from 'node:assert/strict';
import test from 'node:test';
import { predictionRuleLabel } from '../src/domain/prediction-label.ts';
import { goalAsianHandicapMarket, goalBothTeamsScoreMarket, goalCleanSheetMarket, goalCombinationMarket,
  goalDoubleChanceMarket, goalEuropeanHandicapMarket, goalExactScoreMarket, goalHalfFullMarket,
  goalParityMarket, goalResultMarket, goalTotalsMarket, goalWinToNilMarket } from '../src/domain/goal-market-definitions.ts';
import { countMetrics, eventMetrics, nonGoalAsianHandicapMarket, nonGoalDoubleChanceMarket, nonGoalEventMarket,
  nonGoalEventTeamMarket, nonGoalExactCountMarket, nonGoalHandicapMarket, nonGoalParityMarket,
  nonGoalResultMarket, nonGoalTotalsMarket } from '../src/domain/non-goal-market-definitions.ts';
import { SCORE_DISTRIBUTION_VERSION } from '../src/domain/score-distribution.ts';
import { publicExtendedMarketSchema, publicExtendedPickSchema } from '../src/domain/extended-markets.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { oddsValuesHash } from '../src/server/odds/odds-mysql-store.ts';
import { goalMarketExtensionFromRow, prepareGoalMarketExtension } from '../src/server/predictions/goal-market-store.ts';
import { impliedMarketExtensionFromRow, prepareImpliedMarketExtension, publicImpliedMarketExtension } from '../src/server/predictions/implied-market-store.ts';
import { publicGoalMarketExtension, publicImpliedMarkets } from '../src/server/predictions/extended-market-read.ts';
import { preparePublishedExtendedPicks, publishedExtendedPickFromRow, publishedExtendedPickSchema } from '../src/server/predictions/extended-market-picks.ts';

const plain = (label) => {
  assert.equal(typeof label, 'string'); assert.ok(label.length > 0);
  assert.doesNotMatch(label, /^(?:1|2|X|1X|X2|12|O|U|BTTS|DC|1X2)$/iu);
  assert.doesNotMatch(label, /Arsenal|Chelsea|\bARS\b|\bCHE\b|market\.selection\.|\{(?:home|away|line)\}/u);
};
const labels = (definition) => definition.selections.map(({ label }) => label);

test('every structured outcome describes the event in words, retaining exact scores, counts and handicap lines', () => {
  const cases = [
    [{ kind: 'result', result: 'home' }, 'Home win'], [{ kind: 'result', result: 'draw' }, 'Draw'],
    [{ kind: 'result', result: 'away' }, 'Away win'],
    [{ kind: 'double-chance', results: ['home', 'draw'] }, 'Home or draw'],
    [{ kind: 'double-chance', results: ['draw', 'away'] }, 'Away or draw'],
    [{ kind: 'double-chance', results: ['away', 'home'] }, 'Home or away'],
    [{ kind: 'total', metric: 'total', direction: 'over', line: 2.5 }, 'Over 2.5'],
    [{ kind: 'total', metric: 'home', direction: 'under', line: 1.5 }, 'Under 1.5'],
    [{ kind: 'asian-total', metric: 'away', direction: 'under', line: 1.25 }, 'Under 1.25'],
    [{ kind: 'both-teams-score', yes: true }, 'Both teams to score'],
    [{ kind: 'both-teams-score', yes: false }, 'Not both teams to score'],
    [{ kind: 'odd-even', metric: 'total', odd: true }, 'Odd'], [{ kind: 'odd-even', odd: false }, 'Even'],
    [{ kind: 'clean-sheet', team: 'home', yes: true }, 'Home clean sheet'],
    [{ kind: 'clean-sheet', team: 'away', yes: false }, 'Away to concede'],
    [{ kind: 'win-to-nil', team: 'away', yes: true }, 'Away win to nil'],
    [{ kind: 'win-to-nil', team: 'home', yes: false }, 'Home not to win to nil'],
    [{ kind: 'asian-handicap', team: 'home', line: -.25 }, 'Home -0.25'],
    [{ kind: 'asian-handicap', team: 'away', line: .25 }, 'Away +0.25'],
    [{ kind: 'handicap-result', homeHandicap: -1, result: 'away' }, 'Away win'],
    [{ kind: 'exact-score', home: 2, away: 1 }, '2:1'],
    [{ kind: 'half-full-result', half: 'home', full: 'away' }, 'Home win / Away win'],
    [{ kind: 'exact-count', count: 1 }, 'Exactly 1'],
    [{ kind: 'other-count', excluded: [0, 1, 2] }, 'Other count'],
    [{ kind: 'event-occurs', position: 'first', yes: true }, 'Yes'],
    [{ kind: 'event-occurs', position: 'last', yes: false }, 'No'],
    [{ kind: 'event-team', position: 'first', team: 'home' }, 'Home team'],
    [{ kind: 'event-team', position: 'last', team: 'away' }, 'Away team'],
    [{ kind: 'event-team', position: 'first', team: 'none' }, 'No event'],
    [{ kind: 'all', rules: [{ kind: 'result', result: 'home' }, { kind: 'total', metric: 'total', direction: 'over', line: 2.5 }] }, 'Home win and Over 2.5'],
    [{ kind: 'none', rules: [{ kind: 'exact-score', home: 0, away: 0 }] }, 'Other score'],
    [{ kind: 'none', rules: [{ kind: 'result', result: 'home' }, { kind: 'result', result: 'draw' }] }, 'None of the specified outcomes'],
  ];
  for (const [rule, expected] of cases) {
    const label = predictionRuleLabel(rule);
    assert.equal(label, expected, JSON.stringify(rule)); plain(label);
  }
});

test('goal definition factories use semantic choices for every period and preserve dynamic line identities', () => {
  for (const period of ['full-time', 'half-time', 'second-half']) {
    assert.deepEqual(labels(goalResultMarket(period)), ['Home win', 'Draw', 'Away win']);
    assert.deepEqual(labels(goalDoubleChanceMarket(period)), ['Home or draw', 'Away or draw', 'Home or away']);
    for (const line of [.5, 1.5, 2.5, 4.5, 80.5]) {
      for (const metric of ['total', 'home', 'away']) {
        const definition = goalTotalsMarket(line, metric, period);
        assert.deepEqual(labels(definition), [`Over ${line}`, `Under ${line}`]);
        assert.equal(definition.key, `goal:${period}:totals:${metric}:${line}:binary`);
        assert.ok(definition.selections.every(({ rule }) => rule.line === line));
      }
    }
    assert.match(goalTotalsMarket(1.5, 'home', period).label, /Home team goals/u);
    const definitions = [goalBothTeamsScoreMarket(period), goalParityMarket('total', period), goalCleanSheetMarket('home', period),
      goalWinToNilMarket('away', period), goalAsianHandicapMarket(-.25, period), goalEuropeanHandicapMarket(-1, period),
      goalExactScoreMarket([{ home: 0, away: 0 }, { home: 1, away: 0 }], period, true),
      goalTotalsMarket(2.25, 'total', period, 'asian')];
    for (const definition of definitions) for (const label of labels(definition)) plain(label);
  }
  assert.ok(labels(goalHalfFullMarket()).includes('Home win / Away win'));
  const combination = goalCombinationMarket('result-total', 'Result and goals', [
    { key: 'home-over', label: 'Arsenal win and O2.5', rule: { kind: 'all', rules: [
      { kind: 'result', result: 'home' }, { kind: 'total', metric: 'total', direction: 'over', line: 2.5 }] } },
    { key: 'other', label: 'Other', rule: { kind: 'none', rules: [{ kind: 'result', result: 'home' }] } },
  ]);
  assert.equal(combination.selections[0].label, 'Home win and Over 2.5');
});

test('all supported count and event metrics use generic choices without losing lines or event semantics', () => {
  for (const metric of countMetrics) {
    assert.deepEqual(labels(nonGoalResultMarket(metric)), ['Home win', 'Draw', 'Away win']);
    assert.deepEqual(labels(nonGoalDoubleChanceMarket(metric)), ['Home or draw', 'Away or draw', 'Home or away']);
    assert.deepEqual(labels(nonGoalTotalsMarket(metric, 9.5)), ['Over 9.5', 'Under 9.5']);
    assert.deepEqual(labels(nonGoalTotalsMarket(metric, 10.25, {}, true)), ['Over 10.25', 'Under 10.25']);
    assert.deepEqual(labels(nonGoalExactCountMarket(metric, [0, 1, 2])), ['Exactly 0', 'Exactly 1', 'Exactly 2', 'Other count']);
    for (const definition of [nonGoalAsianHandicapMarket(metric, -1.5), nonGoalHandicapMarket(metric, -1), nonGoalParityMarket(metric)]) {
      for (const label of labels(definition)) plain(label);
    }
  }
  for (const metric of eventMetrics) {
    for (const position of ['any', 'first', 'last']) assert.deepEqual(labels(nonGoalEventMarket(metric, position)), ['Yes', 'No']);
    for (const position of ['first', 'last']) assert.deepEqual(labels(nonGoalEventTeamMarket(metric, position)), ['Home team', 'Away team', 'No event']);
  }
});

const at = Date.parse('2026-10-12T08:00:00Z'), fixtureId = '10000000-0000-4000-8000-000000000001',
  cycleId = '20000000-0000-4000-8000-000000000001', revisionId = '30000000-0000-4000-8000-000000000001';
const stored = (prepared) => ({ ...prepared, fixtureId, cycleId, revisionId, recordedAt: at, contentHash: evidenceFingerprint(prepared) });
const row = (body) => ({ ...body, body, validIntegrity: 1, recordedAt: new Date(at) });
const legacyDefinition = (definition) => ({ ...definition, selections: definition.selections.map((selection, index) =>
  ({ ...selection, label: ['Arsenal win', 'X', 'Chelsea win'][index] })) });
const assertPublishedHistory = (goal, implied) => {
  const [pick] = preparePublishedExtendedPicks(goal, implied);
  assert.equal(pick.selectionLabel, 'Arsenal win', 'Sealed storage is distinct from the public display projection.');
  assert.deepEqual(publishedExtendedPickFromRow({ ...row(pick), marketKey: pick.key }), pick);
};

test('eight-clause public predictions retain every full-word outcome without expanding sealed source bounds', () => {
  const atom = { kind: 'half-full-result', half: 'home', full: 'home' };
  const rule = { kind: 'all', rules: Array.from({ length: 8 }, () => ({ ...atom })) };
  const definition = goalCombinationMarket('long-structured-event', 'Combined results', [
    { key: 'multi', label: 'Combined outcome', rule },
    { key: 'other', label: 'Other outcome', rule: { kind: 'none', rules: [atom] } },
  ]);
  const prepared = prepareGoalMarketExtension({ scoreDistribution: { version: SCORE_DISTRIBUTION_VERSION,
    unrepresentedProbability: 0, states: [
      { home: 0, away: 0, halfHome: 0, halfAway: 0, probability: .2 },
      { home: 2, away: 0, halfHome: 1, halfAway: 0, probability: .8 },
    ] }, definitions: [definition] });
  const original = stored(prepared), decoded = goalMarketExtensionFromRow(row(original));
  assert.deepEqual(decoded, original);
  assert.equal(definition.selections[0].label, 'Combined outcome');
  const [market] = publicGoalMarketExtension(decoded), expected = Array(8).fill('Home win / Home win').join(' and ');
  assert.ok(expected.length > 128 && expected.length <= 512);
  assert.equal(market.selectionLabel, expected); assert.equal(market.selections[0].label, expected);
  assert.equal(publicExtendedMarketSchema.safeParse(market).success, true);
  const { selections, ...pick } = market;
  assert.equal(selections.length, 2); assert.equal(publicExtendedPickSchema.safeParse(pick).success, true);
  assert.equal(publicExtendedPickSchema.safeParse({ ...pick, selectionLabel: '<script>' }).success, false);
  assert.equal(publicExtendedPickSchema.safeParse({ ...pick, selectionLabel: 'x'.repeat(513) }).success, false);
  assert.equal(publicExtendedPickSchema.safeParse({ ...pick, label: 'x'.repeat(129) }).success, false);
  const [published] = preparePublishedExtendedPicks(decoded, null);
  assert.equal(published.selectionLabel, 'Combined outcome');
  assert.equal(publishedExtendedPickSchema.safeParse({ ...published, selectionLabel: expected }).success, false);
  assert.deepEqual(publishedExtendedPickFromRow({ ...row(published), marketKey: published.key }), published);
  assert.deepEqual(decoded, original);
});

test('old sealed goal labels remain hash-compatible while public choices are normalized from their rules', () => {
  const doubleChance = goalDoubleChanceMarket(), total = goalTotalsMarket(1.5);
  const prepared = prepareGoalMarketExtension({ scoreDistribution: { version: SCORE_DISTRIBUTION_VERSION,
    unrepresentedProbability: 0, states: [
      { home: 0, away: 0, halfHome: 0, halfAway: 0, probability: .2 },
      { home: 2, away: 0, halfHome: 1, halfAway: 0, probability: .8 },
    ] }, definitions: [legacyDefinition(goalResultMarket()),
      { ...doubleChance, selections: doubleChance.selections.map((selection, index) => ({ ...selection, label: ['1X', 'X2', '12'][index] })) },
      { ...total, selections: total.selections.map((selection, index) => ({ ...selection, label: ['O1.5', 'U1.5'][index] })) }] });
  const original = stored(prepared), decoded = goalMarketExtensionFromRow(row(original));
  assert.deepEqual(decoded, original);
  const [market, chance, goals] = publicGoalMarketExtension(decoded);
  assert.equal(market.selectionLabel, 'Home win');
  assert.deepEqual(market.selections.map(({ label }) => label), ['Home win', 'Draw', 'Away win']);
  assert.deepEqual(chance.selections.map(({ label }) => label), ['Home or draw', 'Away or draw', 'Home or away']);
  assert.deepEqual(goals.selections.map(({ label }) => label), ['Over 1.5', 'Under 1.5']);
  assert.equal(market.selection, decoded.markets[0].derivation.market.selection);
  assert.equal(market.selectedProbability, decoded.markets[0].derivation.market.selectedProbability);
  assert.deepEqual(decoded, original); assertPublishedHistory(decoded, null);
});

test('old sealed bookmaker labels and quotes remain intact while every public envelope uses rule-derived choices', () => {
  const definition = legacyDefinition(nonGoalResultMarket('corners'));
  const mapping = { betId: 9001, betName: 'Synthetic legacy corners', definition, providerLabels: { home: '1', draw: 'X', away: '2' } };
  const values = [{ label: '1', odd: '1.50' }, { label: 'X', odd: '6.00' }, { label: '2', odd: '6.00' }];
  const snapshot = { id: 'b'.repeat(64), fixtureId, previousId: null, bookmakerId: 8, bookmakerName: 'Synthetic bookmaker',
    betId: mapping.betId, betName: mapping.betName, valuesHash: oddsValuesHash(values), retrievedAt: at - 1000,
    providerUpdatedAt: at - 2000, retainUntil: at + 86400000, values };
  const prepared = prepareImpliedMarketExtension({ bookmakerId: 8, freshnessMs: 60000, snapshotIds: [snapshot.id], mappings: [mapping] },
    [{ id: mapping.betId, name: mapping.betName }], [snapshot], at - 1000);
  const original = stored(prepared), decoded = impliedMarketExtensionFromRow(row(original));
  assert.deepEqual(decoded, original);
  const [market] = publicImpliedMarkets(decoded), [withQuotes] = publicImpliedMarketExtension(decoded, at);
  assert.equal(market.selectionLabel, 'Home win');
  for (const value of [market, withQuotes]) assert.deepEqual(value.selections.map(({ label }) => label), ['Home win', 'Draw', 'Away win']);
  assert.equal(withQuotes.selections[0].capturedPrice, '1.50');
  assert.deepEqual(decoded, original); assertPublishedHistory(null, decoded);
});

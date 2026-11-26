import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicationDeadline } from '../src/domain/calendar.ts';
import { goalDefinitionsForLocalFirstProfile, LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE } from '../src/domain/goal-market-definitions.ts';
import { SCORE_LOCAL_FIRST_MARKET_REGISTRY_VERSION } from '../src/domain/market-registry.ts';
import { marketRules, validateMarketSnapshot } from '../src/domain/markets.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { SCORE_LOCAL_FIRST_FORECAST_CASCADE } from '../src/server/fallback/fallback-contract.ts';
import { goalProbabilities, localGoalModelVersion } from '../src/server/intelligence/local-goals-model.ts';
import { buildForecastDecision, buildLocalFirstForecastDecision, forecastDecisionSchema, unavailableForecastMarkets } from '../src/server/predictions/forecast-decision.ts';
import { prepareGoalMarketExtension } from '../src/server/predictions/goal-market-store.ts';
import { evidenceAuthority, evidenceContext, evidenceHash, evidencePolicy, evidenceSource } from './helpers/evidence-fixtures.mjs';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';
import { emptyCandidate } from './helpers/publication-fixtures.mjs';

const context = evidenceContext(undefined, { cycleId: '30000000-0000-4000-8000-000000000001', runId: '30000000-0000-4000-8000-000000000002' });
const snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: [evidenceSource(context)] }, evidenceAuthority());
const input = (candidate = historyCandidate({ snapshot, source: 'api-football' })) => ({ candidate, snapshot,
  scheduleVersion: 2, evidenceSnapshotId: evidenceHash('sealed-test-snapshot-record'), generationCompletedAt: context.analysisAt + 2_500,
  publicationCutoffAt: getPublicationDeadline(context.kickoffAt) });

test('private receipt binds partial results, transparent support and a ranked pick to canonical market parameters', () => {
  const source = input(), win = source.candidate.markets['match-result'].market;
  const selected = { family: win.family, selection: 'draw', source: win.source, probability: win.probabilities.draw,
    confidence: 'limited', quote: null };
  const decision = buildForecastDecision({ ...source, candidate: { ...source.candidate, audit: { ...source.candidate.audit, recommendation: { selected } } } });
  const result = decision.markets.find(row => row.marketKey === 'goal:full-time:result');
  const unavailable = unavailableForecastMarkets(decision);
  assert.equal(decision.markets.length, 2, 'a supported result and its coherent double-chance survive independent unavailable families');
  assert.equal(result.definition.period, 'full-time');
  assert.equal(result.provenance.modelVersion, 'synthetic-provider-v1');
  assert.equal(result.confidence.status, 'provider-unqualified');
  assert.equal(decision.status, 'estimated');
  assert.equal(decision.evidenceHash, snapshot.hash);
  assert.equal(result.recommendation.selection, 'home');
  assert.deepEqual(decision.topPick, { marketKey: result.marketKey, selection: 'draw', canonicalSelection: 'draw',
    winProbability: win.probabilities.draw, source: 'api-football', confidence: 'limited' });
  assert.ok(unavailable.some(row => row.family === 'total-goals' && row.status === 'unavailable'));
  assert.ok(unavailable.some(row => row.family === 'correct-score' && row.reason === 'no-qualified-goal-model'));
  assert.ok(unavailable.every(row => !Object.hasOwn(row, 'selections')));
  assert.ok(forecastDecisionSchema.safeParse(decision).success);
});

test('abstention keeps only reasons, and late or malformed market content cannot acquire a valid seal', () => {
  const source = input(), abstained = buildForecastDecision({ ...source, candidate: emptyCandidate(source.candidate) });
  assert.equal(abstained.status, 'abstained');
  assert.equal(abstained.topPick, null);
  assert.equal(abstained.markets.length, 0);
  assert.ok(unavailableForecastMarkets(abstained).length > 250);
  assert.ok(Buffer.byteLength(JSON.stringify(abstained), 'utf8') < 24_000, 'repeat unavailable reasons are stored only once per family and period');
  assert.throws(() => buildForecastDecision({ ...source, generationCompletedAt: source.publicationCutoffAt }));
  assert.throws(() => buildForecastDecision({ ...source, snapshot: { ...snapshot, hash: evidenceHash('unbound') } }), /sealed candidate/u);
  const { hash, ...forged } = structuredClone(buildForecastDecision(source));
  assert.ok(hash);
  forged.markets.find(row => row.status === 'estimated').selections[0].outcomes.push = 0.5;
  assert.equal(forecastDecisionSchema.safeParse({ ...forged, hash: evidenceFingerprint(forged) }).success, false);
});

test('a score-profile decision seals each exact payout and keeps the Local Engine support provisional', async () => {
  const source = input(), rates = { home: 1.7, away: 1.3 }, evaluationProfile = LOCAL_FIRST_SCORE_GOAL_EVALUATION_PROFILE;
  const probabilities = goalProbabilities(rates.home, rates.away);
  const { markets } = validateMarketSnapshot(Object.fromEntries(Object.entries(probabilities).map(([family, values]) => [family, {
    source: 'local-engine', period: marketRules.period, probabilities: values,
    ...(family === 'total-goals' ? { line: marketRules.totalGoalsLine } : {}),
  }])));
  const candidate = { ...source.candidate,
    audit: { ...source.candidate.audit, sourceCascade: SCORE_LOCAL_FIRST_FORECAST_CASCADE },
    markets: Object.fromEntries(Object.entries(markets).map(([family, market]) => [family, {
      ...market, timestamps: { generatedAt: context.analysisAt, retrievedAt: context.analysisAt, providerUpdatedAt: null },
      provenance: { kind: 'local-engine', modelVersion: localGoalModelVersion(), historyHash: evidenceHash('training-receipts'),
        numericalBasis: 'qualified-local-model', sample: { matches: 250, homeEffectiveMatches: 36, awayEffectiveMatches: 39 } },
    }])) };
  const extension = prepareGoalMarketExtension({ evaluationProfile, localPoisson: rates,
    definitions: goalDefinitionsForLocalFirstProfile(evaluationProfile) });
  const goalExtension = { ...extension, contentHash: evidenceFingerprint(extension) };
  const sealed = await buildLocalFirstForecastDecision({ ...source, candidate, goalExtension });
  const decision = forecastDecisionSchema.parse(JSON.parse(JSON.stringify(sealed)));
  assert.equal(decision.registryVersion, SCORE_LOCAL_FIRST_MARKET_REGISTRY_VERSION);
  assert.equal(decision.goalExtensionHash, goalExtension.contentHash);
  const handicap = decision.markets.find(({ marketKey }) => marketKey === 'goal:full-time:asian-handicap:-0.25');
  assert.equal(handicap.confidence.status, 'provisional');
  assert.equal(handicap.confidence.calibrationVersion, null);
  const { outcomes, winProbability } = handicap.selections.find(({ key }) => key === 'home');
  assert.equal(outcomes.win, winProbability);
  assert.ok(Number(outcomes['half-loss']) > 0);
});

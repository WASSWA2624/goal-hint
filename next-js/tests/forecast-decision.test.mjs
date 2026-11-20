import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicationDeadline } from '../src/domain/calendar.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { buildForecastDecision, forecastDecisionSchema, unavailableForecastMarkets } from '../src/server/predictions/forecast-decision.ts';
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

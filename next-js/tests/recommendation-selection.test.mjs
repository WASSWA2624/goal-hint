import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMarketSnapshot } from '../src/domain/markets.ts';
import { publicPolicy } from '../src/domain/public-policy.ts';
import { selectRecommendation } from '../src/server/refresh/recommendation-selection.ts';
import { parseRecommendationDecision } from '../src/server/predictions/recommendation-input.ts';
import { evidenceContext, evidenceHash } from './helpers/evidence-fixtures.mjs';

const context = evidenceContext(), hash = evidenceHash('recommendation-evidence');
const snapshot = { id: evidenceHash('snapshot'), hash, context };
const assessor = () => ({ eligible: true, reasons: [], version: 'synthetic-evidence-v1' });
function candidate(source = 'api-football', probabilities = { 'home-win': .70, draw: .20, 'away-win': .10 }, extras = {}) {
  const markets = validateMarketSnapshot({ 'match-result': { source, period: publicPolicy.matchPeriod, probabilities }, ...extras }).markets;
  return { context: { context, evidenceHash: hash }, markets: Object.fromEntries(Object.entries(markets).map(([key, item]) => [key,
    item.available ? { ...item, timestamps: { generatedAt: null, retrievedAt: context.analysisAt, providerUpdatedAt: null } } : item])),
    audit: { aiStatus: source === 'ai' ? 'candidate' : 'denied', aiReason: source === 'ai' ? null : 'unconfigured' } };
}
function quote(family, selection, decimal, overrides = {}) {
  return { fixtureId: context.fixtureId, fixtureVersion: String(context.fixtureVersion), homeTeamId: context.home.teamId,
    awayTeamId: context.away.teamId, family, selection, period: publicPolicy.matchPeriod, line: family === 'total-goals' ? 2.5 : null,
    bookmakerId: 8, decimal, snapshotId: evidenceHash(`${family}:${selection}:${decimal}`), observedAt: context.analysisAt - 1000,
    providerUpdatedAt: null, permitted: true, suspended: false, ...overrides };
}
const select = (value, quotes, assess = assessor, extra = {}) => selectRecommendation({ candidate: value, quotes, snapshot,
  decisionAt: context.analysisAt + 1000, ...extra }, assess);

test('probability qualification precedes exact highest-odds ranking across every selection', () => {
  const forecast = candidate();
  const result = select(forecast, [quote('match-result', 'home-win', '1.9001'), quote('double-chance', 'home-or-draw', '1.40'),
    quote('double-chance', 'home-or-away', '1.9002'), quote('match-result', 'away-win', '99.99')]);
  assert.equal(result.decision.selected.selection, 'home-or-away', 'eligible non-argmax selection can win');
  assert.equal(result.decision.selected.probability, .8);
  assert.equal(result.candidate.markets['double-chance'].market.selection, 'home-or-draw', 'family argmax remains intact');
  assert.equal(result.decision.decisions.find(x => x.selection === 'away-win').eligible, false);
  assert.ok(result.decision.decisions.find(x => x.selection === 'away-win').reasons.includes('below-minimum-probability'));
  assert.equal(result.candidate.audit.recommendation, result.decision);
  assert.doesNotThrow(() => parseRecommendationDecision(result.decision, forecast.context, forecast.markets));
});

test('a lower probability wins with higher odds; threshold equality is inclusive', () => {
  const forecast = candidate('api-football', { 'home-win': .65, draw: .25, 'away-win': .10 });
  assert.equal(select(forecast, [quote('match-result', 'home-win', '1.90'), quote('double-chance', 'home-or-draw', '1.40')])
    .decision.selected.selection, 'home-win');
});

test('equal exact prices use unrounded probability then stable family and selection order', () => {
  const forecast = candidate('api-football', { 'home-win': .65, draw: .25, 'away-win': .10 });
  const quotes = [quote('match-result', 'home-win', '1.9000'), quote('double-chance', 'home-or-draw', '1.9')];
  assert.equal(select(forecast, quotes).decision.selected.selection, 'home-or-draw');
  const tied = candidate('api-football', { 'home-win': .65, draw: .20, 'away-win': .15 }, {
    'total-goals': { source: 'api-football', period: publicPolicy.matchPeriod, line: 2.5, probabilities: { 'over-2.5': .65, 'under-2.5': .35 } },
  });
  assert.equal(select(tied, [quote('total-goals', 'over-2.5', '1.9'), quotes[0]]).decision.selected.family, 'match-result');
});

test('missing, stale, suspended, future, wrong-selection, line and identity quotes abstain', () => {
  const valid = quote('match-result', 'home-win', '1.9');
  for (const change of [{ suspended: true }, { permitted: false }, { observedAt: context.analysisAt + 1 },
    { observedAt: context.analysisAt - 10_800_001 }, { selection: 'away-win' }, { line: 2.5 }, { period: 'first-half' },
    { homeTeamId: context.away.teamId }, { fixtureVersion: '2' }, { decimal: 'NaN' }, { bookmakerId: 0 },
    { providerUpdatedAt: context.analysisAt + 1 }]) {
    assert.equal(select(candidate(), [{ ...valid, ...change }]).decision.status, 'no-qualified-recommendation', JSON.stringify(change));
  }
  assert.equal(select(candidate(), []).decision.selected, null);
});

test('invalid distributions and bookmaker-implied sources cannot provide forecast probability', () => {
  for (const probabilities of [{ 'home-win': NaN, draw: .2, 'away-win': .1 }, { 'home-win': .8, draw: .8, 'away-win': .1 }]) {
    assert.equal(select(candidate('api-football', probabilities), [quote('match-result', 'home-win', '9.9')]).decision.selected, null);
  }
  const implied = candidate('bookmaker-implied');
  assert.equal(select(implied, [quote('match-result', 'home-win', '9.9')]).decision.selected, null);
});

test('evidence rejection excludes an otherwise qualified priced selection', () => {
  const result = select(candidate(), [quote('match-result', 'home-win', '1.9')], () => ({ eligible: false,
    reasons: ['verified-important-scorer-absence'] }));
  assert.equal(result.decision.selected, null);
  assert.ok(result.decision.decisions[0].reasons.includes('verified-important-scorer-absence'));
});

test('usable AI supersedes conflicting stronger-priced baseline; unusable AI selects retained baseline', () => {
  const ai = candidate('ai', { 'home-win': .1, draw: .2, 'away-win': .7 }), baseline = candidate();
  const quotes = [quote('match-result', 'home-win', '2.9'), quote('match-result', 'away-win', '1.9')];
  const selected = select(ai, quotes, assessor, { baseline });
  assert.equal(selected.decision.selected.source, 'ai');
  assert.equal(selected.decision.selected.selection, 'away-win');
  const fallback = select(ai, [quotes[0]], assessor, { baseline });
  assert.equal(fallback.decision.selected.source, 'api-football');
  assert.equal(fallback.candidate.markets['match-result'].market.source, 'api-football');
  assert.equal(fallback.decision.fallbackReason, 'ai-no-qualified-recommendation');
});

test('published decisions are frozen and independent of later price changes', () => {
  const quotes = [quote('match-result', 'home-win', '1.9')], result = select(candidate(), quotes);
  assert.equal(Object.isFrozen(result.decision.selected.quote), true);
  assert.throws(() => { result.decision.selected.quote.decimal = '8'; }, TypeError);
  quotes[0] = { ...quotes[0], decimal: '8' };
  assert.equal(result.decision.selected.quote.decimal, '1.9');
});

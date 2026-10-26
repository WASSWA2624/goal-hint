import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createPredictionRefreshService } from '../src/server/refresh/refresh-service.ts';
import { createFallbackService } from '../src/server/fallback/fallback-service.ts';
import { createLiveAuthorities } from '../src/server/live/live-authorities.ts';
import { liveAiModel } from '../src/server/live/live-ai-model.ts';
import { liveAiEvidencePolicy, liveAiRefreshPlan } from '../src/server/live/live-ai-plan.ts';
import { fallbackRefreshPlan, liveReferences, liveWorkload, providerFallbackPolicy, refreshEnvelopeFor, selectionPolicy } from '../src/server/live/live-plan.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { recommendationQuotesFromSnapshots } from '../src/server/odds/recommendation-quotes.ts';
import { oddsValuesHash } from '../src/server/odds/odds-mysql-store.ts';
import { parsePublishRevision } from '../src/server/predictions/publication-input.ts';
import { validatePublishedRecommendation } from '../src/server/predictions/recommendation-publication.ts';
import { evidenceAuthority, evidenceContext, evidenceHash } from './helpers/evidence-fixtures.mjs';
import { fallbackFixture } from './helpers/fallback-fixtures.mjs';
import { fallbackAdapterSetup, fallbackCanonical, fallbackRawPrediction, fallbackResponse } from './helpers/fallback-adapter-fixtures.mjs';
import { oddsPolicy } from './helpers/odds-fixtures.mjs';
import { recommendationFootballSources } from './helpers/recommendation-evidence-fixtures.mjs';

const NOW = Date.parse('2026-10-13T08:00:00Z'), DAY = 86400000;
const environment = { NODE_ENV: 'production', GOAL_HINT_OPERATION_SCOPE: 'production', GOAL_HINT_FOOTBALL_ENABLED: 'true',
  API_FOOTBALL_KEY: 'synthetic-only', API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: '0',
  GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: 'synthetic-private', GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: 'synthetic-public',
  GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF: 'synthetic-account', GOAL_HINT_BUDGET_APPROVAL_REF: 'synthetic-budget',
  GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: '0', GOAL_HINT_COMPETITION_IDS: '39',
  GOAL_HINT_EVIDENCE_POLICY_REF: 'synthetic-evidence', GOAL_HINT_FRESHNESS_POLICY_REF: 'synthetic-freshness',
  GOAL_HINT_PIPELINE_INTEGRITY_REF: 'synthetic-integrity', GOAL_HINT_QUALITY_QUALIFICATION_REF: 'synthetic-quality',
  GOAL_HINT_RELEASE_APPROVAL_REF: 'synthetic-release', GOAL_HINT_DATABASE_ACCESS_REF: 'synthetic-database',
  GOAL_HINT_AI_PROVIDER: 'openai', GOAL_HINT_AI_MODEL: 'gpt-6.1-sol', GOAL_HINT_CALIBRATION_REF: 'synthetic-calibration',
  GOAL_HINT_AI_BILLING_MODE: 'usage-based', GOAL_HINT_JOB_REQUEST_LIMIT: '4', GOAL_HINT_JOB_TOKEN_LIMIT: '100000',
  GOAL_HINT_JOB_TIMEOUT_SECONDS: '600' };

function quoteEvidence(context) {
  const retrievedAt = context.cutoffAt - 1000, bookmakerId = 8;
  const bets = [{ betId: 1, betName: 'Match Winner', values: [{ label: 'Home', odd: '2.00' }, { label: 'Draw', odd: '3.40' }, { label: 'Away', odd: '4.20' }] },
    { betId: 12, betName: 'Double Chance', values: [{ label: 'Home/Draw', odd: '1.20' }, { label: 'Draw/Away', odd: '1.20' }, { label: 'Home/Away', odd: '1.90' }] }];
  const snapshots = bets.map((bet) => {
    const identity = { fixtureId: context.fixtureId, previousId: null, bookmakerId, bookmakerName: 'Synthetic book',
      betId: bet.betId, betName: bet.betName, valuesHash: oddsValuesHash(bet.values) };
    return { ...identity, id: evidenceFingerprint(identity), retrievedAt, providerUpdatedAt: null, retainUntil: context.kickoffAt + DAY, values: bet.values };
  });
  const batch = { id: evidenceHash('refresh-source-odds'), accountId: evidenceHash('refresh-quota'), kind: 'prices', scopeKey: 'synthetic-prices',
    policyHash: evidenceHash('refresh-odds-policy'), status: 'complete', requestsDispatched: 1, receivedAt: retrievedAt,
    requestId: evidenceHash('refresh-odds-request'), slot: retrievedAt, date: null, contractVersion: 'synthetic-odds-v1', reasons: [], missingCoverage: [],
    pages: [{ provider: 'api-football', endpoint: 'odds', requestParameters: {}, contractVersion: 'synthetic-odds-v1', retrievedAt,
      providerUpdatedAt: null, fromCache: false, currentPage: 1, totalPages: 1 }],
    fixtures: [{ externalId: context.externalFixtureId, outcome: 'apply', observationHash: evidenceHash('refresh-odds-observation'),
      quoteManifest: { bookmakerId, kickoffAt: context.kickoffAt, bets: snapshots.map(({ betId, betName, valuesHash }) => ({ betId, betName, valuesHash })) } }], catalog: [] };
  return { batch, snapshots, catalog: new Map(bets.map((bet) => [bet.betId, bet.betName])) };
}

/** Actual refresh orchestration, fallback, archive validators and production publication authority.
 * Only durable storage, provider transports and the atomic commit boundary are injected in this test. */
function harness({ ai = 'off', interrupt = false, denyFallback = false } = {}) {
  let current = NOW, intent = null, outcome = null, accepted = null, originalAi = null, odds = null, pendingInterruption = interrupt;
  const policy = parseRuntimePolicy({ ...environment, GOAL_HINT_AI_ENABLED: ai === 'off' ? 'false' : 'true',
    ...(ai === 'off' ? {} : { AI_API_KEY: 'synthetic-only' }) });
  const refs = liveReferences(policy), model = liveAiModel(policy), stages = new Map(), published = [], calls = { preparation: 0, evidence: 0, ai: 0, fallback: 0, quotes: 0 };
  const jobId = evidenceHash(`recommendation-refresh:${ai}`), identity = { fixtureId: randomUUID(), runId: randomUUID(), cycleId: randomUUID() };
  const contextAt = () => evidenceContext(undefined, { ...identity, analysisAt: current, cutoffAt: current, kickoffAt: NOW + DAY });
  const payload = { input: {}, ...identity, runDate: '2026-10-13', rank: 0 };
  const envelope = { ...refreshEnvelopeFor('standard', ai !== 'off'), payload, refresh: identity, expiresAt: NOW + DAY };
  const member = () => ({ jobId, context: contextAt(), now: current, entry: { envelope },
    cycle: { id: identity.cycleId, fixtureId: identity.fixtureId, scheduleVersion: 1, cutoffAt: NOW + DAY - 300000 } });
  const lease = { jobId, attemptId: evidenceHash('refresh-attempt'), job: { envelope } };
  const workflow = { lease, signal: new AbortController().signal, deadlineAt: NOW + 300000, remainingMs: () => 300000 - (current - NOW),
    async checkpoint() {}, async recordUsage() {} };
  const live = createLiveAuthorities({ policy, refs, verify: () => true, clock: { now: () => current },
    selection: selectionPolicy(policy, refs, liveWorkload(150000, 12, 'Mega', 900)), refreshPacing: 'standard',
    resultPolicy: () => null, statusEvidenceRef: `${refs.freshness}#status`, aiModel: model,
    oddsPolicy: oddsPolicy({ retentionEvidenceRef: refs.retention }), sourceOrder: 'ai-first',
    verifyPrimary: (result) => result === originalAi,
    verifyPrimaryCandidate: (candidate) => originalAi !== null && Object.values(candidate.markets).every((item) => !item.available || item.market.source !== 'ai' ||
      evidenceFingerprint(item.market) === evidenceFingerprint(originalAi.output.markets.markets[item.market.family].market)) });
  const store = { async publication() { return accepted; }, async outcome() { return outcome; }, async loadMember() { return member(); },
    async intent() { return intent; }, async saveIntent(_lease, value) { intent = value; return value; },
    async stage(_job, phase, kind) { return stages.get(`${phase}:${kind}`) ?? null; },
    async start(_lease, phase) { if (stages.has(`${phase}:started`)) return false; stages.set(`${phase}:started`, { at: current }); return true; },
    async complete(_lease, phase, value) { stages.set(`${phase}:completed`, { jobId, phase, kind: 'completed', at: current, value }); },
    async finish(_lease, value) { outcome = value; } };
  const fallback = createFallbackService({ clock: { now: () => current }, maxInflight: 1, verifyRequest: () => true,
    selectionPolicy: 'optional-ai-primary', authority: live.fallback,
    fallback: { async collect(input, workflow) { calls.fallback++; current += 1000;
      const raw = fallbackRawPrediction(input.context);
      raw.predictions.percent = { home: '50%', draw: '30%', away: '20%' };
      const provider = fallbackAdapterSetup({ context: input.context, policy: providerFallbackPolicy(refs),
        fixture: fallbackCanonical(input.context, { retrievedAt: current }), authority: live.providerFallback,
        respond: (url) => fallbackResponse(url, [raw]) });
      provider.setNow(current);
      return provider.fallback.collect(input, workflow);
    } } });
  const sealed = (body, extra = {}) => [{ body: evidenceSerialize(body), validIntegrity: true, ...extra }];
  const tx = { async $queryRaw(strings, ...parameters) {
    const sql = strings.join('');
    if (sql.includes('PredictionRefreshStage')) return sealed(stages.get('fallback:completed'));
    if (sql.includes('PredictionRefreshIntent')) return sealed(intent);
    if (sql.includes('ProviderOddsSnapshot')) return sealed(odds.snapshots.find((snapshot) => snapshot.id === parameters[0]), { batchId: odds.batch.id });
    if (sql.includes("scopeKey='bets'")) return sealed({ ...odds.batch, kind: 'bets', scopeKey: 'bets', fixtures: [],
      catalog: [...odds.catalog].map(([id, name]) => ({ id, name })) });
    if (sql.includes('OddsImportBatch')) return sealed(odds.batch);
    throw new Error(`Unexpected SQL ${sql}`);
  } };
  const service = createPredictionRefreshService({ type: 'prediction.daily-refresh', handlerVersion: 1, clock: { now: () => current },
    store, selection: {}, authority: live.refresh, prepare: async () => { calls.preparation++; current += 1000; },
    configure: (loaded) => {
      const sources = recommendationFootballSources(loaded.context);
      if (ai !== 'off') return liveAiRefreshPlan(loaded, refs, policy, model, sources);
      const base = fallbackRefreshPlan(loaded, refs);
      return { ...base, evidence: { ...base.evidence, policy: liveAiEvidencePolicy(refs), cachedSources: sources } };
    },
    models: { async resolve(pin) { return { pin, model }; } },
    evidence: { async collect(request) { calls.evidence++; current += 1000;
      return { status: 'collected', snapshot: buildEvidenceSnapshot({ context: request.context, policy: request.policy,
        sources: request.cachedSources }, evidenceAuthority()), requestsDispatched: 0, requestCountUnknown: false,
      usage: { football: { requests: 0, uncertain: false }, research: { requests: 0, uncertain: false } }, collectionIssues: [] };
    } },
    predictor: { async predict(input) { calls.ai++; current += 1000;
      const groups = { 'match-result': { period: 'regulation-including-stoppage-time', probabilities: ai === 'unpriced'
        ? { 'home-win': .2, draw: .4, 'away-win': .4 } : { 'home-win': .7, draw: .2, 'away-win': .1 } }, 'total-goals': null, 'both-teams-to-score': null };
      const fixture = fallbackFixture({ snapshot: input.snapshot, model, jobId, output: { groups } });
      originalAi = { ...fixture.ai, pin: input.pin }; return originalAi;
    } }, fallback: denyFallback ? { ...fallback, async resolve() {
      return { status: 'denied', reason: 'timeout', requestsDispatched: 1, requestCountUnknown: true };
    } } : fallback,
    recommendations: { async quotes(context) { calls.quotes++; odds = quoteEvidence(context);
      return recommendationQuotesFromSnapshots({ ...odds, context, bookmakerId: 8, freshnessMs: 10800000, permitted: true })
        .filter((quote) => quote.selection !== 'away-or-draw');
    } },
    observation: { async collect() { return { input: {}, requestsDispatched: 1, requestCountUnknown: false }; } },
    lifecycle: { async observe() { return { observation: { kickoffAt: NOW + DAY, retrievedAt: current, providerUpdatedAt: null,
      externalFixtureId: 101, status: 'scheduled', actualStartedAt: null, evidenceRef: `${refs.freshness}#status` } }; },
    async refreshEligibility() { return { eligible: true }; } },
    publisher: { async publish(raw) {
      const input = parsePublishRevision(raw);
      live.publication.authorize(input);
      assert.equal(live.publication.verifyCandidate(input, current), true);
      assert.equal(live.publication.verifyRecommendation(input, current), true);
      assert.equal(await validatePublishedRecommendation(tx, input, current), true);
      if (pendingInterruption) { pendingInterruption = false; throw new Error('Synthetic interruption before commit.'); }
      published.push(input);
      accepted = { revision: { id: randomUUID(), candidate: input.candidate }, refresh: { outcome: 'published', reason: 'accepted',
        revisionId: randomUUID(), id: evidenceHash('publication-result') } };
      accepted.refresh.revisionId = accepted.revision.id;
      return accepted;
    } }, costs: { ai: null, research: null } });
  return { run: () => service.definition.handle(payload, workflow), calls, stages, published, get outcome() { return outcome; }, get intent() { return intent; } };
}

test('AI disabled and no key still publishes an enriched priced baseline through the actual refresh worker', async () => {
  const h = harness(); assert.equal((await h.run()).status, 'succeeded');
  assert.equal(h.outcome.outcome, 'published'); assert.equal(h.calls.ai, 0); assert.equal(h.calls.fallback, 1);
  const input = h.published[0], decision = input.candidate.audit.recommendation;
  assert.ok(decision.selected, JSON.stringify(decision.decisions));
  assert.equal(decision.selected.source, 'api-football'); assert.equal(decision.selected.selection, 'home-or-away');
  assert.equal(decision.selected.quote.decimal, '1.9'); assert.equal(decision.evidenceSnapshotId, input.evidenceSnapshotId);
  assert.ok(decision.decisions.some((entry) => entry.eligible && entry.evidence.cohorts?.every((cohort) => cohort.sampleSize === 3)));
});

test('unpriced AI falls back and usable AI wins through production resolution and publication authority', async () => {
  const fallback = harness({ ai: 'unpriced' }); await fallback.run();
  assert.equal(fallback.published[0].candidate.audit.recommendation.selected.source, 'api-football');
  const primary = harness({ ai: 'usable' }); await primary.run();
  const decision = primary.published[0].candidate.audit.recommendation;
  assert.equal(decision.selected.source, 'ai'); assert.equal(decision.selected.selection, 'home-win');
  assert.equal(primary.calls.fallback, 1, 'the independently retained baseline was computed');
  assert.equal(primary.calls.ai, 1);
});

test('restart reuses sealed decisions and accepted replay makes no extra evidence, AI, provider or quote calls', async () => {
  const h = harness({ ai: 'usable', interrupt: true });
  await assert.rejects(h.run(), /Synthetic interruption/u);
  const original = h.stages.get('fallback:completed').value.candidate.audit.recommendation;
  const before = { ...h.calls };
  assert.equal((await h.run()).status, 'succeeded'); assert.deepEqual(h.calls, before);
  assert.deepEqual(h.published[0].candidate.audit.recommendation, original);
  const revisionId = h.outcome.revisionId;
  await h.run(); assert.deepEqual(h.calls, before); assert.equal(h.outcome.revisionId, revisionId);
});

test('a denied fallback phase seals authenticated AI recovery before publication and preserves usage', async () => {
  const h = harness({ ai: 'usable', denyFallback: true });
  assert.equal((await h.run()).status, 'succeeded');
  const sealed = h.stages.get('fallback:completed').value;
  assert.equal(sealed.requestsDispatched, 1); assert.equal(sealed.requestCountUnknown, true);
  assert.equal(sealed.candidate.audit.recommendation.selected.source, 'ai');
  assert.deepEqual(h.published[0].candidate, sealed.candidate);
  assert.equal(h.calls.fallback, 0, 'recovery makes no second provider attempt');
});

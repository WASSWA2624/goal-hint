import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { liveAiAccountId, liveAiModel, liveAiRate, liveSourceOrder } from '../src/server/live/live-ai-model.ts';
import { goalResultMarket } from '../src/domain/goal-market-definitions.ts';
import { liveAiAllocation, liveAiEvidencePolicy, liveAiRefreshPlan } from '../src/server/live/live-ai-plan.ts';
import { createLiveFootballPreparation, readLiveFootballSources, verifyLiveFootballSource } from '../src/server/live/live-ai-evidence.ts';
import { groundLiveAiExplanations } from '../src/server/live/live-ai.ts';
import { createLiveAuthorities } from '../src/server/live/live-authorities.ts';
import { liveReadiness } from '../src/server/live/live-runtime.ts';
import { missingOwnerApprovals, parseOwnerApprovals } from '../src/server/live/live-approvals.ts';
import { liveReferences, liveWorkload, selectionPolicy, fallbackRefreshPlan, refreshEnvelopeFor } from '../src/server/live/live-plan.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { buildPredictorPrompt } from '../src/server/predictor/predictor-prompt.ts';
import { parseRefreshPlan, refreshReference } from '../src/server/refresh/refresh-input.ts';
import { createPredictionRefreshService } from '../src/server/refresh/refresh-service.ts';
import { ModelRegistryError } from '../src/server/predictor/predictor-registry.ts';
import { createFallbackService } from '../src/server/fallback/fallback-service.ts';
import { parseForecastSourceReceipts } from '../src/server/fallback/source-receipts.ts';
import { evidenceContext, evidenceAuthority } from './helpers/evidence-fixtures.mjs';
import { predictorRawOutput } from './helpers/predictor-output-fixtures.mjs';
import { createPolicyCostService } from '../src/server/cost-control/cost-policy.ts';
import { costPeriod, syntheticCostAuthority } from './helpers/cost-fixtures.mjs';
import { memoryCostStore } from './helpers/cost-memory-store.mjs';
import { fallbackFixture } from './helpers/fallback-fixtures.mjs';
import { resolveFallbackCandidate } from '../src/server/fallback/fallback-resolution.ts';

// Synthetic config, providers, clocks and in-memory stores only. No credentials or database are read.
const NOW = Date.parse('2026-10-13T08:00:00Z'), DAY = 86_400_000;
const env = { NODE_ENV: 'production', GOAL_HINT_OPERATION_SCOPE: 'production', GOAL_HINT_FOOTBALL_ENABLED: 'true',
  API_FOOTBALL_KEY: 'synthetic-football', API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: '0',
  GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: 'synthetic-private', GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: 'synthetic-public',
  GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF: 'synthetic-account', GOAL_HINT_BUDGET_APPROVAL_REF: 'synthetic-budget',
  GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: '0', GOAL_HINT_COMPETITION_IDS: '39',
  GOAL_HINT_EVIDENCE_POLICY_REF: 'synthetic-evidence', GOAL_HINT_FRESHNESS_POLICY_REF: 'synthetic-freshness',
  GOAL_HINT_PIPELINE_INTEGRITY_REF: 'synthetic-integrity', GOAL_HINT_QUALITY_QUALIFICATION_REF: 'synthetic-quality',
  GOAL_HINT_RELEASE_APPROVAL_REF: 'synthetic-release', GOAL_HINT_AI_ENABLED: 'true', AI_API_KEY: 'synthetic-openai',
  GOAL_HINT_DATABASE_ACCESS_REF: 'synthetic-database-access',
  GOAL_HINT_AI_PROVIDER: 'openai', GOAL_HINT_AI_MODEL: 'gpt-6.1-sol', GOAL_HINT_CALIBRATION_REF: 'synthetic-calibration',
  GOAL_HINT_AI_BILLING_MODE: 'usage-based', GOAL_HINT_JOB_REQUEST_LIMIT: '4', GOAL_HINT_JOB_TOKEN_LIMIT: '100000',
  GOAL_HINT_JOB_TIMEOUT_SECONDS: '600' };
const policy = parseRuntimePolicy(env), refs = liveReferences(policy), model = liveAiModel(policy);
function member(at = NOW) {
  const context = evidenceContext(undefined, { analysisAt: at, cutoffAt: at, kickoffAt: NOW + DAY,
    cycleId: '10000000-0000-4000-8000-000000000004', runId: '10000000-0000-4000-8000-000000000005' });
  return { jobId: 'a'.repeat(64), context, now: at, cycle: { cutoffAt: NOW + DAY - 300000, scheduleVersion: 1n },
    entry: { envelope: { ...refreshEnvelopeFor('standard'), expiresAt: NOW + DAY } } };
}
function databaseFixture(context, count = 5) {
  const queries = [], retrieval = NOW - 1000;
  const rows = team => Array.from({ length: count }, (_, i) => ({ id: `${team.teamId}-${i}`, externalId: BigInt(1000 + team.externalId * 10 + i),
    dataVersion: 1n, homeTeamId: team.teamId, awayTeamId: '10000000-0000-4000-8000-000000000099',
    kickoff: new Date(NOW - (i + 1) * DAY), regulationHome: i % 3, regulationAway: 1,
    regulationVerifiedAt: new Date(retrieval), regulationEvidenceRef: 'synthetic-regulation-proof',
    retrievedAt: new Date(retrieval), providerUpdatedAt: null,
    homeTeam: { providers: [{ externalId: BigInt(team.externalId) }] }, awayTeam: { providers: [{ externalId: 99n }] } }));
  const fixture = { dataVersion: context.fixtureVersion, homeTeamId: context.home.teamId, awayTeamId: context.away.teamId,
    kickoff: new Date(context.kickoffAt), retrievedAt: new Date(retrieval), providerUpdatedAt: null };
  return { queries, rows, fixture, database: { async query(fn) { return fn({ footballFixture: {
    async findMany(query) { queries.push(query); return rows(query.where.OR[0].homeTeamId === context.home.teamId ? context.home : context.away); },
    async findUnique() { return fixture; } } }); } } };
}
function authorities() { return createLiveAuthorities({ policy, verify: () => true, refs,
  selection: selectionPolicy(policy, refs, liveWorkload(150000, 12, 'Mega', 900)),
  resultPolicy: () => null, statusEvidenceRef: `${refs.freshness}#status`, refreshPacing: 'standard', aiModel: model }); }

test('live publication keeps authentic AI in shadow even when the primary ownership proof succeeds', () => {
  const fixture = fallbackFixture(), candidate = resolveFallbackCandidate({ expected: fixture.expected, ai: fixture.ai,
    provider: null, now: fixture.now }, fixture.authority).candidate;
  const live = createLiveAuthorities({ policy, verify: () => true, refs,
    selection: selectionPolicy(policy, refs, liveWorkload(150000, 12, 'Mega', 900)),
    resultPolicy: () => null, statusEvidenceRef: `${refs.freshness}#status`, refreshPacing: 'standard',
    aiModel: fixture.model, verifyPrimary: () => true });
  assert.equal(live.fallback.verifyAi(fixture.ai, fixture.expected, fixture.now), true);
  assert.equal(live.publication.verifyCandidate({ candidate }), false,
    'transport/evidence ownership is not measured model-promotion authority');
});

test('AI startup readiness requires exact transmission and calibration approvals; disabled AI needs no key', () => {
  const requirements = ['budget-approval', 'football-account', 'football-private-use', 'football-public-rights', 'evidence-policy',
    'freshness-policy', 'pipeline-integrity', 'quality-qualification', 'release-approval', 'database-access'];
  const references = ['synthetic-budget', 'synthetic-account', 'synthetic-private', 'synthetic-public', 'synthetic-evidence',
    'synthetic-freshness', 'synthetic-integrity', 'synthetic-quality', 'synthetic-release', 'synthetic-database-access'];
  const approvals = extra => parseOwnerApprovals({ version: 1, owner: 'Synthetic owner', approvals: [...requirements.map((requirement, i) =>
    ({ requirement, reference: references[i], approvedAt: '2026-10-13', decision: 'Synthetic explicit approval.' })), ...extra] });
  const base = approvals([]), off = parseRuntimePolicy({ ...env, GOAL_HINT_AI_ENABLED: 'false', AI_API_KEY: undefined });
  assert.equal(typeof liveReadiness(off, base), 'function');
  assert.throws(() => liveReadiness(policy, base), error => error.issues.some(issue => issue.includes('#openai-transmission')) &&
    error.issues.some(issue => issue.includes('CALIBRATION')));
  const complete = approvals([{ requirement: 'calibration-configuration', reference: 'synthetic-calibration', approvedAt: '2026-10-13', decision: 'Provisional.' },
    { requirement: 'evidence-policy', reference: 'synthetic-evidence#openai-transmission', approvedAt: '2026-10-13', decision: 'Structured transmission.' }]);
  assert.equal(typeof liveReadiness(policy, complete), 'function');
  assert.equal(missingOwnerApprovals(off, () => true).length, 0);
});

test('AI plans preserve exact pinned cost limits and the full fallback reserve', () => {
  const value = member(), plan = parseRefreshPlan(liveAiRefreshPlan(value, refs, policy, model, []), value);
  assert.equal(plan.modelVersionId, model.id); assert.equal(plan.ai.request.maximum.requests, 1);
  assert.equal(plan.ai.job.fallbackReserveMs, value.entry.envelope.fallbackReserveMs);
  assert.equal(plan.ai.request.attemptId, refreshReference(value.jobId, 'ai'));
  assert.equal(plan.evidence.policy.minimum.historyPerTeam, 3);
  assert.equal(plan.evidence.footballPlan, null); assert.equal(plan.evidence.researchPlan, null);
  assert.equal(authorities().refresh.verifyPlan(plan, value), true);
  assert.equal(authorities().refresh.verifyPlan({ ...plan, ai: { ...plan.ai, maxElapsedMs: 1 } }, value), false);
  assert.throws(() => liveAiAllocation(parseRuntimePolicy({ ...env, GOAL_HINT_JOB_TOKEN_LIMIT: '1000' }), model, NOW, 60000));
});

test('delayed jobs reduce primary time to the real cutoff and keep a usable fallback path', () => {
  for (const remaining of [300000, 180000, 150000, 120000, 71000, 70000]) {
    const original = member(), value = { ...original, cycle: { ...original.cycle, cutoffAt: NOW + remaining },
      entry: { envelope: { ...refreshEnvelopeFor('standard', true), expiresAt: NOW + DAY } } };
    const plan = parseRefreshPlan(liveAiRefreshPlan(value, refs, policy, model, []), value);
    assert.equal(authorities().refresh.verifyPlan(plan, value), true);
    if (remaining === 70000) {
      assert.equal(plan.ai, null);
      assert.deepEqual(plan, fallbackRefreshPlan(value, refs));
    } else {
      assert.equal(plan.ai.job.fallbackReserveMs, 60000);
      assert.equal(plan.ai.job.timeLimitMs, 180000, 'the immutable category allocation remains exact');
      assert.equal(plan.ai.request.timeoutMs, Math.min(180000, remaining) - 70000);
      assert.ok(plan.evidence.maxElapsedMs + plan.ai.maxElapsedMs + plan.ai.job.fallbackReserveMs <= remaining);
    }
  }
  const original = member(), closed = { ...original, cycle: { ...original.cycle, cutoffAt: NOW + 69999 } };
  assert.throws(() => liveAiRefreshPlan(closed, refs, policy, model, []), error => error.reason === 'ineligible');
});

test('a delayed primary request remains authorized by the real bounded cost policy', async () => {
  const original = member(), value = { ...original, cycle: { ...original.cycle, cutoffAt: NOW + 150000 },
    entry: { envelope: { ...refreshEnvelopeFor('standard', true), expiresAt: NOW + DAY } } };
  const plan = parseRefreshPlan(liveAiRefreshPlan(value, refs, policy, model, []), value);
  const allocation = liveAiAllocation(policy, model, NOW, 60000), accountId = liveAiAccountId(policy);
  const service = createPolicyCostService({ accountId, category: 'ai', store: memoryCostStore({ value: NOW }),
    authority: syntheticCostAuthority(), runtimePolicy: policy, verifyEvidence: () => true,
    allocation, verifyAllocation: () => true, rateFor: () => liveAiRate(model, NOW) });
  assert.equal((await service.initialize(costPeriod('delayed-live', 'ai', { accountId, billingMode: 'usage-based',
    capUsdPicos: 0n, startsAt: NOW - 1000, endsAt: NOW + DAY,
    evidenceRef: policy.choices.budgets.approvalRef }))).status, 'initialized');
  const decision = await service.reserve(plan.ai.job, plan.ai.request);
  assert.equal(decision.status, 'reserved');
  assert.equal((await service.markDispatched(decision.permit)).status, 'claimed');
});

test('prepared 300-second configuration leaves 100 seconds primary and 200 seconds fallback on slow plans', () => {
  const prepared = parseRuntimePolicy({ ...env, GOAL_HINT_JOB_REQUEST_LIMIT: '2', GOAL_HINT_JOB_TIMEOUT_SECONDS: '300' });
  const value = member(); value.entry.envelope = { ...refreshEnvelopeFor('slow', true), expiresAt: NOW + DAY };
  const allocation = liveAiAllocation(prepared, model, NOW, 200000);
  assert.equal(allocation.ai.primaryTimeLimitMs, 100000);
  assert.equal(allocation.ai.inputTokenLimit, 70000); assert.equal(allocation.ai.outputTokenLimit, 8192);
  const plan = parseRefreshPlan(liveAiRefreshPlan(value, refs, prepared, model, [], 'slow'), value);
  assert.equal(plan.ai.job.timeLimitMs, 300000); assert.equal(plan.ai.job.fallbackReserveMs, 200000);
  assert.equal(plan.ai.maxElapsedMs, 90000); assert.equal(plan.evidence.maxElapsedMs, 10000);
});

test('stored primary inputs use verified regulation history and original clocks; missing reports remain unknown', async () => {
  const context = member().context, h = databaseFixture(context), sources = await readLiveFootballSources(h.database, context, liveAiEvidencePolicy(refs), refs);
  assert.equal(sources.length, 13); assert.ok(sources.every(source => verifyLiveFootballSource(source, context, refs)));
  assert.ok(sources.every(source => source.retrievedAt === NOW - 1000));
  assert.ok(sources.flatMap(source => source.claims).every(claim => !['news', 'injury', 'lineup', 'statistic'].includes(claim.kind)));
  assert.equal(h.queries.length, 2); assert.deepEqual(h.queries[0].where.status.in, ['finished-regulation', 'finished-extra-time', 'finished-penalties']);
  assert.ok(h.queries[0].where.regulationEvidenceRef.not === null);
  const snapshot = buildEvidenceSnapshot({ context, policy: liveAiEvidencePolicy(refs), sources }, authorities().evidence);
  assert.equal(snapshot.coverage.sufficient, true); assert.ok(snapshot.missingness.some(item => item.kind === 'injury'));
  const prompt = buildPredictorPrompt({ snapshot, model, authority: { evidence: authorities().evidence, verifyModel: () => true, verifyTransmission: () => true } });
  assert.ok(prompt.bytes < model.bounds.maxInputBytes);
  // Verify the safe token reservation can accommodate the real bounded prompt and response schema.
  const envelopeBytes = Buffer.byteLength(JSON.stringify({ instructions: prompt.instructions, input: prompt.inputJson, schema: prompt.schema }));
  assert.ok(liveAiAllocation(policy, model, NOW, 60000).ai.inputTokenLimit >= envelopeBytes + 1500,
    `bounded real input needs ${envelopeBytes + 1500} conservative tokens`);
});

test('canonical source authority rejects forged teams, scores, unsupported predictions and invented summaries', async () => {
  const context = member().context, h = databaseFixture(context), sources = await readLiveFootballSources(h.database, context, liveAiEvidencePolicy(refs), refs), source = sources[0];
  for (const change of [ { binding: { ...source.binding, homeExternalId: 999 } }, { retrievedAt: context.cutoffAt + 1 },
    { claims: [{ ...source.claims[0], value: { ...source.claims[0].value, homeGoals: 100 } }] },
    { claims: [{ ...source.claims[0], kind: 'statistic' }] }, { claims: [{ ...source.claims[0], summary: 'Invented fitness claim.' }] },
    { claims: [{ ...source.claims[0], value: { ...source.claims[0].value, prediction: 0.9 } }] } ])
    assert.equal(verifyLiveFootballSource({ ...source, ...change }, context, refs), false);
});

test('unavailable history gives insufficient evidence, never assumed perfect fitness', async () => {
  const context = member().context, h = databaseFixture(context, 0), sources = await readLiveFootballSources(h.database, context, liveAiEvidencePolicy(refs), refs);
  const snapshot = buildEvidenceSnapshot({ context, policy: liveAiEvidencePolicy(refs), sources }, authorities().evidence);
  assert.equal(snapshot.coverage.sufficient, false); assert.equal(sources.length, 1);
  assert.ok(snapshot.missingness.some(item => item.kind === 'history'));
});

test('bounded preparation accounts both history calls and does not consume fallback time', async () => {
  const value = member(), calls = [], usages = [], context = { deadlineAt: NOW + 120000, remainingMs: () => 120000,
    async checkpoint() {}, async recordUsage(usage) { usages.push(usage); } };
  const prepare = createLiveFootballPreparation({ refs, pacing: 'standard', importer: { async import(request) {
    calls.push(request); if (calls.length === 2) throw new Error('synthetic outage'); return { requestsDispatched: 1 }; } } });
  await prepare(value, context);
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.bounds.maxRequests === 1 && call.bounds.deadlineAt === NOW + 60000));
  assert.deepEqual(usages.map(usage => [usage.phase, usage.requests]), [['completed', 1], ['uncertain', 1]]);
  await prepare(value, { ...context, remainingMs: () => 60000 }); assert.equal(calls.length, 2);
});

test('grounding uses exact cited facts and preserves invalid references for validator rejection', async () => {
  const context = member().context, h = databaseFixture(context), sources = await readLiveFootballSources(h.database, context, liveAiEvidencePolicy(refs), refs);
  const snapshot = buildEvidenceSnapshot({ context, policy: liveAiEvidencePolicy(refs), sources }, authorities().evidence), raw = predictorRawOutput(snapshot, model);
  const grounded = groundLiveAiExplanations(raw, snapshot), fact = snapshot.facts[0];
  assert.equal(grounded.reasons[0].text, fact.values[0].summary); assert.deepEqual(grounded.groups, raw.groups);
  assert.match(grounded.uncertainty.text, /do not establish squad fitness/);
  const forged = structuredClone(raw); forged.reasons[0].references[0].claimId = 'f'.repeat(64);
  assert.equal(groundLiveAiExplanations(forged, snapshot).reasons[0].text, forged.reasons[0].text);
  assert.deepEqual(groundLiveAiExplanations({ reasons: [{ text: 'Bad', references: [null] }] }, snapshot), { reasons: [{ text: 'Bad', references: [null] }] });
});

function refreshHarness(options = {}) {
  let current = NOW, intent = null, outcome = null, prepared = 0, modelCalls = 0, aiCalls = 0, fallbackCalls = 0;
  const stages = new Map(), publications = [], evidenceRequests = [], value = member(), identity = { runId: value.context.runId, fixtureId: value.context.fixtureId, cycleId: value.context.cycleId };
  const payload = { input: {}, ...identity, runDate: '2026-10-13', rank: 0 }, envelope = { ...value.entry.envelope, payload, refresh: identity };
  const lease = { jobId: value.jobId, attemptId: 'b'.repeat(64), job: { envelope } };
  const context = { lease, signal: new AbortController().signal, deadlineAt: NOW + 120000, remainingMs: () => 120000 - (current - NOW), async checkpoint() {}, async recordUsage() {} };
  const store = { async publication() { return null; }, async outcome() { return outcome; }, async loadMember() { return member(current); },
    async intent() { return intent; }, async saveIntent(_lease, saved) { intent = saved; return saved; },
    async stage(_id, name, kind) { return stages.get(`${name}:${kind}`) ?? null; },
    async start(_lease, name) { if (stages.has(`${name}:started`)) return false; stages.set(`${name}:started`, { at: current }); return true; },
    async complete(_lease, name, result) { stages.set(`${name}:completed`, { at: current, value: result }); },
    async finish(_lease, result) { outcome = result; } };
  const fallback = createFallbackService({ clock: { now: () => current }, maxInflight: 1, verifyRequest: () => true,
    selectionPolicy: 'legacy-ai-primary',
    authority: { authorize() {}, verifyContext: () => true, verifyAi: () => true, verifyProvider: () => true },
    fallback: { async collect() { fallbackCalls++; return { status: 'denied', reason: 'provider-unavailable', requestsDispatched: 1, requestCountUnknown: false }; } } });
  const service = createPredictionRefreshService({ type: 'prediction.daily-refresh', handlerVersion: 1, clock: { now: () => current },
    store, selection: {}, authority: { authorize() {}, verifyPlan: () => true }, configure: loaded => options.ai ? liveAiRefreshPlan(loaded, refs, policy, model, []) : fallbackRefreshPlan(loaded, refs),
    prepare: async () => { prepared++; current += 1000; },
    models: { async resolve(pin) { modelCalls++; if (options.modelError) throw new ModelRegistryError(options.modelError); return { pin, model }; } },
    predictor: { async predict() { aiCalls++; return { status: 'denied', reason: 'insufficient-evidence', requestsDispatched: 0, requestCountUnknown: false }; } },
    evidence: { async collect(request) { evidenceRequests.push(request); if (evidenceRequests.length === 1 && options.evidenceError)
      return { status: 'denied', reason: options.evidenceError };
      return { status: 'collected', snapshot: buildEvidenceSnapshot({ context: request.context, policy: request.policy, sources: [] }, evidenceAuthority()),
        requestsDispatched: 0, requestCountUnknown: false, usage: { football: { requests: 0, uncertain: false }, research: { requests: 0, uncertain: false } }, collectionIssues: [] }; } },
    fallback, observation: { async collect() { return { input: {}, requestsDispatched: 1, requestCountUnknown: false }; } },
    lifecycle: { async observe() { return { observation: { kickoffAt: value.context.kickoffAt, retrievedAt: current, providerUpdatedAt: null,
      externalFixtureId: value.context.externalFixtureId, status: 'scheduled', actualStartedAt: null, evidenceRef: 'synthetic-status' } }; }, async refreshEligibility() { return { eligible: true }; } },
    publisher: { async publish(input) { publications.push(input); if (options.publicationError) throw new Error('Synthetic interrupted publication.');
      return { refresh: { outcome: 'unavailable', reason: 'sources-unavailable', revisionId: null, id: 'synthetic-publication' } }; } },
    costs: { ai: null, research: null } });
  return { async run() { return service.definition.handle(payload, context); }, stages, publications, evidenceRequests,
    get intent() { return intent; }, counts: () => ({ prepared, modelCalls, aiCalls, fallbackCalls }), get outcome() { return outcome; } };
}

test('preparation ends before immutable analysis and resumed jobs never reimport history', async () => {
  const h = refreshHarness(); assert.equal((await h.run()).status, 'succeeded');
  assert.equal(h.intent.member.context.analysisAt, NOW + 1000); assert.equal(h.counts().prepared, 1);
  await h.run(); assert.equal(h.counts().prepared, 1);
});
test('an interrupted preparation is not dispatched again', async () => {
  const h = refreshHarness(); h.stages.set('preparation:started', { at: NOW });
  await h.run(); assert.equal(h.counts().prepared, 0);
});
test('safe evidence outage saves a separate empty snapshot and reaches fallback without an AI call', async () => {
  const h = refreshHarness({ ai: true, evidenceError: 'unavailable' }); await h.run();
  assert.equal(h.counts().aiCalls, 0); assert.equal(h.counts().fallbackCalls, 1);
  assert.equal(h.evidenceRequests.length, 2); assert.equal(h.evidenceRequests[1].requestId, refreshReference('a'.repeat(64), 'fallback-evidence'));
  assert.deepEqual(h.evidenceRequests[1].cachedSources, []); assert.equal(h.publications[0].evidenceSnapshotId, h.evidenceRequests[1].requestId);
});
test('evidence authorization/identity failures cannot be bypassed through fallback', async () => {
  for (const reason of ['not-authorized', 'fixture-changed', 'conflicting-request', 'clock-regression']) {
    const h = refreshHarness({ ai: true, evidenceError: reason }); await h.run();
    assert.equal(h.counts().fallbackCalls, 0); assert.equal(h.evidenceRequests.length, 1); assert.equal(h.outcome.outcome, 'failed');
  }
});
test('temporary model lookup failure reaches fallback but conflicting pins fail closed', async () => {
  const h = refreshHarness({ ai: true, modelError: 'unavailable' }); await h.run();
  assert.equal(h.counts().aiCalls, 0); assert.equal(h.counts().fallbackCalls, 1);
  const conflict = refreshHarness({ ai: true, modelError: 'conflicting-pin' }); await conflict.run();
  assert.equal(conflict.counts().fallbackCalls, 0); assert.equal(conflict.outcome.outcome, 'failed');
});
test('model recovery after interrupted publication does not launch a new primary attempt', async () => {
  const options = { ai: true, modelError: 'unavailable', publicationError: true }, h = refreshHarness(options);
  await assert.rejects(h.run(), /interrupted publication/);
  assert.equal(h.stages.get('ai:completed').value.reason, 'unavailable');
  options.modelError = null; options.publicationError = false;
  await h.run(); assert.equal(h.counts().aiCalls, 0); assert.equal(h.counts().fallbackCalls, 1);
});

test('AI plans freeze the provider-first order while fallback-only plans keep their reviewed shape', () => {
  const value = member(), plan = parseRefreshPlan(liveAiRefreshPlan(value, refs, policy, model, []), value);
  assert.equal(plan.sourceOrder, 'provider-first');
  const fallbackOnly = fallbackRefreshPlan(value, refs);
  assert.equal(Object.hasOwn(fallbackOnly, 'sourceOrder'), false);
  assert.equal(authorities().refresh.verifyPlan(parseRefreshPlan(fallbackOnly, value), value), true);
  for (const invalid of [{ ...fallbackOnly, sourceOrder: 'provider-first' }, { ...plan, sourceOrder: 'provider-only' },
    { ...plan, goalDefinitions: [goalResultMarket()] }]) {
    assert.throws(() => parseRefreshPlan(invalid, value), error => error.reason === 'policy-required');
  }
  // An approved ai-first order may carry reviewed goal definitions, as the original AI-first plans could.
  assert.equal(parseRefreshPlan({ ...plan, sourceOrder: 'ai-first', goalDefinitions: [goalResultMarket()] }, value).sourceOrder, 'ai-first');
});

test('plan verification accepts legacy AI intents without an order and refuses any other difference', () => {
  const value = member(), plan = parseRefreshPlan(liveAiRefreshPlan(value, refs, policy, model, []), value);
  const { sourceOrder: _order, ...legacy } = plan; void _order;
  assert.equal(authorities().refresh.verifyPlan(legacy, value), true);
  assert.equal(authorities().refresh.verifyPlan({ ...legacy, ai: { ...legacy.ai, maxElapsedMs: 1 } }, value), false);
  assert.equal(authorities().refresh.verifyPlan({ ...plan, sourceOrder: 'ai-first' }, value), false);
  const promoted = createLiveAuthorities({ policy, verify: () => true, refs, selection: selectionPolicy(policy, refs, liveWorkload(150000, 12, 'Mega', 900)),
    resultPolicy: () => null, statusEvidenceRef: `${refs.freshness}#status`, refreshPacing: 'standard', aiModel: model, sourceOrder: 'ai-first' });
  const aiFirst = parseRefreshPlan(liveAiRefreshPlan(value, refs, policy, model, [], 'standard', 'ai-first'), value);
  assert.equal(promoted.refresh.verifyPlan(aiFirst, value), true);
  assert.equal(promoted.refresh.verifyPlan(plan, value), false);
});

test('ai-first readiness needs an evaluation promotion reference for the current model', () => {
  const reference = `forecast-evaluation:${'c'.repeat(64)}:${model.id}`;
  assert.equal(liveSourceOrder(policy, model), 'provider-first');
  assert.equal(liveSourceOrder(parseRuntimePolicy({ ...env, GOAL_HINT_FORECAST_SOURCE_ORDER: 'ai-first', GOAL_HINT_AI_PROMOTION_REF: reference }), model), 'ai-first');
  const other = `forecast-evaluation:${'c'.repeat(64)}:${'d'.repeat(64)}`;
  for (const value of [other, 'synthetic-unbound-promotion', `${reference}:extra`]) {
    assert.throws(() => liveSourceOrder(parseRuntimePolicy({ ...env, GOAL_HINT_FORECAST_SOURCE_ORDER: 'ai-first', GOAL_HINT_AI_PROMOTION_REF: value }), model),
      /promotion reference for the current model/u);
  }
  const promotedPolicy = parseRuntimePolicy({ ...env, GOAL_HINT_FORECAST_SOURCE_ORDER: 'ai-first', GOAL_HINT_AI_PROMOTION_REF: reference });
  assert.throws(() => liveReadiness(promotedPolicy, parseOwnerApprovals({ version: 1, owner: 'Synthetic owner', approvals: [
    { requirement: 'ai-promotion', reference, approvedAt: '2026-10-13', decision: 'Synthetic reference approval without the underlying frozen report.' },
  ] })),
    error => error.issues.some(issue => issue.includes('independently verified frozen promotion binding')),
    'a matching reference cannot substitute for the actual verified frozen promotion evidence');
  assert.ok(missingOwnerApprovals(promotedPolicy, (_reference, requirement) => requirement !== 'ai-promotion').includes('GOAL_HINT_AI_PROMOTION_REF (ai-promotion)'));
  assert.equal(missingOwnerApprovals(policy, (_reference, requirement) => requirement !== 'ai-promotion').length, 0);
  assert.throws(() => liveReadiness(parseRuntimePolicy({ ...env, GOAL_HINT_FORECAST_SOURCE_ORDER: 'ai-first', GOAL_HINT_AI_PROMOTION_REF: other }),
    parseOwnerApprovals({ version: 1, owner: 'Synthetic owner', approvals: [{ requirement: 'ai-promotion', reference: other, approvedAt: '2026-10-13',
      decision: 'Synthetic promotion for another model.' }] })), error => error.issues.some(issue => issue.includes('current model')));
});
test('an AI plan sends its frozen order and the sealed fallback stage keeps both source receipts', async () => {
  const h = refreshHarness({ ai: true, modelError: 'unavailable' }); await h.run();
  assert.equal(h.intent.plan.sourceOrder, 'provider-first'); assert.equal(h.counts().fallbackCalls, 1);
  const sources = parseForecastSourceReceipts(h.stages.get('fallback:completed').value.sources);
  assert.equal(sources.order, 'provider-first');
  assert.deepEqual([sources.ai.status, sources.ai.reason], ['unavailable', 'unavailable']);
  assert.deepEqual([sources['api-football'].status, sources['api-football'].reason], ['unavailable', 'provider-unavailable']);
  const interrupted = refreshHarness({ ai: true, modelError: 'unavailable' }); interrupted.stages.set('fallback:started', { at: NOW });
  await interrupted.run(); assert.equal(interrupted.counts().fallbackCalls, 0);
  assert.equal(parseForecastSourceReceipts(interrupted.stages.get('fallback:completed').value.sources)['api-football'].reason, 'provider-unavailable');
  const fallbackOnly = refreshHarness(); await fallbackOnly.run();
  assert.equal(Object.hasOwn(fallbackOnly.stages.get('fallback:completed').value, 'sources'), false);
});

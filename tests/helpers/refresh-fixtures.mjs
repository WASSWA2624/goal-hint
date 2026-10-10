import { createCostService } from '../../src/server/cost-control/cost-service.ts';
import { createMysqlCostStore } from '../../src/server/cost-control/cost-mysql-store.ts';
import { createCostGateway } from '../../src/server/cost-control/cost-gateway.ts';
import { parseRuntimePolicy } from '../../src/server/config/runtime-policy.ts';
import { createEvidenceService } from '../../src/server/evidence/evidence-service.ts';
import { createMysqlEvidenceStore } from '../../src/server/evidence/evidence-mysql-store.ts';
import { createResearchEvidenceAdapter } from '../../src/server/evidence/evidence-research.ts';
import { createPrimaryAiAdapter } from '../../src/server/predictor/predictor-adapter.ts';
import { createPredictorService } from '../../src/server/predictor/predictor-service.ts';
import { createModelRegistry } from '../../src/server/predictor/predictor-registry.ts';
import { createMysqlModelVersionStore } from '../../src/server/predictor/predictor-mysql-store.ts';
import { createFallbackService } from '../../src/server/fallback/fallback-service.ts';
import { createMysqlDailySelectionStore } from '../../src/server/selection/selection-mysql-store.ts';
import { createScheduleLifecycleService } from '../../src/server/predictions/lifecycle-service.ts';
import { createMysqlRefreshStore } from '../../src/server/refresh/refresh-mysql-store.ts';
import { createPredictionRefreshService } from '../../src/server/refresh/refresh-service.ts';
import { createRefreshObservationCollector } from '../../src/server/refresh/refresh-observation.ts';
import { refreshReference } from '../../src/server/refresh/refresh-input.ts';
import { createJobRegistry } from '../../src/server/jobs/job-registry.ts';
import { createJobWorker } from '../../src/server/jobs/job-worker.ts';
import { costJob, costPeriod, costRequest, costRate, costUsage, syntheticCostAuthority, USD } from './cost-fixtures.mjs';
import { evidenceAuthority, evidencePolicy, evidenceSource, evidenceHash } from './evidence-fixtures.mjs';
import { modelVersion, modelAuthority } from './predictor-fixtures.mjs';
import { predictorRawOutput } from './predictor-output-fixtures.mjs';
import { fallbackAuthority } from './fallback-fixtures.mjs';
import { fallbackAdapterSetup, fallbackCanonical } from './fallback-adapter-fixtures.mjs';
import { catalogBounds, catalogFixture, catalogResponse, createSyntheticCatalogAdapter } from './catalog-fixtures.mjs';
import { lifecyclePolicy, lifecycleAuthority } from './lifecycle-fixtures.mjs';

// Every transport, credential, policy and rate is synthetic; durable queue,
// evidence, model, cost, lifecycle and publication services run against MySQL.
export async function refreshHarness(db, scenarios, changes = {}) {
  await db.instance.executeAdmin(['CostBudgetAccount','CostBudgetPeriod','CostBudgetJob','CostBudgetAttempt'].map((table) =>
    `GRANT SELECT, INSERT, UPDATE ON goal_hint_test.${table} TO 'cutoff_app'@'127.0.0.1';`).join('\n'));
  const rows = scenarios.map((_, index) => catalogFixture(4000 + index, { kickoff: new Date(Date.parse('2026-10-12T12:00:00Z') + index * 60_000).toISOString() }));
  const selected = await db.cohort('2026-10-09', db.first, { claim: false, rows, refresh: {
    type: 'prediction.daily-refresh', payload: { policyRef: 'synthetic-refresh-policy' }, timeoutMs: 60_000,
    fallbackReserveMs: 20_000, leaseMs: 15_000, maxAttempts: 3, backoff: { baseMs: 100, maxMs: 100 } } });
  const clock = { now: db.now }, model = modelVersion(), calls = { ai: [], fallback: [], research: [] }, events = [];
  const scenarioFor = (id) => scenarios[id - 4000];
  const periods = Object.fromEntries(['ai','research'].map((category) => [category, costPeriod(`refresh-${category}`, category,
    { startsAt: db.now() - 86_400_000, endsAt: db.now() + 7 * 86_400_000, capUsdPicos: 1000n * USD })]));
  const costs = Object.fromEntries(['ai','research'].map((category) => [category, createCostService({ accountId: periods[category].accountId,
    category, store: createMysqlCostStore(db.a), authority: syntheticCostAuthority(), rateFor: () => costRate(category,
      { startsAt: periods[category].startsAt, endsAt: periods[category].endsAt, provider: category === 'ai' ? model.provider : 'synthetic-research', model: category === 'ai' ? model.model : null }) })]));
  for (const category of ['ai','research']) await costs[category].initialize(periods[category]);
  const gateway = Object.fromEntries(['ai','research'].map((category) => [category, createCostGateway({ service: costs[category], clock, authorize() {} })]));
  const runtimePolicy = parseRuntimePolicy({ NODE_ENV: 'development', GOAL_HINT_OPERATION_SCOPE: 'trial',
    GOAL_HINT_AI_ENABLED: 'true', AI_API_KEY: 'synthetic-ai-only-key', GOAL_HINT_AI_PROVIDER: model.provider, GOAL_HINT_AI_MODEL: model.model,
    GOAL_HINT_CALIBRATION_REF: model.calibration.evidenceRef, GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS: '2000',
    GOAL_HINT_RESEARCH_ENABLED: 'true', RESEARCH_API_KEY: 'synthetic-research-only-key', GOAL_HINT_RESEARCH_PROVIDER: 'synthetic-research',
    GOAL_HINT_RESEARCH_LICENSE_REF: 'synthetic-research-license',
    GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS: '1000', GOAL_HINT_BUDGET_APPROVAL_REF: 'synthetic-budget',
    GOAL_HINT_EVIDENCE_POLICY_REF: 'synthetic-evidence', GOAL_HINT_FRESHNESS_POLICY_REF: 'synthetic-freshness',
    GOAL_HINT_JOB_REQUEST_LIMIT: '10', GOAL_HINT_JOB_TOKEN_LIMIT: '1000', GOAL_HINT_JOB_TIMEOUT_SECONDS: '60' });
  const authority = evidenceAuthority(), registry = createModelRegistry({ store: createMysqlModelVersionStore(db.a), authority: modelAuthority(),
    maxPins: 100, verifyPriorPin: () => true });
  const primary = createPrimaryAiAdapter({ runtimePolicy, clock, gateway: gateway.ai, modelAuthority: modelAuthority(), verifyEvidence: () => true,
    verifyBinding: () => true, binding: { provider: model.provider, model: model.model, providerModelVersion: model.providerModelVersion,
      contractVersion: model.contractVersion, async generate(input) {
        calls.ai.push(input); const scenario = scenarioFor(input.snapshot.context.externalFixtureId);
        if (scenario.ai === 'outage') throw new Error('private synthetic AI failure');
        if (scenario.generate) return scenario.generate(input);
        if (scenario.ai === 'timeout') await new Promise((resolve) => setTimeout(resolve, 350));
        const output = predictorRawOutput(input.snapshot, input.model);
        if (scenario.ai === 'partial') delete output.groups['match-result'];
        return { value: { output: scenario.ai === 'invalid' ? 'not JSON' : output, metadata: {
          generatedAt: db.now(), retrievedAt: db.now(), providerUpdatedAt: null, evidenceRef: 'synthetic-ai-response' } },
          usage: costUsage(input.transport.permit, input.pin.invocationId, { observedAt: db.now(), elapsedMs: 1,
            observedQuantities: { requests: 1, inputTokens: 10, outputTokens: 10, billedUnits: 0 } }) };
      } } });
  const predictor = createPredictorService({ registry, adapter: primary, modelAuthority: modelAuthority(), evidenceAuthority: authority,
    clock, maxInflight: 100, verifyInvocation: () => true, verifyTransmission: () => true, verifyTransport: () => true, verifyExplanation: () => true });
  const research = createResearchEvidenceAdapter({ runtimePolicy, verifyEvidence: () => true, authority, gateway: gateway.research,
    clock, verifyBinding: () => true, binding: { provider: 'synthetic-research', contractVersion: 'synthetic-research-v1', evidenceRef: 'synthetic-research-proof',
      async search(input) { calls.research.push(input); return { value: { sources: [] }, usage: costUsage(input.transport.permit, 'research',
        { observedAt: db.now(), elapsedMs: 1 }) }; } } });
  const evidence = createEvidenceService({ authority, store: createMysqlEvidenceStore(db.a), clock, research,
    football: { async collect() { throw new Error('cached structured evidence must not fetch'); } } });
  const fallback = createFallbackService({ authority: fallbackAuthority(), clock, maxInflight: 100, verifyRequest: () => true,
    fallback: { async collect(input, workflow) {
      calls.fallback.push(input); workflow.check(); const scenario = scenarioFor(input.context.externalFixtureId);
      if (scenario.fallback === 'outage') throw new Error('private synthetic provider failure');
      if (scenario.fallback === 'timeout') await new Promise((resolve) => setTimeout(resolve, 80));
      if (scenario.fallback === 'none') return { status: 'denied', reason: 'unsupported-markets', requestsDispatched: 1, requestCountUnknown: false };
      const provider = fallbackAdapterSetup({ context: input.context, fixture: fallbackCanonical(input.context, { retrievedAt: db.now() }) });
      provider.setNow(db.now()); return provider.fallback.collect(input, workflow);
    } } });
  const source = createSyntheticCatalogAdapter({ respond: (url) => {
    source.clock.value = db.now(); const index = Number(url.searchParams.get('id')) - 4000, scenario = scenarios[index];
    if (scenario.observation === 'outage') throw new Error('private synthetic status failure');
    const row = structuredClone(rows[index]);
    if (scenario.observation === 'live') row.fixture.status = { short: '1H', long: 'First half', elapsed: 1 };
    return catalogResponse(url, [row]);
  } });
  source.clock.value = db.now();
  const observation = createRefreshObservationCollector({ adapter: source.adapter.evidence, evidenceRef: 'synthetic-status-proof', verifyResponse: () => true });
  const lifecycle = createScheduleLifecycleService({ database: db.a, cutoff: db.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
  const store = createMysqlRefreshStore(db.a, db.queue), selection = createMysqlDailySelectionStore(db.a, db.queue);
  function configure(member) {
    const scenario = scenarioFor(member.context.externalFixtureId), deadlineAt = Math.min(member.now + 60_000, member.cycle.cutoffAt);
    const makeJob = (category) => costJob(periods[category], `${member.jobId}:${category}`, { jobId: member.jobId, workKey: member.jobId,
      startsAt: member.now, deadlineAt, timeLimitMs: 60_000, fallbackReserveMs: 20_000,
      costCapUsdPicos: scenario.ai === 'budget' && category === 'ai' ? 0n : 10n * USD });
    const aiJob = makeJob('ai'), researchJob = makeJob('research'), priority = { kind: 'fixture', kickoffAt: member.context.kickoffAt };
    const aiRequest = costRequest(aiJob, member.jobId, { attemptId: refreshReference(member.jobId, 'ai'), provider: model.provider, model: model.model,
      priority, timeoutMs: scenario.ai === 'timeout' ? 100 : 1000, maximum: { requests: 1, inputTokens: 10, outputTokens: 10, billedUnits: 0 } });
    const policy = evidencePolicy(scenario.missing ? { minimum: { historyPerTeam: 1 } } : {});
    const researchPlan = scenario.research ? { job: researchJob, request: costRequest(researchJob, member.jobId, {
      attemptId: refreshReference(member.jobId, 'research'), provider: 'synthetic-research', model: null, priority }), maxSources: 2,
      targetIndependentSources: 1, maxResponseBytes: 10000, maxExtractCharacters: 1000, evidenceRef: 'synthetic-research-plan' } : null;
    const fallbackOnly = scenario.aiPlan === 'none';
    return { version: 1, evidenceRef: 'synthetic-refresh-policy', modelVersionId: fallbackOnly ? null : model.id,
      evidence: { requestId: refreshReference(member.jobId, 'evidence'), context: member.context, policy, footballPlan: null,
        researchPlan, cachedSources: [evidenceSource(member.context)], maxElapsedMs: 3000 },
      ai: fallbackOnly ? null : { job: aiJob, request: aiRequest, maxElapsedMs: scenario.ai === 'timeout' ? 2000 : 5000 },
      fallback: { bounds: catalogBounds(member.now, { priority: 'near-kickoff-fallback', cacheScope: member.jobId, deadlineAt, maxRequests: 1, timeoutMs: 1000, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } }),
        maxElapsedMs: scenario.fallback === 'timeout' ? 20 : 5000 },
      observation: { bounds: catalogBounds(member.now, { deadlineAt, maxRequests: 1, timeoutMs: 1000, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } }), maxAgeMs: 10000 },
      publicationReserveMs: 2000, footballRequestLimit: 2 };
  }
  const serviceOptions = { type: 'prediction.daily-refresh', handlerVersion: 1, store, selection, clock, configure,
    authority: { authorize() {}, verifyPlan: () => true }, models: registry, evidence, predictor, fallback, observation, lifecycle,
    publisher: db.publisher, costs, ...changes };
  const service = createPredictionRefreshService(serviceOptions), jobs = createJobRegistry([service.definition]);
  const worker = createJobWorker({ queue: db.queue, registry: jobs, ownerId: evidenceHash('refresh-worker'), onEvent: (event) => events.push(event) });
  const jobIdAt = async (index) => (await db.a.query((tx) => tx.runFixture.findFirst({ where: {
    runId: selected.selected.runId, rank: index }, select: { jobId: true } }))).jobId;
  return { service, worker, selected, calls, events, store, costs, configure, serviceOptions, source, lifecycle, jobs, jobIdAt, model, rows,
    async outcome(index) { return service.outcome(await jobIdAt(index)); }, async job(index) { return db.queue.inspect(await jobIdAt(index)); } };
}

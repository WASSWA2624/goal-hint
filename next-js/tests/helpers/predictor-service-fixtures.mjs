import { parseRuntimePolicy } from "../../src/server/config/runtime-policy.ts";
import { createCostGateway } from "../../src/server/cost-control/cost-gateway.ts";
import { createPolicyCostService } from "../../src/server/cost-control/cost-policy.ts";
import { buildEvidenceSnapshot } from "../../src/server/evidence/evidence-snapshot.ts";
import { createPrimaryAiAdapter } from "../../src/server/predictor/predictor-adapter.ts";
import { createModelPin } from "../../src/server/predictor/predictor-input.ts";
import { buildPredictorPrompt, PredictorPromptError } from "../../src/server/predictor/predictor-prompt.ts";
import { createModelRegistry } from "../../src/server/predictor/predictor-registry.ts";
import { createPredictorService, parsePredictorRequest } from "../../src/server/predictor/predictor-service.ts";
import { COST_NOW, USD, costJob, costPeriod, costRate, costRequest, costUsage, syntheticCostAuthority } from "./cost-fixtures.mjs";
import { memoryCostStore } from "./cost-memory-store.mjs";
import { evidenceAuthority, evidenceContext, evidencePolicy, evidenceSource } from "./evidence-fixtures.mjs";
import { modelAuthority, modelMemoryStore, modelVersion } from "./predictor-fixtures.mjs";
import { predictorRawOutput } from "./predictor-output-fixtures.mjs";

// Every account, credential, rate, approval, fact, response and evaluation
// artifact is synthetic. Only local policy, accounting and validation execute.
export async function predictorHarness(changes = {}) {
  const clock = { value: COST_NOW, now() { return this.value; } };
  const permissions = { model: true, calibration: true, evaluation: true, transmission: true,
    binding: true, invocation: true, evidence: true, transport: true, explanation: true };
  const model = modelVersion(changes.model);
  const settings = { NODE_ENV: "development", GOAL_HINT_OPERATION_SCOPE: "trial", GOAL_HINT_AI_ENABLED: "true",
    AI_API_KEY: "synthetic-ai-only-key", GOAL_HINT_AI_PROVIDER: model.provider, GOAL_HINT_AI_MODEL: model.model,
    GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS: "2000", GOAL_HINT_CALIBRATION_REF: model.calibration.evidenceRef,
    GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-ai-budget", GOAL_HINT_EVIDENCE_POLICY_REF: "synthetic-coverage",
    GOAL_HINT_FRESHNESS_POLICY_REF: "synthetic-freshness", GOAL_HINT_JOB_REQUEST_LIMIT: "2",
    GOAL_HINT_JOB_TOKEN_LIMIT: "1000", GOAL_HINT_JOB_TIMEOUT_SECONDS: "60", ...changes.settings };
  const runtimePolicy = parseRuntimePolicy(settings), store = memoryCostStore(clock);
  const allocation = { ai: { costCapUsdPicos: 5n * USD, requestLimit: 2, inputTokenLimit: 500,
    outputTokenLimit: 500, billedUnitLimit: 0, primaryTimeLimitMs: 25_000 }, research: null,
  fallbackReserveMs: 5000, evidenceRef: "synthetic-ai-allocation", ...changes.allocation };
  const period = costPeriod("predictor-bridge", "ai", { capUsdPicos: 20n * USD, ...changes.period });
  const verifyEvidence = changes.verifyEvidence ?? (() => true);
  const costService = createPolicyCostService({ accountId: period.accountId, category: "ai", store,
    runtimePolicy, allocation, verifyAllocation: changes.verifyAllocation ?? (() => true), verifyEvidence,
    authority: syntheticCostAuthority(changes.costAuthority),
    rateFor: changes.rateFor ?? (() => costRate("ai", { provider: model.provider, model: model.model })) });
  const initialized = await costService.initialize(period);
  const gateway = createCostGateway({ service: costService, clock, authorize: changes.gatewayAuthorize ?? (() => {}) });
  const context = evidenceContext(undefined, { analysisAt: COST_NOW, cutoffAt: COST_NOW - 10, ...changes.context });
  const policy = evidencePolicy(changes.policy);
  const snapshot = changes.snapshot ?? buildEvidenceSnapshot({ context, policy,
    sources: changes.sources ?? [evidenceSource(context)] }, evidenceAuthority());
  const job = costJob(period, "predictor-bridge", { costCapUsdPicos: 5n * USD, requestLimit: 2,
    inputTokenLimit: 500, outputTokenLimit: 500, billedUnitLimit: 0, timeLimitMs: 30_000, fallbackReserveMs: 5000, ...changes.job });
  const maximum = { requests: 1, inputTokens: 10, outputTokens: 10, billedUnits: 0, ...changes.request?.maximum };
  const request = costRequest(job, "primary-prediction", { provider: model.provider, model: model.model,
    priority: { kind: "fixture", kickoffAt: snapshot.context.kickoffAt }, ...changes.request, maximum });
  const pin = createModelPin({ version: 1, invocationId: request.attemptId, jobId: job.jobId, modelVersionId: model.id });
  const memory = modelMemoryStore(); memory.records.set(model.id, model);
  const registry = createModelRegistry({ store: memory.store, authority: modelAuthority(), maxPins: 100,
    verifyPriorPin: changes.verifyPriorPin ?? (() => true) });
  await registry.resolve(pin);
  const currentModelAuthority = modelAuthority({ verifyModel: () => permissions.model,
    verifyCalibration: () => permissions.calibration, verifyEvaluation: () => permissions.evaluation, ...changes.modelAuthority });
  const currentEvidenceAuthority = evidenceAuthority({ verifyContext: () => permissions.evidence,
    verifyPolicy: () => permissions.evidence, verifySource: () => permissions.evidence,
    verifyReuse: () => permissions.evidence, ...changes.evidenceAuthority });
  const promptAuthority = { evidence: evidenceAuthority({ verifySource: () => permissions.evidence,
    verifyReuse: () => permissions.evidence }), verifyModel: () => permissions.model,
  verifyTransmission: () => permissions.transmission };
  let prompt, promptError;
  try { prompt = buildPredictorPrompt({ model, snapshot, authority: promptAuthority }); }
  catch (error) { if (!(error instanceof PredictorPromptError)) throw error; promptError = error; }
  const metadata = { generatedAt: COST_NOW, retrievedAt: COST_NOW, providerUpdatedAt: COST_NOW,
    evidenceRef: "synthetic-ai-response-observation", ...changes.metadata };
  const raw = snapshot.facts.length === 0 ? undefined : predictorRawOutput(snapshot, model, changes.raw);
  const calls = [];
  const binding = { provider: model.provider, model: model.model, providerModelVersion: model.providerModelVersion,
    contractVersion: model.contractVersion,
    async generate(input) {
      calls.push(input);
      const response = { value: { output: predictorRawOutput(input.snapshot, input.model, changes.raw), metadata },
        usage: costUsage(input.transport.permit, "primary-prediction", { observedAt: clock.value, elapsedMs: 1,
          observedQuantities: { requests: 1, inputTokens: 10, outputTokens: 10, billedUnits: 0 } }) };
      return changes.generate ? changes.generate(input, response) : response;
    }, ...changes.binding };
  const adapter = createPrimaryAiAdapter({ runtimePolicy, gateway, clock, modelAuthority: currentModelAuthority,
    binding: changes.noBinding ? null : binding, verifyEvidence,
    verifyBinding: changes.verifyBinding ?? (() => permissions.binding) });
  const service = createPredictorService({ registry, adapter, clock, maxInflight: 100,
    modelAuthority: currentModelAuthority, evidenceAuthority: currentEvidenceAuthority,
    verifyInvocation: changes.verifyInvocation ?? (() => permissions.invocation),
    verifyTransmission: changes.verifyTransmission ?? (() => permissions.transmission),
    verifyTransport: changes.verifyTransport ?? (() => permissions.transport),
    verifyExplanation: changes.verifyExplanation ?? (() => permissions.explanation), ...changes.serviceOptions });
  const invocation = { model, pin, snapshot, prompt, job, request };
  const input = parsePredictorRequest({ pin, snapshot, job, request, maxElapsedMs: changes.maxElapsedMs ?? 1000 });
  return { predictor: service, service, adapter, invocation, input, pin, model, snapshot, prompt, context, raw, metadata,
    clock, calls, costService, period, job, request, registry, gateway, store, permissions, binding, runtimePolicy,
    modelAuthority: currentModelAuthority, evidenceAuthority: currentEvidenceAuthority, promptAuthority, promptError, initialized };
}

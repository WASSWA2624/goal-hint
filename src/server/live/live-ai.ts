import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { assertOperationAllowed, type RuntimePolicy, type EvidenceVerifier } from "../config/runtime-policy.ts";
import type { CostAuthority, CostPeriodPolicy } from "../cost-control/cost-contract.ts";
import { costUsdPicosFromCents } from "../cost-control/cost-input.ts";
import { createPolicyCostService } from "../cost-control/cost-policy.ts";
import { createCostGateway } from "../cost-control/cost-gateway.ts";
import { createMysqlCostStore } from "../cost-control/cost-mysql-store.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { EvidenceAuthority, EvidenceSnapshot } from "../evidence/evidence-contract.ts";
import { buildEvidenceSnapshot } from "../evidence/evidence-snapshot.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { FallbackContext, ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";
import { parseFallbackAiResult } from "../fallback/fallback-input.ts";
import { createOpenAiBinding } from "../predictor/openai-transport.ts";
import { createPrimaryAiAdapter } from "../predictor/predictor-adapter.ts";
import type { ModelAuthority, ModelPin, ModelVersion } from "../predictor/predictor-contract.ts";
import { parseModelPin } from "../predictor/predictor-input.ts";
import { createMysqlModelVersionStore } from "../predictor/predictor-mysql-store.ts";
import { createModelRegistry, ModelRegistryError } from "../predictor/predictor-registry.ts";
import { createPredictorService, type PredictorResult } from "../predictor/predictor-service.ts";
import type { PredictorExplanation } from "../predictor/predictor-output.ts";
import type { RefreshIntent, RefreshMember, RefreshPlan } from "../refresh/refresh-contract.ts";
import type { RefreshStore } from "../refresh/refresh-mysql-store.ts";
import { liveAiAccountingWindow, liveAiAccountId, liveAiRate } from "./live-ai-model.ts";
import { liveAiAllocation, liveAiRefreshPlan } from "./live-ai-plan.ts";
import type { LiveReferences, RefreshPacing } from "./live-plan.ts";

const same = (left: unknown, right: unknown) => evidenceFingerprint(left) === evidenceFingerprint(right);
const missingUncertainty = "Some fixture evidence is unavailable; missing reports do not establish squad fitness.";
type AiIntent = RefreshIntent & { plan: RefreshPlan & { ai: NonNullable<RefreshPlan["ai"]> }; pin: ModelPin };

function groundedText(item: PredictorExplanation, snapshot: EvidenceSnapshot, uncertainty = false): string | null {
  if (!item.references.length) return uncertainty && snapshot.missingness.length ? missingUncertainty : null;
  const summaries = new Set<string>();
  for (const reference of item.references) {
    if (!reference || typeof reference !== "object") return null;
    const source = snapshot.sources.find((value) => value.id === reference.sourceId), fact = snapshot.facts.find((value) => value.id === reference.factId);
    const claim = source?.claims.find((value) => evidenceFingerprint(value) === reference.claimId && value.subjectTeamId === reference.subjectTeamId);
    const variant = fact?.values.find((value) => value.sourceIds.includes(reference.sourceId) && value.claimIds.includes(reference.claimId));
    if (!claim || !fact || fact.subjectTeamId !== reference.subjectTeamId || !variant || variant.summary !== claim.summary) return null;
    summaries.add(claim.summary);
  }
  const text = [...summaries].join(" "); return text.length <= 500 ? text : null;
}

/** Display factual cited summaries; model-selected freeform wording cannot approve its own grounding. */
export function groundLiveAiExplanations(output: unknown, snapshot: EvidenceSnapshot): unknown {
  let value: unknown;
  try { value = typeof output === "string" ? JSON.parse(output) : structuredClone(output); } catch { return output; }
  if (!value || typeof value !== "object" || !Array.isArray((value as { reasons?: unknown }).reasons)) return output;
  const raw = value as { reasons: PredictorExplanation[]; uncertainty?: PredictorExplanation };
  const replace = (item: PredictorExplanation, uncertainty: boolean) => {
    if (!item || typeof item !== "object" || typeof item.text !== "string" || item.text.length > 500 || !Array.isArray(item.references)) return item;
    const text = groundedText(item, snapshot, uncertainty); return text === null ? item : { ...item, text };
  };
  raw.reasons = raw.reasons.map((item) => replace(item, false));
  if (raw.uncertainty) raw.uncertainty = replace(raw.uncertainty, true);
  return value;
}

/** Compose immutable model ownership, durable accounting and a single reviewed OpenAI attempt. */
export async function createLiveAiRuntime(options: {
  policy: RuntimePolicy; verify: EvidenceVerifier; refs: LiveReferences; model: ModelVersion;
  database: DatabaseRuntime; store: RefreshStore; evidenceAuthority: EvidenceAuthority; pacing: RefreshPacing;
  fallbackReserveMs: number; fetcher?: typeof fetch; clock?: Clock;
}) {
  const { policy, model, verify, refs } = options, clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const authorize = () => assertOperationAllowed(policy, "ai", verify);
  const modelAuthority: ModelAuthority = {
    authorize() { authorize(); }, verifyModel: (value) => same(value, model),
    verifyCalibration: (value) => same(value.calibration, model.calibration) && verify(value.calibration.evidenceRef, "calibration-configuration"),
    verifyEvaluation: (value) => same(value.evaluation, model.evaluation) && value.evaluation.status === "provisional",
  };
  const modelStore = createMysqlModelVersionStore(options.database);
  const { id: _id, hash: _hash, ...configuration } = model; void _id; void _hash;
  await createModelRegistry({ store: modelStore, authority: modelAuthority, maxPins: 1 }).register(configuration);
  const work = new Map<string, AiIntent>();
  const transport = createOpenAiBinding({ model, clock, ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  const allocation = liveAiAllocation(policy, model, clock.now(), options.fallbackReserveMs), accountId = liveAiAccountId(policy);
  const billingMode = policy.choices.budgets.aiBillingMode;
  function period(at: number): CostPeriodPolicy {
    const window = liveAiAccountingWindow(utcInstantFromEpochMilliseconds(at));
    const value = { accountId, category: "ai" as const, periodId: evidenceFingerprint({ accountId, month: window.name }),
      startsAt: window.startsAt, endsAt: window.endsAt, capUsdPicos: billingMode === "usage-based" ? 0n :
        costUsdPicosFromCents(policy.choices.budgets.aiMonthlyUsdCents!), openingChargedUsdPicos: 0n,
      evidenceRef: policy.choices.budgets.approvalRef!, billingMode };
    return value;
  }
  const costAuthority: CostAuthority = {
    authorize() { authorize(); }, verifyPeriod: (value) => same(value, period(value.startsAt)),
    verifyJob: (job) => same(work.get(job.jobId)?.plan.ai?.job, job),
    verifyRate: (rate) => same(rate, liveAiRate(model, rate.startsAt)),
    verifyRequest: (request, job) => same(work.get(job.jobId)?.plan.ai?.request, request),
    verifyUsage: transport.verifyUsage,
  };
  const costs = createPolicyCostService({ accountId, category: "ai", store: createMysqlCostStore(options.database),
    authority: costAuthority, runtimePolicy: policy, verifyEvidence: verify, allocation,
    verifyAllocation: (value) => same(value, allocation),
    rateFor: (request) => { const intent = work.get(request.jobId); return intent ? liveAiRate(model, intent.plan.ai.job.startsAt) : null; } });
  async function initialize() {
    const result = await costs.initialize(period(clock.now()));
    if (result.status !== "initialized") throw new Error("The AI accounting period is unavailable.");
  }
  await initialize();
  const models = { async resolve(value: unknown) {
    const pin = parseModelPin(value);
    const intent = await options.store.intent(pin.jobId);
    if (!intent?.pin || !intent.plan.ai || !same(intent.pin, pin) || intent.plan.modelVersionId !== model.id)
      throw new ModelRegistryError("not-authorized");
    work.set(pin.jobId, intent as AiIntent);
    // Durable owning intent proves the original pin on every resolve, including restart.
    return createModelRegistry({ store: modelStore, authority: modelAuthority, maxPins: 1,
      verifyPriorPin: (previous) => same(previous, intent.pin) }).resolve(pin);
  } };
  const binding = { ...transport.binding, async generate(input: Parameters<typeof transport.binding.generate>[0]) {
    const result = await transport.binding.generate(input);
    return { ...result, value: { ...result.value, output: groundLiveAiExplanations(result.value.output, input.snapshot) } };
  } };
  const adapter = createPrimaryAiAdapter({ runtimePolicy: policy, verifyEvidence: verify, modelAuthority, clock,
    gateway: createCostGateway({ service: costs, authorize, clock }), binding,
    verifyBinding: (value, invocation) => value.generate === binding.generate && same(invocation.model, model) &&
      same(work.get(invocation.pin.jobId)?.plan.ai?.request, invocation.request) });
  const predictor = createPredictorService({ registry: models, adapter, modelAuthority, evidenceAuthority: options.evidenceAuthority,
    clock, maxInflight: 12,
    verifyInvocation: (pin, context, job, request) => {
      const intent = work.get(pin.jobId); return !!intent && same(intent.pin, pin) && same(intent.member.context, context) &&
        same(intent.plan.ai.job, job) && same(intent.plan.ai.request, request);
    },
    verifyTransmission: (source) => source.kind === "football" && verify(`${refs.evidence}#openai-transmission`, "evidence-policy") &&
      verify(refs.retention, "football-private-use"),
    verifyTransport: transport.verifyTransport,
    verifyExplanation: (item, snapshot, _model, kind) => item.text === groundedText(item, snapshot, kind === "uncertainty"),
  });
  function snapshot(intent: AiIntent) {
    return buildEvidenceSnapshot({ context: intent.member.context, policy: intent.plan.evidence.policy,
      sources: intent.plan.evidence.cachedSources }, options.evidenceAuthority);
  }
  return Object.freeze({ model, models, costs,
    configure(member: RefreshMember, sources: readonly import("../evidence/evidence-contract.ts").EvidenceSource[]) {
      return liveAiRefreshPlan(member, refs, policy, model, sources, options.pacing);
    },
    predictor: { async predict(...args: Parameters<typeof predictor.predict>) { await initialize(); return predictor.predict(...args); } },
    verifyAi(result: PredictorResult, expected: FallbackContext) {
      try {
        parseFallbackAiResult(result);
        const intent = work.get(expected.jobId);
        if (!intent || !same(expected.pin, intent.pin) || !same(expected.context, intent.member.context)) return false;
        if (result.status === "denied") return true;
        const original = snapshot(intent);
        return same(result.pin, intent.pin) && result.output.modelVersionId === model.id && result.output.evidenceHash === original.hash &&
          expected.evidenceHash === original.hash && same(result.output.context, original.context) &&
          same(result.output.outputTiming, model.outputTiming) && same(result.output.calibration, {
            kind: "none", version: model.calibration.version, method: null, appliedFamilies: [], evidenceRef: model.calibration.evidenceRef, evaluationRef: null }) &&
          same(result.output.evaluation, model.evaluation) && result.output.provisional &&
          result.output.reasons.every((item) => item.text === groundedText(item, original)) &&
          result.output.uncertainty.text === groundedText(result.output.uncertainty, original, true);
      } catch { return false; }
    },
    verifyCandidate(candidate: ResolvedForecastCandidate) {
      const intent = work.get(candidate.context.jobId);
      if (!intent || !same(candidate.context.pin, intent.pin)) return false;
      return Object.values(candidate.markets).every((entry) => !entry.available || entry.provenance.kind !== "ai" ||
        entry.provenance.modelVersionId === model.id && same(entry.provenance.pin, intent.pin) && entry.provenance.provisional &&
        same(entry.provenance.outputTiming, model.outputTiming) && same(entry.provenance.evaluation, model.evaluation));
    },
    release(jobId: string) { work.delete(jobId); },
  });
}
export type LiveAiRuntime = Awaited<ReturnType<typeof createLiveAiRuntime>>;

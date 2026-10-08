import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { MarketSnapshot } from "../../domain/markets.ts";
import type { CostJobPolicy, CostRequest } from "../cost-control/cost-contract.ts";
import { parseCostJob, parseCostRequest } from "../cost-control/cost-input.ts";
import type { CostDispatchWorkflow } from "../cost-control/cost-dispatch.ts";
import type { EvidenceAuthority, EvidenceContext, EvidenceSnapshot, EvidenceSource } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, freezeEvidence, parseEvidenceSnapshot } from "../evidence/evidence-input.ts";
import type { ModelAuthority, ModelPin, ModelVersion } from "./predictor-contract.ts";
import { parseModelPin } from "./predictor-input.ts";
import { assertModelAuthorized, ModelRegistryError, type ModelRegistry } from "./predictor-registry.ts";
import { assertPreparedPredictorPrompt, buildPredictorPrompt, PredictorPromptError, type BuiltPredictorPrompt } from "./predictor-prompt.ts";
import { isPredictorOutputCurrent, validatePredictorOutput, type PredictorOutputAuthority, type PredictorOutputRejection } from "./predictor-output.ts";
import { applyPredictorCalibration, type PredictorCalibrationOptions, type PredictorCalibratedOutput } from "./predictor-calibration.ts";
import type { createPrimaryAiAdapter, PrimaryAiAdapterResult } from "./predictor-adapter.ts";

export type PredictorRequest = Readonly<{
  pin: ModelPin; snapshot: EvidenceSnapshot; job: CostJobPolicy; request: CostRequest; maxElapsedMs: number;
}>;
type AdapterDenial = Extract<PrimaryAiAdapterResult, { status: "denied" }>["reason"];
export type PredictorReason = AdapterDenial | PredictorOutputRejection | "conflicting-pin" | "conflicting-invocation" |
  "capacity-exhausted" | "invalid-candidate" | "unverified-calibration" | "unverified-evaluation";
export type PredictorResult = Readonly<{
  status: "candidate"; pin: ModelPin; output: PredictorCalibratedOutput; requestsDispatched: 1; requestCountUnknown: false;
}> | Readonly<{
  status: "denied"; reason: PredictorReason; requestsDispatched: 0 | 1; requestCountUnknown: boolean; markets?: MarketSnapshot;
}>;
const adapterReasons = new Set<AdapterDenial>(["not-authorized", "invalid-response", "unavailable", "invalid-request",
  "operation-not-authorized", "unverified-policy", "unconfigured", "unpriced", "service-unavailable", "unknown-account", "unknown-job", "unknown-attempt",
  "conflicting-policy", "clock-regression", "period-inactive", "budget-exhausted", "job-budget-exhausted", "request-limit", "token-limit",
  "billed-unit-limit", "time-limit", "fallback-time-reserved", "priority-wait", "already-attempted", "dispatch-expired", "invalid-permit",
  "timeout", "uncertain-usage", "unverified-usage", "conflicting-reconciliation"]);
function synchronous(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
class PredictorFailure extends Error {
  readonly reason: PredictorReason;
  constructor(reason: PredictorReason) { super("Primary prediction could not complete. Private diagnostics are withheld."); this.reason = reason; }
}
export function parsePredictorRequest(input: unknown): PredictorRequest {
  if (input === null || typeof input !== "object" || Object.keys(input).some((key) =>
    !["pin", "snapshot", "job", "request", "maxElapsedMs"].includes(key))) throw new PredictorFailure("invalid-request");
  try {
    const value = input as PredictorRequest, pin = parseModelPin(value.pin), snapshot = parseEvidenceSnapshot(value.snapshot);
    const job = parseCostJob(value.job), request = parseCostRequest(value.request);
    if (!Number.isSafeInteger(value.maxElapsedMs) || value.maxElapsedMs < 1 || value.maxElapsedMs > 2_147_483_647 ||
      pin.invocationId !== request.attemptId || pin.jobId !== job.jobId || job.jobId !== request.jobId ||
      job.category !== "ai" || request.category !== "ai" || job.accountId !== request.accountId || job.fallbackReserveMs < 1 ||
      request.maximum.inputTokens < 1 || request.maximum.outputTokens < 1 || request.priority.kind !== "fixture" ||
      request.priority.kickoffAt !== snapshot.context.kickoffAt) throw new Error();
    return freezeEvidence({ pin, snapshot, job, request, maxElapsedMs: value.maxElapsedMs });
  } catch { throw new PredictorFailure("invalid-request"); }
}

/** One pinned candidate invocation. Evidence collection, retries, fallback,
 * revisions and public publication belong to their respective workflows. */
export function createPredictorService(options: Readonly<{
  registry: Pick<ModelRegistry, "resolve">; adapter: Pick<ReturnType<typeof createPrimaryAiAdapter>, "execute">;
  modelAuthority: ModelAuthority; evidenceAuthority: EvidenceAuthority; clock?: Clock; maxInflight: number;
  /** Proves the owning job's durable pin, fixture and exact approved cost intent. */
  verifyInvocation(pin: ModelPin, context: EvidenceContext, job: CostJobPolicy, request: CostRequest): boolean;
  verifyTransmission(source: EvidenceSource, context: EvidenceContext, model: ModelVersion): boolean;
  verifyTransport: PredictorOutputAuthority["verifyTransport"];
  verifyExplanation: PredictorOutputAuthority["verifyExplanation"];
  transform?: PredictorCalibrationOptions["transform"];
  verifyTransform?: PredictorCalibrationOptions["verifyTransform"];
}>) {
  if (!Number.isSafeInteger(options.maxInflight) || options.maxInflight < 1 || options.maxInflight > 100_000)
    throw new PredictorFailure("invalid-request");
  const now = () => utcInstantFromEpochMilliseconds(options.clock?.now() ?? Date.now());
  const inflight = new Map<string, Readonly<{ fingerprint: string; promise: Promise<PredictorResult> }>>();
  const denial = (reason: PredictorReason, dispatched: 0 | 1 = 0, unknown = false, markets?: MarketSnapshot): PredictorResult =>
    freezeEvidence({ status: "denied", reason, requestsDispatched: dispatched, requestCountUnknown: unknown,
      ...(markets === undefined ? {} : { markets }) });
  async function execute(input: PredictorRequest, startedAt: number, enteredNow: number): Promise<PredictorResult> {
    let lastNow = enteredNow, model: ModelVersion | undefined, prompt: BuiltPredictorPrompt | undefined;
    let dispatched: 0 | 1 = 0, countUnknown = false, adapterPending = false;
    const controller = new AbortController();
    const paidDeadline = Math.min(input.job.deadlineAt, input.job.startsAt + input.job.timeLimitMs) - input.job.fallbackReserveMs;
    if (paidDeadline <= enteredNow) return denial("fallback-time-reserved");
    const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(enteredNow + input.maxElapsedMs, paidDeadline, input.snapshot.context.kickoffAt));
    const monotonicLimitMs = Math.min(deadlineAt - enteredNow, input.maxElapsedMs);
    const remainingMs = monotonicLimitMs - (performance.now() - startedAt);
    if (remainingMs <= 0) return denial("timeout");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiration = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new PredictorFailure("timeout"));
    }, remainingMs); });
    void expiration.catch(() => undefined);
    function timeCheck() {
      let current: number; try { current = now(); } catch { throw new PredictorFailure("unavailable"); }
      if (current < lastNow) throw new PredictorFailure("clock-regression");
      lastNow = current;
      if (controller.signal.aborted || current >= deadlineAt || performance.now() - startedAt >= monotonicLimitMs)
        throw new PredictorFailure("timeout");
      if (current < input.snapshot.context.analysisAt) throw new PredictorFailure("invalid-timing");
    }
    function check() {
      timeCheck();
      try {
        if (synchronous(options.verifyInvocation(input.pin, input.snapshot.context, input.job, input.request)) !== true ||
          synchronous(options.evidenceAuthority.authorize(input.snapshot.context)) !== undefined ||
          synchronous(options.evidenceAuthority.verifyContext(input.snapshot.context)) !== true ||
          synchronous(options.evidenceAuthority.verifyPolicy(input.snapshot.policy)) !== true) throw new Error();
        if (model !== undefined) assertModelAuthorized(model, options.modelAuthority);
      } catch { throw new PredictorFailure("not-authorized"); }
      timeCheck();
    }
    const workflow: CostDispatchWorkflow = Object.freeze({ signal: controller.signal, deadlineAt, check });
    const evidenceAuthority: EvidenceAuthority = Object.freeze({
      authorize(context) { if (evidenceFingerprint(context) !== evidenceFingerprint(input.snapshot.context)) throw new Error(); check(); },
      verifyContext: (context) => options.evidenceAuthority.verifyContext(context),
      verifyPolicy: (policy) => options.evidenceAuthority.verifyPolicy(policy),
      verifySource: (source, context) => options.evidenceAuthority.verifySource(source, context),
      verifyReuse(source, context, policy) {
        timeCheck();
        return source.reuse.retainUntil < lastNow ? false : options.evidenceAuthority.verifyReuse(source, context, policy);
      },
    });
    const promptAuthority = Object.freeze({ evidence: evidenceAuthority,
      verifyModel(value: ModelVersion) { check(); return model?.id === value.id; },
      verifyTransmission: options.verifyTransmission });
    async function wait<Value>(operation: () => Promise<Value>): Promise<Value> {
      check();
      const pending = Promise.resolve().then(() => { check(); return operation(); });
      const result = await Promise.race([pending, expiration]); check(); return result;
    }
    try {
      check();
      const resolved = await wait(() => options.registry.resolve(input.pin));
      if (resolved.pin.id !== input.pin.id || resolved.model.id !== input.pin.modelVersionId ||
        resolved.model.provider !== input.request.provider || resolved.model.model !== input.request.model)
        throw new PredictorFailure("conflicting-pin");
      model = resolved.model; check();
      prompt = buildPredictorPrompt({ snapshot: input.snapshot, model, authority: promptAuthority }); check();
      const result = await wait(() => {
        adapterPending = true;
        return options.adapter.execute({ pin: input.pin, snapshot: input.snapshot, job: input.job, request: input.request,
          model: model!, prompt: prompt! }, workflow).then((value) => {
          adapterPending = false;
          if (value.requestsDispatched === 1) dispatched = 1;
          countUnknown = value.requestCountUnknown;
          return value;
        });
      });
      if (result.status === "denied") {
        if (!adapterReasons.has(result.reason) || ![0, 1].includes(result.requestsDispatched) || typeof result.requestCountUnknown !== "boolean")
          throw new PredictorFailure("unavailable");
        return denial(result.reason, dispatched, countUnknown);
      }
      if (result.status !== "completed" || result.requestsDispatched !== 1 || result.requestCountUnknown !== false)
        throw new PredictorFailure("unavailable");
      const validation = validatePredictorOutput(result.response.output, { snapshot: input.snapshot, model, metadata: result.response.metadata,
        authority: { modelAuthority: options.modelAuthority, evidenceAuthority,
          verifyTransport: options.verifyTransport, verifyExplanation: options.verifyExplanation }, now: now() });
      check();
      if (!validation.valid) return denial(validation.reason, dispatched, countUnknown);
      const calibrated = applyPredictorCalibration(validation.output, { model, authority: options.modelAuthority,
        ...(options.transform === undefined ? {} : { transform: options.transform }),
        ...(options.verifyTransform === undefined ? {} : { verifyTransform: options.verifyTransform }) });
      check(); assertPreparedPredictorPrompt(prompt, input.snapshot, model, promptAuthority); check();
      if (!calibrated.valid) return denial(calibrated.reason, dispatched, countUnknown);
      if (!["match-result", "total-goals", "both-teams-to-score"].some((family) =>
        calibrated.output.markets.markets[family as "match-result" | "total-goals" | "both-teams-to-score"].available))
        return denial("invalid-output", dispatched, countUnknown, calibrated.output.markets);
      timeCheck();
      if (!isPredictorOutputCurrent(calibrated.output, model, now())) return denial("invalid-timing", dispatched, countUnknown);
      return freezeEvidence({ status: "candidate", pin: input.pin, output: calibrated.output, requestsDispatched: 1, requestCountUnknown: false });
    } catch (error) {
      if (error instanceof PredictorFailure) return denial(error.reason, dispatched, countUnknown || adapterPending);
      try { timeCheck(); } catch (failure) { if (failure instanceof PredictorFailure) return denial(failure.reason, dispatched, countUnknown || adapterPending); }
      if (error instanceof PredictorPromptError) return denial(error.reason === "input-limit" || error.reason === "unsupported-version" ||
        error.reason === "invalid-model" ? "invalid-request" : error.reason, dispatched, countUnknown);
      if (error instanceof ModelRegistryError) return denial(error.reason, dispatched, countUnknown);
      return denial("unavailable", dispatched, countUnknown || adapterPending);
    } finally { controller.abort(); if (timer !== undefined) clearTimeout(timer); }
  }
  return Object.freeze({ predict(value: unknown): Promise<PredictorResult> {
    const startedAt = performance.now();
    let input: PredictorRequest, enteredNow: number;
    try { enteredNow = now(); input = parsePredictorRequest(value); } catch { return Promise.resolve(denial("invalid-request")); }
    const fingerprint = evidenceFingerprint(input), running = inflight.get(input.pin.invocationId);
    if (running) return running.fingerprint === fingerprint ? running.promise : Promise.resolve(denial("conflicting-invocation"));
    if (inflight.size >= options.maxInflight) return Promise.resolve(denial("capacity-exhausted"));
    const promise = execute(input, startedAt, enteredNow).finally(() => {
      if (inflight.get(input.pin.invocationId)?.promise === promise) inflight.delete(input.pin.invocationId);
    });
    inflight.set(input.pin.invocationId, { fingerprint, promise }); return promise;
  } });
}

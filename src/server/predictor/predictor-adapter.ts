import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import { assertOperationAllowed, type RuntimePolicy, type EvidenceVerifier } from "../config/runtime-policy.ts";
import type { CostJobPolicy, CostRequest, CostDenialReason } from "../cost-control/cost-contract.ts";
import { parseCostJob, parseCostRequest } from "../cost-control/cost-input.ts";
import { CostDispatchError, dispatchCostProvider, type CostDispatchWorkflow } from "../cost-control/cost-dispatch.ts";
import type { createCostGateway, CostTransportContext, CostTransportResponse } from "../cost-control/cost-gateway.ts";
import type { EvidenceSnapshot } from "../evidence/evidence-contract.ts";
import { parseEvidenceSnapshot, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { ModelAuthority, ModelPin, ModelVersion } from "./predictor-contract.ts";
import { parseModelPin, parseModelVersion } from "./predictor-input.ts";
import { assertPreparedPredictorPrompt, type BuiltPredictorPrompt } from "./predictor-prompt.ts";
import type { PredictorTransportMetadata } from "./predictor-output.ts";

export type PrimaryAiProviderResponse = Readonly<{ output: unknown; metadata: PredictorTransportMetadata }>;
/** An integration contract for the actually selected, reviewed API adapter.
 * No provider transport or model selection is supplied by this bridge. */
export type PrimaryAiProviderBinding = Readonly<{
  provider: string; model: string; providerModelVersion: string; contractVersion: string;
  generate(input: Readonly<{
    model: ModelVersion; pin: ModelPin; snapshot: EvidenceSnapshot; prompt: BuiltPredictorPrompt;
    transport: CostTransportContext; credential: string;
  }>): Promise<CostTransportResponse<PrimaryAiProviderResponse>>;
}>;
export type PrimaryAiInvocation = Readonly<{
  model: ModelVersion; pin: ModelPin; snapshot: EvidenceSnapshot; prompt: BuiltPredictorPrompt;
  job: CostJobPolicy; request: CostRequest;
}>;
export type PrimaryAiAdapterResult = Readonly<{
  status: "completed"; response: PrimaryAiProviderResponse; requestsDispatched: 1; requestCountUnknown: false;
}> | Readonly<{
  status: "denied"; reason: CostDenialReason | "not-authorized" | "invalid-response" | "unavailable";
  requestsDispatched: 0 | 1; requestCountUnknown: boolean;
}>;
function synchronous(value: unknown): unknown {
  if (value instanceof Promise) void value.catch(() => undefined);
  return value;
}

export function createPrimaryAiAdapter(options: Readonly<{
  runtimePolicy: RuntimePolicy; verifyEvidence: EvidenceVerifier; modelAuthority: ModelAuthority;
  gateway: Pick<ReturnType<typeof createCostGateway>, "execute">; binding: PrimaryAiProviderBinding | null; clock?: Clock;
  verifyBinding(binding: PrimaryAiProviderBinding, invocation: PrimaryAiInvocation): boolean;
}>) {
  const binding = options.binding === null ? null : Object.freeze({ ...options.binding });
  return Object.freeze({ async execute(input: PrimaryAiInvocation, workflow?: CostDispatchWorkflow): Promise<PrimaryAiAdapterResult> {
    let dispatched = false, reconciled = false, dispatchFailure: CostDispatchError["reason"] | undefined;
    const denied = (reason: Extract<PrimaryAiAdapterResult, { status: "denied" }>["reason"], unknown = false): PrimaryAiAdapterResult =>
      Object.freeze({ status: "denied", reason, requestsDispatched: dispatched ? 1 : 0, requestCountUnknown: dispatched && unknown });
    let invocation: PrimaryAiInvocation;
    try {
      if (input === null || typeof input !== "object" || Object.keys(input).some((key) =>
        !["model", "pin", "snapshot", "prompt", "job", "request"].includes(key))) throw new Error();
      const model = parseModelVersion(input.model), pin = parseModelPin(input.pin), snapshot = parseEvidenceSnapshot(input.snapshot);
      const job = parseCostJob(input.job), request = parseCostRequest(input.request);
      if (pin.modelVersionId !== model.id || pin.jobId !== job.jobId || pin.invocationId !== request.attemptId ||
        job.accountId !== request.accountId || job.jobId !== request.jobId || job.category !== "ai" || request.category !== "ai" ||
        request.provider !== model.provider || request.model !== model.model || request.maximum.outputTokens < 1 ||
        request.maximum.inputTokens < 1 || job.fallbackReserveMs < 1 || request.priority.kind !== "fixture" ||
        request.priority.kickoffAt !== snapshot.context.kickoffAt) throw new Error();
      assertPreparedPredictorPrompt(input.prompt, snapshot, model);
      invocation = Object.freeze({ model, pin, snapshot, prompt: input.prompt, job, request });
    } catch { return denied("invalid-request"); }
    if (binding === null) return denied("unconfigured");
    function authorize() {
      if (synchronous(workflow?.check()) !== undefined) throw new Error();
      const { choices } = options.runtimePolicy, model = invocation.model;
      const verify: EvidenceVerifier = (reference, requirement) => synchronous(options.verifyEvidence(reference, requirement)) === true;
      assertOperationAllowed(options.runtimePolicy, "ai", verify);
      if (synchronous(options.modelAuthority.authorize(model)) !== undefined ||
        synchronous(options.modelAuthority.verifyModel(model)) !== true || synchronous(options.modelAuthority.verifyCalibration(model)) !== true ||
        synchronous(options.modelAuthority.verifyEvaluation(model)) !== true || binding?.provider !== model.provider || binding.model !== model.model ||
        binding.providerModelVersion !== model.providerModelVersion || binding.contractVersion !== model.contractVersion ||
        model.provider !== choices.ai.provider || model.model !== choices.ai.model || typeof binding.generate !== "function" ||
        synchronous(options.verifyBinding(binding, invocation)) !== true || choices.ai.calibrationRef !== model.calibration.evidenceRef ||
        !verify(model.calibration.evidenceRef, "calibration-configuration") || choices.evidencePolicyRef === null ||
        choices.freshnessPolicyRef === null || !verify(choices.evidencePolicyRef, "evidence-policy") ||
        !verify(choices.freshnessPolicyRef, "freshness-policy")) throw new Error();
      assertPreparedPredictorPrompt(invocation.prompt, invocation.snapshot, invocation.model);
    }
    try { authorize(); } catch { return denied("not-authorized"); }
    try {
      const result = await options.gateway.execute(invocation.job, invocation.request, (transport) => dispatchCostProvider({
        job: invocation.job, transport, workflow, clock: options.clock, authorize,
        credential: () => options.runtimePolicy.secrets.aiKey?.read(),
      }, async ({ transport: boundedTransport, credential }) => {
        dispatched = true;
        return binding.generate(Object.freeze({ model: invocation.model, pin: invocation.pin, snapshot: invocation.snapshot,
          prompt: invocation.prompt, transport: boundedTransport, credential }));
      }).catch((error: unknown) => {
        if (!dispatched && error instanceof CostDispatchError) dispatchFailure = error.reason;
        throw error;
      }));
      if (result.status === "denied") return denied(!dispatched && dispatchFailure !== undefined ? dispatchFailure : result.reason, dispatched);
      reconciled = true;
      try { authorize(); } catch { return denied("not-authorized"); }
      const response = result.value;
      if (response === null || typeof response !== "object" || !Object.hasOwn(response, "output") || !Object.hasOwn(response, "metadata") ||
        Object.keys(response).length !== 2 || Buffer.byteLength(typeof response.output === "string" ? response.output :
          evidenceSerialize(response.output), "utf8") > invocation.model.bounds.maxOutputBytes) return denied("invalid-response");
      return freezeEvidence({ status: "completed", response, requestsDispatched: 1, requestCountUnknown: false });
    } catch { return denied(reconciled ? "invalid-response" : "unavailable", dispatched && !reconciled); }
  } });
}

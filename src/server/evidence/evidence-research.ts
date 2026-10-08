import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { assertOperationAllowed, type RuntimePolicy, type EvidenceVerifier } from "../config/runtime-policy.ts";
import type { CostJobPolicy, CostRequest, CostDenialReason } from "../cost-control/cost-contract.ts";
import { parseCostJob, parseCostRequest, parseCostEvidenceRef } from "../cost-control/cost-input.ts";
import type { createCostGateway, CostTransportContext, CostTransportResponse } from "../cost-control/cost-gateway.ts";
import type { EvidenceAuthority, EvidenceContext, EvidencePolicy, EvidenceSource, EvidenceWorkflow } from "./evidence-contract.ts";
import { EvidenceInputError, evidenceSerialize, freezeEvidence, parseEvidenceContext, parseEvidencePolicy, parseEvidenceSource } from "./evidence-input.ts";

export type ResearchEvidencePlan = Readonly<{
  job: CostJobPolicy; request: CostRequest; maxSources: number; targetIndependentSources: number; maxResponseBytes: number;
  maxExtractCharacters: number; evidenceRef: string;
}>;
/** Supplied only by the selected provider's reviewed server adapter. One search
 * is one bounded HTTP attempt, without implicit retries or article fetching.
 * No provider is selected or implemented by this integration contract. */
export type ResearchProviderBinding = Readonly<{
  provider: string; contractVersion: string; evidenceRef: string;
  search(input: Readonly<{
    context: EvidenceContext; policy: EvidencePolicy; plan: ResearchEvidencePlan;
    transport: CostTransportContext; credential: string;
  }>): Promise<CostTransportResponse<unknown>>;
}>;
export type ResearchEvidenceCollection = Readonly<{
  status: "completed"; sources: readonly EvidenceSource[]; requestsDispatched: 1; requestCountUnknown: false;
}> | Readonly<{
  status: "denied"; reason: "unconfigured" | "invalid-request" | "not-authorized" | "invalid-response" | "unavailable" | CostDenialReason;
  sources: readonly []; requestsDispatched: 0 | 1; requestCountUnknown: boolean;
}>;
type Gateway = Pick<ReturnType<typeof createCostGateway>, "execute">;
function synchronous(value: unknown): unknown {
  if (value instanceof Promise) void value.catch(() => undefined);
  return value;
}

export function parseResearchEvidencePlan(input: unknown, context: EvidenceContext, policy: EvidencePolicy): ResearchEvidencePlan {
  try {
    if (input === null || typeof input !== "object" || Object.keys(input).some((key) =>
      !["job", "request", "maxSources", "targetIndependentSources", "maxResponseBytes", "maxExtractCharacters", "evidenceRef"].includes(key))) throw new Error();
    const value = input as ResearchEvidencePlan, job = parseCostJob(value.job), request = parseCostRequest(value.request);
    if (job.category !== "research" || request.category !== "research" || request.model !== null || request.maximum.requests !== 1 ||
      job.jobId !== request.jobId || job.accountId !== request.accountId ||
      request.priority.kind !== "fixture" || request.priority.kickoffAt !== context.kickoffAt ||
      !Number.isSafeInteger(value.maxSources) || value.maxSources < 1 || value.maxSources > policy.bounds.maxSources ||
      !Number.isSafeInteger(value.targetIndependentSources) || value.targetIndependentSources < 1 || value.targetIndependentSources > value.maxSources ||
      !Number.isSafeInteger(value.maxResponseBytes) || value.maxResponseBytes < 1 || value.maxResponseBytes > policy.bounds.maxSnapshotBytes ||
      !Number.isSafeInteger(value.maxExtractCharacters) || value.maxExtractCharacters < 1 || value.maxExtractCharacters > value.maxResponseBytes)
      throw new Error();
    return freezeEvidence({ job, request, maxSources: value.maxSources, targetIndependentSources: value.targetIndependentSources, maxResponseBytes: value.maxResponseBytes,
      maxExtractCharacters: value.maxExtractCharacters, evidenceRef: parseCostEvidenceRef(value.evidenceRef) });
  } catch { throw new EvidenceInputError(); }
}

/** The cost gateway owns reservation, single-use dispatch, timeout and trusted
 * receipt reconciliation. This bridge owns evidence and licensing boundaries. */
export function createResearchEvidenceAdapter(options: Readonly<{
  runtimePolicy: RuntimePolicy; verifyEvidence: EvidenceVerifier; authority: EvidenceAuthority;
  gateway: Gateway; binding: ResearchProviderBinding | null;
  clock?: Clock;
  verifyBinding(binding: ResearchProviderBinding, context: EvidenceContext, plan: ResearchEvidencePlan): boolean;
}>) {
  const binding = options.binding === null ? null : Object.freeze({ provider: options.binding.provider,
    contractVersion: options.binding.contractVersion, evidenceRef: options.binding.evidenceRef, search: options.binding.search });
  const now = () => utcInstantFromEpochMilliseconds(options.clock?.now() ?? Date.now());
  return Object.freeze({ async collect(contextInput: EvidenceContext, policyInput: EvidencePolicy,
    planInput: ResearchEvidencePlan, workflow?: EvidenceWorkflow): Promise<ResearchEvidenceCollection> {
    let dispatched = false, reconciled = false;
    const denied = (reason: Extract<ResearchEvidenceCollection, { status: "denied" }>["reason"], unknown = false): ResearchEvidenceCollection =>
      Object.freeze({ status: "denied", reason, sources: Object.freeze([]) as readonly [],
        requestsDispatched: dispatched ? 1 : 0, requestCountUnknown: dispatched && unknown });
    let context: EvidenceContext, policy: EvidencePolicy, selected: ResearchEvidencePlan;
    try {
      context = parseEvidenceContext(contextInput); policy = parseEvidencePolicy(policyInput);
      selected = parseResearchEvidencePlan(planInput, context, policy);
      if (workflow !== undefined) utcInstantFromEpochMilliseconds(workflow.deadlineAt);
    } catch { return denied("invalid-request"); }
    if (binding === null) return denied("unconfigured");
    function authorize() {
      const { choices } = options.runtimePolicy;
      workflow?.check();
      if (workflow !== undefined && (workflow.signal.aborted ||
        now() >= workflow.deadlineAt)) throw new EvidenceInputError("not-authorized");
      const verify: EvidenceVerifier = (reference, requirement) => synchronous(options.verifyEvidence(reference, requirement)) === true;
      assertOperationAllowed(options.runtimePolicy, "research", verify);
      parseCostEvidenceRef(binding?.evidenceRef);
      if (synchronous(options.authority.authorize(context)) !== undefined || synchronous(options.authority.verifyContext(context)) !== true ||
        synchronous(options.authority.verifyPolicy(policy)) !== true || typeof binding?.search !== "function" ||
        binding.provider !== choices.research.provider || binding.provider !== selected.request.provider ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(binding.contractVersion) || synchronous(options.verifyBinding(binding, context, selected)) !== true ||
        choices.evidencePolicyRef === null || choices.freshnessPolicyRef === null ||
        !verify(choices.evidencePolicyRef, "evidence-policy") || !verify(choices.freshnessPolicyRef, "freshness-policy"))
        throw new EvidenceInputError("not-authorized");
    }
    try { authorize(); } catch { return denied("not-authorized"); }
    try {
      const result = await options.gateway.execute(selected.job, selected.request, async (transport) => {
        const enteredAt = performance.now(), enteredNow = now(), launchWindow = transport.permit.launchBefore - enteredNow;
        // Source text is never passed to this authority boundary or interpreted as instructions.
        authorize();
        if (transport.signal.aborted) throw new EvidenceInputError("not-authorized");
        const credential = options.runtimePolicy.secrets.researchKey?.read();
        if (!credential) throw new EvidenceInputError("not-authorized");
        workflow?.check();
        const currentNow = now(), elapsed = performance.now() - enteredAt;
        const paidDeadline = Math.min(selected.job.deadlineAt, selected.job.startsAt + selected.job.timeLimitMs) - selected.job.fallbackReserveMs;
        const timeoutMs = Math.floor(Math.min(transport.timeoutMs - elapsed, paidDeadline - currentNow,
          workflow === undefined ? Infinity : workflow.deadlineAt - currentNow));
        if (transport.signal.aborted || workflow?.signal.aborted || currentNow < enteredNow ||
          currentNow >= transport.permit.launchBefore || elapsed >= launchWindow || timeoutMs < 1)
          throw new EvidenceInputError("not-authorized");
        const boundedTransport = Object.freeze({ ...transport, timeoutMs,
          signal: workflow === undefined ? transport.signal : AbortSignal.any([transport.signal, workflow.signal]) });
        dispatched = true;
        return binding.search(Object.freeze({ context, policy, plan: selected, transport: boundedTransport, credential }));
      });
      if (result.status === "denied") return denied(result.reason, dispatched);
      reconciled = true;
      // Known usage is reconciled even when the provider's normalized evidence is invalid.
      try { authorize(); } catch { return denied("not-authorized"); }
      const value = result.value;
      if (value === null || typeof value !== "object" || Object.keys(value).length !== 1 || !("sources" in value) ||
        !Array.isArray(value.sources) || value.sources.length > selected.maxSources ||
        Buffer.byteLength(evidenceSerialize(value), "utf8") > selected.maxResponseBytes) return denied("invalid-response");
      const sources = value.sources.map((source: unknown) => parseEvidenceSource(source, policy));
      let characters = 0;
      for (const source of sources) {
        if (source.kind !== "news") return denied("invalid-response");
        characters += source.claims.reduce((sum, claim) => sum + claim.summary.length +
          Object.values(claim.value).reduce<number>((total, item) => total + (typeof item === "string" ? item.length : 0), 0), 0);
      }
      if (characters > selected.maxExtractCharacters) return denied("invalid-response");
      authorize();
      return freezeEvidence({ status: "completed", sources, requestsDispatched: 1, requestCountUnknown: false });
    } catch { return denied(reconciled ? "invalid-response" : "unavailable", dispatched && !reconciled); }
  } });
}

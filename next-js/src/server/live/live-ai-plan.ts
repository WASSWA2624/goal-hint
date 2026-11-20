import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { RuntimePolicy } from "../config/runtime-policy.ts";
import type { CostJobAllocation } from "../cost-control/cost-policy.ts";
import type { CostJobPolicy, CostRequest } from "../cost-control/cost-contract.ts";
import { priceCost } from "../cost-control/cost-pricing.ts";
import type { EvidencePolicy, EvidenceSource } from "../evidence/evidence-contract.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import type { ForecastSourceOrder } from "../fallback/fallback-contract.ts";
import type { ModelVersion } from "../predictor/predictor-contract.ts";
import { predictorResilience } from "../predictor/predictor-resilience.ts";
import { openAiTransportRules } from "../predictor/openai-transport.ts";
import type { RefreshMember, RefreshPlan } from "../refresh/refresh-contract.ts";
import { refreshReference } from "../refresh/refresh-input.ts";
import { fallbackRefreshPlan, type LiveReferences, type RefreshPacing } from "./live-plan.ts";
import { liveResearchRules } from "./live-research-policy.ts";
import { liveAiAccountId, liveAiRate } from "./live-ai-model.ts";

export function liveAiEvidencePolicy(refs: LiveReferences): EvidencePolicy {
  const freshness = { maxAgeMs: 7 * 86_400_000, basis: "retrieved", unknownTimestamp: "allow-flagged", conflicts: "preserve" } as const;
  return freezeEvidence({ version: "goal-hint-football-primary-evidence-v1", evidenceRef: refs.evidence,
    freshness: { football: freshness, news: { ...freshness, basis: "published" } },
    minimum: { historyPerTeam: 3, formPerTeam: 1, statisticsPerTeam: 0, requireVenue: true, requireRest: true, newsSources: 0 },
    bounds: { maxSources: 32, maxClaimsPerSource: 16, maxSummaryCharacters: 500, maxTitleCharacters: 200,
      maxPublisherCharacters: 100, maxValueCharacters: 500, maxSourceBytes: 20_000, maxSnapshotBytes: 64_000 } });
}

export function liveAiAllocation(policy: RuntimePolicy, model: ModelVersion, at: number, fallbackReserveMs: number,
  coordinated = false): CostJobAllocation {
  const { tokenLimit, timeoutSeconds, requestLimit } = policy.choices.job;
  if (tokenLimit === null || tokenLimit < 4096 || timeoutSeconds === null || requestLimit === null || requestLimit < 1)
    throw new Error("AI needs explicit request, token and time limits.");
  const evidenceRef = policy.choices.budgets.approvalRef;
  if (evidenceRef === null) throw new Error("AI accounting approval is required.");
  const research = policy.capabilities.research ? { costCapUsdPicos: liveResearchRules.requestUsdPicos,
    requestLimit: 1, inputTokenLimit: 0, outputTokenLimit: 0, billedUnitLimit: 0, primaryTimeLimitMs: liveResearchRules.timeoutMs } : null;
  if (research !== null && requestLimit < 2) throw new Error("AI and research require two bounded requests.");
  // The retry reserves a full second request and cannot use the fallback time or
  // shrink the primary request below the reviewed transport's input budget.
  const maximumRequests = 1 + predictorResilience.transientRetries;
  const fullInputBudget = model.bounds.maxInputBytes + 4096 + openAiTransportRules.inputFramingTokens;
  const attempts = coordinated && requestLimit - (research?.requestLimit ?? 0) >= maximumRequests &&
    Math.floor(tokenLimit * 0.85 / maximumRequests) >= fullInputBudget ? maximumRequests : 1;
  const inputPerAttempt = Math.min(70_000, Math.floor(tokenLimit * 0.85 / attempts));
  const outputPerAttempt = Math.min(8192, Math.floor((tokenLimit - attempts * inputPerAttempt) / attempts));
  const primaryTimeLimitMs = Math.min(120_000, timeoutSeconds * 1000 - fallbackReserveMs - (research?.primaryTimeLimitMs ?? 0));
  if (outputPerAttempt < 1024 || primaryTimeLimitMs < 20_000) throw new Error("The job does not leave usable AI and fallback time.");
  const maximum = { requests: 1, inputTokens: inputPerAttempt, outputTokens: outputPerAttempt, billedUnits: inputPerAttempt };
  return freezeEvidence({ ai: { costCapUsdPicos: BigInt(attempts) * priceCost(liveAiRate(model, utcInstantFromEpochMilliseconds(at)), maximum),
    requestLimit: attempts, inputTokenLimit: attempts * inputPerAttempt, outputTokenLimit: attempts * outputPerAttempt,
    billedUnitLimit: attempts * inputPerAttempt, primaryTimeLimitMs },
    research, fallbackReserveMs, evidenceRef });
}

/** Frozen plan uses stored sources already available by the member's captured analysis cutoff. The source order is
 * frozen with the AI allocation; a plan without usable AI time stays the fallback-only plan, without an order. */
export function liveAiRefreshPlan(member: RefreshMember, refs: LiveReferences, policy: RuntimePolicy, model: ModelVersion,
  sources: readonly EvidenceSource[], pacing: RefreshPacing = "standard", sourceOrder: ForecastSourceOrder = "ai-first",
  coordinated = false): RefreshPlan {
  const base = fallbackRefreshPlan(member, refs, pacing), reserve = member.entry.envelope.fallbackReserveMs;
  const allocation = liveAiAllocation(policy, model, member.now, reserve, coordinated).ai!;
  const timeLimitMs = Math.min(member.entry.envelope.timeoutMs, allocation.primaryTimeLimitMs + reserve);
  const evidenceMs = 10_000;
  const maximumMs = Math.min(timeLimitMs, base.observation.bounds.deadlineAt - member.now) - reserve - evidenceMs;
  if (maximumMs < 1000) return base;
  const accountId = liveAiAccountId(policy), rate = liveAiRate(model, member.context.analysisAt);
  const job: CostJobPolicy = { accountId, category: "ai", jobId: member.jobId, workKey: refreshReference(member.jobId, "primary-ai"),
    costCapUsdPicos: allocation.costCapUsdPicos, requestLimit: allocation.requestLimit, inputTokenLimit: allocation.inputTokenLimit,
    outputTokenLimit: allocation.outputTokenLimit, billedUnitLimit: allocation.billedUnitLimit,
    startsAt: base.evidence.context.analysisAt, deadlineAt: base.observation.bounds.deadlineAt, timeLimitMs,
    fallbackReserveMs: reserve, evidenceRef: policy.choices.budgets.approvalRef! };
  const request: CostRequest = { accountId, category: "ai", attemptId: refreshReference(member.jobId, "ai"), jobId: member.jobId,
    rateVersion: rate.version, provider: model.provider, model: model.model,
    maximum: { requests: 1, inputTokens: allocation.inputTokenLimit / allocation.requestLimit,
      outputTokens: allocation.outputTokenLimit / allocation.requestLimit, billedUnits: allocation.billedUnitLimit / allocation.requestLimit },
    timeoutMs: coordinated ? Math.min(predictorResilience.callTimeoutMs, Math.max(1, Math.floor((maximumMs - 1000) / allocation.requestLimit))) : maximumMs,
    priority: { kind: "fixture", kickoffAt: member.context.kickoffAt }, evidenceRef: refs.refresh };
  return freezeEvidence({ ...base, modelVersionId: model.id,
    evidence: { ...base.evidence, policy: liveAiEvidencePolicy(refs), cachedSources: sources, maxElapsedMs: evidenceMs },
    ai: { job, request, maxElapsedMs: maximumMs }, sourceOrder });
}

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

export function liveAiAllocation(policy: RuntimePolicy, model: ModelVersion, at: number, fallbackReserveMs: number): CostJobAllocation {
  const { tokenLimit, timeoutSeconds, requestLimit } = policy.choices.job;
  if (tokenLimit === null || tokenLimit < 4096 || timeoutSeconds === null || requestLimit === null || requestLimit < 1)
    throw new Error("AI needs explicit request, token and time limits.");
  const evidenceRef = policy.choices.budgets.approvalRef;
  if (evidenceRef === null) throw new Error("AI accounting approval is required.");
  // UTF-8 bytes provide a conservative transport bound; ordinary ten-match inputs exceed 24k bytes.
  const inputTokenLimit = Math.min(70_000, Math.floor(tokenLimit * 0.85)), outputTokenLimit = Math.min(8192, tokenLimit - inputTokenLimit);
  const research = policy.capabilities.research ? { costCapUsdPicos: liveResearchRules.requestUsdPicos,
    requestLimit: 1, inputTokenLimit: 0, outputTokenLimit: 0, billedUnitLimit: 0, primaryTimeLimitMs: liveResearchRules.timeoutMs } : null;
  if (research !== null && requestLimit < 2) throw new Error("AI and research require two bounded requests.");
  const primaryTimeLimitMs = Math.min(120_000, timeoutSeconds * 1000 - fallbackReserveMs - (research?.primaryTimeLimitMs ?? 0));
  if (outputTokenLimit < 1024 || primaryTimeLimitMs < 20_000) throw new Error("The job does not leave usable AI and fallback time.");
  const maximum = { requests: 1, inputTokens: inputTokenLimit, outputTokens: outputTokenLimit, billedUnits: inputTokenLimit };
  return freezeEvidence({ ai: { costCapUsdPicos: priceCost(liveAiRate(model, utcInstantFromEpochMilliseconds(at)), maximum),
    requestLimit: 1, inputTokenLimit, outputTokenLimit, billedUnitLimit: inputTokenLimit, primaryTimeLimitMs },
    research, fallbackReserveMs, evidenceRef });
}

/** Frozen plan uses stored sources already available by the member's captured analysis cutoff. The source order is
 * frozen with the AI allocation; a plan without usable AI time stays the fallback-only plan, without an order. */
export function liveAiRefreshPlan(member: RefreshMember, refs: LiveReferences, policy: RuntimePolicy, model: ModelVersion,
  sources: readonly EvidenceSource[], pacing: RefreshPacing = "standard", sourceOrder: ForecastSourceOrder = "ai-first"): RefreshPlan {
  const base = fallbackRefreshPlan(member, refs, pacing), reserve = member.entry.envelope.fallbackReserveMs;
  const allocation = liveAiAllocation(policy, model, member.now, reserve).ai!;
  const timeLimitMs = Math.min(member.entry.envelope.timeoutMs, allocation.primaryTimeLimitMs + reserve);
  const evidenceMs = 10_000;
  const maximumMs = Math.min(timeLimitMs, base.observation.bounds.deadlineAt - member.now) - reserve - evidenceMs;
  if (maximumMs < 1000) return base;
  const accountId = liveAiAccountId(policy), rate = liveAiRate(model, member.context.analysisAt);
  const job: CostJobPolicy = { accountId, category: "ai", jobId: member.jobId, workKey: refreshReference(member.jobId, "primary-ai"),
    costCapUsdPicos: allocation.costCapUsdPicos, requestLimit: 1, inputTokenLimit: allocation.inputTokenLimit,
    outputTokenLimit: allocation.outputTokenLimit, billedUnitLimit: allocation.billedUnitLimit,
    startsAt: base.evidence.context.analysisAt, deadlineAt: base.observation.bounds.deadlineAt, timeLimitMs,
    fallbackReserveMs: reserve, evidenceRef: policy.choices.budgets.approvalRef! };
  const request: CostRequest = { accountId, category: "ai", attemptId: refreshReference(member.jobId, "ai"), jobId: member.jobId,
    rateVersion: rate.version, provider: model.provider, model: model.model,
    maximum: { requests: 1, inputTokens: allocation.inputTokenLimit, outputTokens: allocation.outputTokenLimit, billedUnits: allocation.billedUnitLimit },
    timeoutMs: maximumMs, priority: { kind: "fixture", kickoffAt: member.context.kickoffAt }, evidenceRef: refs.refresh };
  return freezeEvidence({ ...base, modelVersionId: model.id,
    evidence: { ...base.evidence, policy: liveAiEvidencePolicy(refs), cachedSources: sources, maxElapsedMs: evidenceMs },
    ai: { job, request, maxElapsedMs: maximumMs }, sourceOrder });
}

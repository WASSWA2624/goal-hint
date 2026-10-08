import "server-only";

import { z } from "zod";
import { assertOperationAllowed, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import type { CostAuthority, CostCategory, CostJobPolicy, CostRateCard, CostRequest, CostStore } from "./cost-contract.ts";
import { parseCostAmount, parseCostEvidenceRef, costUsdPicosFromCents } from "./cost-input.ts";
import { createCostService } from "./cost-service.ts";

export type CostCategoryAllocation = Readonly<{
  costCapUsdPicos: bigint; requestLimit: number; inputTokenLimit: number; outputTokenLimit: number;
  billedUnitLimit: number; primaryTimeLimitMs: number;
}>;
export type CostJobAllocation = Readonly<{
  ai: CostCategoryAllocation | null; research: CostCategoryAllocation | null;
  fallbackReserveMs: number; evidenceRef: string;
}>;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const duration = count.positive().max(2_147_483_647);
const allocationCategorySchema = z.object({ costCapUsdPicos: z.bigint().transform(parseCostAmount),
  requestLimit: count.positive(), inputTokenLimit: count, outputTokenLimit: count,
  billedUnitLimit: count, primaryTimeLimitMs: duration }).strict().nullable();
const allocationSchema = z.object({ ai: allocationCategorySchema, research: allocationCategorySchema,
  fallbackReserveMs: duration, evidenceRef: z.string().transform(parseCostEvidenceRef) }).strict();
function snapshot(input: unknown): CostJobAllocation | null {
  try {
    const value = allocationSchema.parse(input);
    if (value.ai !== null) Object.freeze(value.ai);
    if (value.research !== null) Object.freeze(value.research);
    return Object.freeze(value);
  } catch { return null; }
}
function withinGlobalLimits(allocation: CostJobAllocation, policy: RuntimePolicy): boolean {
  const { requestLimit, tokenLimit, timeoutSeconds } = policy.choices.job;
  if (requestLimit === null || timeoutSeconds === null || !Number.isSafeInteger(timeoutSeconds * 1000)) return false;
  let requests = 0n, tokens = 0n, primaryMs = 0n;
  for (const category of ["ai", "research"] as const) {
    const assigned = allocation[category];
    if (policy.capabilities[category] !== (assigned !== null)) return false;
    if (assigned === null) continue;
    requests += BigInt(assigned.requestLimit);
    tokens += BigInt(assigned.inputTokenLimit) + BigInt(assigned.outputTokenLimit);
    primaryMs += BigInt(assigned.primaryTimeLimitMs);
  }
  return requests <= BigInt(requestLimit) && (tokenLimit === null ? tokens === 0n : tokens <= BigInt(tokenLimit))
    && primaryMs + BigInt(allocation.fallbackReserveMs) <= BigInt(timeoutSeconds) * 1000n;
}

/**
 * Bind durable accounting to the existing paid-operation gate and one verified,
 * immutable joint allocation. Category caps remain independent, while the sum
 * of AI/research request, token and primary-time allocations fits the global
 * job limits with fallback reserved once. Missing settings and unverifiable
 * allocations authorize no paid work. All resolvers/verifiers are local; this
 * factory performs no network calls or environment mutation.
 */
export function createPolicyCostService(options: Readonly<{
  accountId: string; category: CostCategory; store: CostStore; authority: CostAuthority;
  rateFor(request: CostRequest): CostRateCard | null;
  runtimePolicy: RuntimePolicy; verifyEvidence?: EvidenceVerifier;
  allocation: CostJobAllocation | null;
  verifyAllocation(allocation: CostJobAllocation, policy: RuntimePolicy): boolean;
}>) {
  const policy = options.runtimePolicy, allocation = snapshot(options.allocation), category = options.category;
  function allocated(): boolean {
    if (allocation === null || !withinGlobalLimits(allocation, policy)) return false;
    try { return options.verifyAllocation(allocation, policy) === true; } catch { return false; }
  }
  function selected(provider: string, model: string | null): boolean {
    return category === "ai" ? provider === policy.choices.ai.provider && model === policy.choices.ai.model
      : provider === policy.choices.research.provider && model === null;
  }
  function jobFits(job: CostJobPolicy): boolean {
    const assigned = allocation?.[category];
    if (!allocated() || assigned === null || assigned === undefined || allocation === null) return false;
    return job.accountId === options.accountId && job.category === category && job.costCapUsdPicos <= assigned.costCapUsdPicos
      && job.requestLimit <= assigned.requestLimit && job.inputTokenLimit <= assigned.inputTokenLimit
      && job.outputTokenLimit <= assigned.outputTokenLimit && job.billedUnitLimit <= assigned.billedUnitLimit
      && job.fallbackReserveMs === allocation.fallbackReserveMs
      && job.timeLimitMs === assigned.primaryTimeLimitMs + allocation.fallbackReserveMs;
  }
  const authority: CostAuthority = {
    authorize(requestedCategory) {
      if (requestedCategory !== category || !allocated()) throw new Error("Cost allocation is not authorized.");
      assertOperationAllowed(policy, category, options.verifyEvidence);
      options.authority.authorize(requestedCategory);
    },
    verifyPeriod(period) {
      const cap = category === "ai" ? policy.choices.budgets.aiMonthlyUsdCents : policy.choices.budgets.researchMonthlyUsdCents;
      return allocated() && cap !== null && period.category === category && period.accountId === options.accountId
        && period.capUsdPicos === costUsdPicosFromCents(cap) && options.authority.verifyPeriod(period);
    },
    verifyJob: (job) => jobFits(job) && options.authority.verifyJob(job),
    verifyRate: (rate) => rate.category === category && selected(rate.provider, rate.model) && options.authority.verifyRate(rate),
    verifyRequest: (request, job, period, rate) => jobFits(job) && selected(request.provider, request.model)
      && request.accountId === options.accountId && request.category === category
      && options.authority.verifyRequest(request, job, period, rate),
    verifyUsage: (usage, attempt) => options.authority.verifyUsage(usage, attempt),
  };
  return createCostService({ accountId: options.accountId, category, store: options.store, authority, rateFor: options.rateFor });
}

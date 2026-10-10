import "server-only";

import { z } from "zod";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { parseEvidenceCollectionRequest } from "../evidence/evidence-service.ts";
import { parseCostJob, parseCostRequest } from "../cost-control/cost-input.ts";
import { parseCatalogImportRequest, parseCatalogEvidenceRef } from "../football/catalog-input.ts";
import { createModelPin } from "../predictor/predictor-input.ts";
import { parseProviderFallbackRequest } from "../fallback/fallback-adapter.ts";
import { refreshFail, type RefreshMember, type RefreshPlan } from "./refresh-contract.ts";

export const refreshPayload = z.strictObject({ input: z.unknown(), runId: z.uuid(), fixtureId: z.uuid(), cycleId: z.uuid(),
  runDate: z.iso.date(), rank: z.number().int().nonnegative() });
export const refreshReference = (jobId: string, phase: string) => evidenceFingerprint({ jobId, phase, version: 1 });
const duration = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
/** One HTTP dispatch per phase. Retries only wait out undispatched quota pacing, because a
 * dispatched attempt consumes the single request allowance. */
const singleDispatch = (bounds: Readonly<{ maxRequests: number; retry: Readonly<{ maxAttempts: number }> }>) =>
  bounds.retry.maxAttempts === 1 || bounds.maxRequests === 1;
export function parseRefreshPlan(input: RefreshPlan, member: RefreshMember): RefreshPlan {
  try {
    const shape = z.strictObject({ version: z.literal(1), evidenceRef: z.string(), modelVersionId: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
      evidence: z.unknown(), ai: z.strictObject({ job: z.unknown(), request: z.unknown(), maxElapsedMs: z.number() }).nullable(),
      fallback: z.strictObject({ bounds: z.unknown(), maxElapsedMs: z.number() }),
      observation: z.strictObject({ bounds: z.unknown(), maxAgeMs: z.number() }), publicationReserveMs: z.number(),
      footballRequestLimit: z.number().int().positive().max(4_294_967_295) });
    shape.parse(input);
    // Provider-fallback-only plans omit both the model and its AI allocation.
    if ((input.ai === null) !== (input.modelVersionId === null)) throw new Error();
    const evidence = parseEvidenceCollectionRequest(input.evidence);
    const ai = input.ai === null ? null : { job: parseCostJob(input.ai.job), request: parseCostRequest(input.ai.request), maxElapsedMs: input.ai.maxElapsedMs };
    const bounds = (value: unknown) => parseCatalogImportRequest({ id: member.context.fixtureId,
      selection: { kind: "fixtures", query: { fixtureId: member.context.externalFixtureId } }, bounds: value,
      retentionEvidenceRef: input.evidenceRef }).bounds;
    const observation = { ...input.observation, bounds: bounds(input.observation.bounds) };
    const fallback = { ...input.fallback, bounds: input.fallback.bounds === null ? null : parseProviderFallbackRequest({
      context: member.context, jobId: member.jobId, requestedGroups: ["match-result", "total-goals", "both-teams-to-score"], bounds: input.fallback.bounds }).bounds };
    const hardDeadline = Math.min(member.entry.envelope.expiresAt, member.now + member.entry.envelope.timeoutMs, member.cycle.cutoffAt);
    const reserve = member.entry.envelope.fallbackReserveMs;
    if (ai !== null) {
      const { job, request } = ai;
      if (request.attemptId !== refreshReference(member.jobId, "ai") || request.jobId !== member.jobId || job.jobId !== member.jobId ||
        job.category !== "ai" || request.category !== "ai" || request.accountId !== job.accountId ||
        job.startsAt !== member.now || job.deadlineAt > hardDeadline || job.fallbackReserveMs !== reserve ||
        request.priority.kind !== "fixture" || request.priority.kickoffAt !== member.context.kickoffAt || request.maximum.requests !== 1 ||
        request.maximum.inputTokens < 1 || request.maximum.outputTokens < 1 || job.requestLimit < 1 ||
        request.maximum.inputTokens > job.inputTokenLimit || request.maximum.outputTokens > job.outputTokenLimit ||
        request.timeoutMs > ai.maxElapsedMs || !duration(ai.maxElapsedMs)) throw new Error();
    }
    // Without AI, evidence and fallback share the refresh job's own deadline.
    const primaryLimitMs = ai === null ? hardDeadline - member.now : Math.min(ai.job.timeLimitMs, ai.job.deadlineAt - ai.job.startsAt);
    if (evidenceFingerprint(evidence.context) !== evidenceFingerprint(member.context) || evidence.requestId !== refreshReference(member.jobId, "evidence") ||
      (evidence.footballPlan?.maxRequests ?? 0) + (fallback.bounds?.maxRequests ?? 0) + observation.bounds.maxRequests > input.footballRequestLimit ||
      ![evidence.maxElapsedMs, fallback.maxElapsedMs, observation.maxAgeMs, input.publicationReserveMs].every(duration) ||
      reserve < fallback.maxElapsedMs + observation.bounds.timeoutMs * observation.bounds.maxRequests + input.publicationReserveMs ||
      evidence.maxElapsedMs + (ai?.maxElapsedMs ?? 0) > primaryLimitMs - reserve ||
      observation.bounds.deadlineAt > hardDeadline || !singleDispatch(observation.bounds) ||
      fallback.bounds && (fallback.bounds.deadlineAt > hardDeadline || !singleDispatch(fallback.bounds)) ||
      evidence.footballPlan && (evidence.footballPlan.bounds.deadlineAt > hardDeadline - reserve || evidence.footballPlan.bounds.retry.maxAttempts !== 1))
      throw new Error();
    const research = evidence.researchPlan;
    if (research && (research.job.jobId !== member.jobId || research.job.startsAt !== member.now || research.job.deadlineAt > hardDeadline ||
      research.job.fallbackReserveMs !== reserve || research.request.attemptId !== refreshReference(member.jobId, "research") ||
      research.request.timeoutMs > evidence.maxElapsedMs || research.job.timeLimitMs > (ai?.job.timeLimitMs ?? primaryLimitMs))) throw new Error();
    return freezeEvidence({ ...input, evidenceRef: parseCatalogEvidenceRef(input.evidenceRef), evidence, ai, fallback, observation });
  } catch { return refreshFail("policy-required"); }
}
/** Provider-fallback-only plans have no model to pin. */
export function refreshPin(member: RefreshMember, plan: RefreshPlan) {
  if (plan.ai === null || plan.modelVersionId === null) return null;
  return createModelPin({ version: 1, jobId: member.jobId, invocationId: plan.ai.request.attemptId, modelVersionId: plan.modelVersionId });
}

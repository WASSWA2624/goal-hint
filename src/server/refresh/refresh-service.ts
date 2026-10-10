import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { EvidenceWorkflow } from "../evidence/evidence-contract.ts";
import type { createCostService } from "../cost-control/cost-service.ts";
import type { createEvidenceService, EvidenceServiceResult } from "../evidence/evidence-service.ts";
import { freezeEvidence, evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { createFallbackService, FallbackRefreshRequest, FallbackRefreshResult } from "../fallback/fallback-service.ts";
import { parseFallbackAiResult, parseResolvedForecastCandidate } from "../fallback/fallback-input.ts";
import { defineJob, type JobHandlerContext, type JobOutcome } from "../jobs/job-registry.ts";
import type { JobUsage } from "../jobs/job-contract.ts";
import { ModelRegistryError, type ModelRegistry } from "../predictor/predictor-registry.ts";
import type { createPredictorService, PredictorResult } from "../predictor/predictor-service.ts";
import type { createScheduleLifecycleService } from "../predictions/lifecycle-service.ts";
import type { createRevisionPublicationService } from "../predictions/publication-service.ts";
import type { PublicationResult } from "../predictions/publication-contract.ts";
import { RevisionPublicationError } from "../predictions/publication-contract.ts";
import type { DailySelectionStore } from "../selection/selection-mysql-store.ts";
import { PredictionRefreshError, refreshFail, type RefreshAuthority, type RefreshIntent, type RefreshMember,
  type RefreshOutcome, type RefreshPhase, type RefreshPlan } from "./refresh-contract.ts";
import { parseRefreshPlan, refreshPayload, refreshPin, refreshReference } from "./refresh-input.ts";
import type { RefreshStore } from "./refresh-mysql-store.ts";
import type { createRefreshObservationCollector } from "./refresh-observation.ts";

class PhaseTimeout extends Error {}
type CostReader = Pick<ReturnType<typeof createCostService>, "jobSummary">;
type Observation = Awaited<ReturnType<ReturnType<typeof createRefreshObservationCollector>["collect"]>>;
function checked(value: unknown, expected: unknown) {
  if (value !== expected) { void Promise.resolve(value).catch(() => {}); return refreshFail("unauthorized"); }
}
/** One immutable daily manifest member. All forecast acceptance remains in the
 * existing predictor, fallback resolver and atomic publication service. */
export function createPredictionRefreshService(options: Readonly<{
  type: string; handlerVersion: number; store: RefreshStore; selection: Pick<DailySelectionStore, "progress" | "inspect">;
  authority: RefreshAuthority; configure(member: RefreshMember): RefreshPlan;
  models: Pick<ModelRegistry, "resolve">; evidence: Pick<ReturnType<typeof createEvidenceService>, "collect">;
  predictor: Pick<ReturnType<typeof createPredictorService>, "predict">;
  fallback: Pick<ReturnType<typeof createFallbackService>, "resolve" | "resolveWithoutProvider">;
  observation: Pick<ReturnType<typeof createRefreshObservationCollector>, "collect">;
  lifecycle: Pick<ReturnType<typeof createScheduleLifecycleService>, "observe" | "refreshEligibility">;
  publisher: Pick<ReturnType<typeof createRevisionPublicationService>, "publish">;
  costs: Readonly<{ ai: CostReader | null; research: CostReader | null }>; clock?: Clock;
}>) {
  const now = () => utcInstantFromEpochMilliseconds(options.clock?.now() ?? Date.now());
  async function costs(jobId: string): Promise<RefreshOutcome["costs"]> {
    const read = async (service: CostReader | null) => {
      if (!service) return null;
      try { return await service.jobSummary(jobId); } catch { return { status: "denied", reason: "service-unavailable" }; }
    };
    const [ai, research] = await Promise.all([read(options.costs.ai), read(options.costs.research)]);
    return freezeEvidence({ ai, research });
  }
  async function reconcileRun(runId: string) {
    const selected = await options.selection.inspect(runId);
    if (!selected?.manifest) return refreshFail("invalid-request");
    const summaries = new Map<string, RefreshOutcome["costs"]>();
    for (const jobId of await options.store.unrecordedTerminal(runId)) {
      summaries.set(jobId, await costs(jobId));
    }
    await options.store.reconcileTerminal(runId, summaries);
    const progress = await options.selection.progress(runId);
    return freezeEvidence({ ...progress, finished: progress.terminal === progress.total });
  }
  async function handle(context: JobHandlerContext): Promise<JobOutcome> {
    const lease = context.lease;
    if (!lease.job.envelope.refresh) return { status: "failed", reason: "invalid-payload", retryable: false };
    const identity = lease.job.envelope.refresh;
    const phases: Partial<Record<RefreshPhase, string>> = {};
    async function finish(outcome: RefreshOutcome["outcome"], reason: string, published?: PublicationResult): Promise<JobOutcome> {
      await context.checkpoint();
      await options.store.finish(lease, { ...identity, jobId: lease.jobId, at: now(), outcome, reason,
        revisionId: published?.refresh.revisionId ?? null, publicationId: published?.refresh.id ?? null, costs: await costs(lease.jobId), phases });
      return outcome === "failed" ? { status: "failed", reason: "non-retryable", retryable: false } : { status: "succeeded" };
    }
    // Recover an ambiguous publication commit before checking current eligibility or live configuration.
    const published = await options.store.publication(lease.jobId);
    if (published) return finish(published.refresh.outcome, published.refresh.reason, published);
    const completed = await options.store.outcome(lease.jobId);
    if (completed) return completed.outcome === "failed" ? { status: "failed", reason: "non-retryable", retryable: false } : { status: "succeeded" };
    let member: RefreshMember;
    try { member = await options.store.loadMember(lease); }
    catch (error) {
      if (error instanceof PredictionRefreshError && error.reason === "ineligible") return finish("skipped", error.detail);
      throw error;
    }
    let intent = await options.store.intent(lease.jobId);
    if (!intent) {
      const plan = parseRefreshPlan(options.configure(member), member);
      intent = await options.store.saveIntent(lease, freezeEvidence({ member, plan, pin: refreshPin(member, plan) }));
    }
    const saved: RefreshIntent = intent, plan = saved.plan;
    function authorize() {
      checked(options.authority.authorize(saved.member), undefined);
      checked(options.authority.verifyPlan(plan, saved.member), true);
    }
    authorize();
    if (member.context.kickoffAt !== saved.member.context.kickoffAt || member.cycle.scheduleVersion !== saved.member.cycle.scheduleVersion)
      return finish("skipped", "schedule-changed");
    await context.checkpoint();
    if (saved.pin !== null) {
      const resolved = await options.models.resolve(saved.pin);
      if (plan.ai === null || resolved.pin.id !== saved.pin.id || resolved.model.id !== plan.modelVersionId ||
        resolved.model.provider !== plan.ai.request.provider || resolved.model.model !== plan.ai.request.model) return refreshFail("unauthorized");
    } else if (plan.ai !== null || plan.modelVersionId !== null) return refreshFail("unauthorized");
    async function checkpoint() {
      await context.checkpoint(); authorize();
      const current = await options.store.loadMember(lease);
      if (current.context.kickoffAt !== saved.member.context.kickoffAt || current.cycle.scheduleVersion !== saved.member.cycle.scheduleVersion)
        return refreshFail("ineligible");
    }
    async function phase<Value>(name: RefreshPhase, maximumMs: number, reserveMs: number,
      operation: (workflow: EvidenceWorkflow) => Promise<Value>, interrupted: () => Value): Promise<Value> {
      const usage = (value: Value): JobUsage[] => {
        const item = (provider: JobUsage["provider"], reference: string, requests: number, uncertain: boolean, costReference: string | null): JobUsage =>
          ({ provider, requestReference: refreshReference(lease.jobId, reference), costReference,
            phase: uncertain ? "uncertain" : "completed", requests, durationMs: null });
        if (name === "evidence") {
          const result = value as EvidenceServiceResult;
          return result.status === "denied" ? [item("football", "evidence", 0, plan.evidence.footballPlan !== null, null),
            item("research", "research", 0, plan.evidence.researchPlan !== null, plan.evidence.researchPlan?.request.attemptId ?? null)] :
            [item("football", "evidence", result.usage.football.requests, result.usage.football.uncertain, null),
              item("research", "research", result.usage.research.requests, result.usage.research.uncertain, plan.evidence.researchPlan?.request.attemptId ?? null)];
        }
        const result = value as PredictorResult | FallbackRefreshResult | Observation | null;
        return [item(name === "ai" ? "ai" : "football", name, result?.requestsDispatched ?? 0,
          result?.requestCountUnknown ?? true, name === "ai" ? plan.ai?.request.attemptId ?? null : null)];
      };
      await checkpoint();
      const known = await options.store.stage(lease.jobId, name, "completed");
      if (known) { phases[name] = "reused"; return known.value as Value; }
      if (!await options.store.start(lease, name)) {
        const value = interrupted(); phases[name] = "interrupted";
        await options.store.complete(lease, name, value, usage(value)); return value;
      }
      const limit = Math.min(maximumMs, context.remainingMs() - reserveMs);
      if (limit <= 0) { const value = interrupted(); phases[name] = "time-budget-exhausted"; await options.store.complete(lease, name, value, usage(value)); return value; }
      const controller = new AbortController(), started = performance.now(), entered = now();
      const signal = AbortSignal.any([context.signal, controller.signal]);
      const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(entered + limit, context.deadlineAt - reserveMs));
      let lastNow = entered;
      const check = () => {
        authorize(); const current = now();
        if (signal.aborted || context.remainingMs() <= reserveMs || current < lastNow || current >= deadlineAt || performance.now() - started >= limit)
          throw new PhaseTimeout();
        lastNow = current;
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      let stop: (() => void) | undefined;
      const expiration = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new PhaseTimeout()); }, limit);
        stop = () => reject(new PhaseTimeout()); signal.addEventListener("abort", stop, { once: true });
      });
      let value: Value;
      try {
        check(); value = await Promise.race([Promise.resolve().then(() => { check(); return operation({ signal, deadlineAt, check }); }), expiration]);
        check(); phases[name] = "completed";
      } catch (error) {
        if (context.signal.aborted) throw error;
        if (error instanceof PredictionRefreshError && error.reason === "unauthorized") throw error;
        value = interrupted(); phases[name] = error instanceof PhaseTimeout ? "timeout" : "unavailable";
      } finally { clearTimeout(timer); if (stop) signal.removeEventListener("abort", stop); controller.abort(); }
      await checkpoint(); await options.store.complete(lease, name, value, usage(value)); return value;
    }
    try {
      const evidence = await phase<EvidenceServiceResult>("evidence", plan.evidence.maxElapsedMs, lease.job.envelope.fallbackReserveMs,
        (workflow) => options.evidence.collect(plan.evidence, workflow), () => ({ status: "denied", reason: "unavailable" }));
      if (evidence.status === "denied") return finish("failed", `evidence:${evidence.reason}`);
      const aiPlan = plan.ai, pin = saved.pin;
      // A fallback-only plan never dispatches AI; its denial is explicit and costs nothing.
      const rawAi: PredictorResult = aiPlan === null || pin === null
        ? Object.freeze({ status: "denied", reason: "unconfigured", requestsDispatched: 0, requestCountUnknown: false })
        : await phase<PredictorResult>("ai", aiPlan.maxElapsedMs, lease.job.envelope.fallbackReserveMs,
          (workflow) => options.predictor.predict({ ...aiPlan, pin, snapshot: evidence.snapshot }, workflow),
          () => ({ status: "denied", reason: "uncertain-usage", requestsDispatched: 0, requestCountUnknown: true }));
      const ai = parseFallbackAiResult(rawAi);
      if (ai.status === "denied") phases.ai = ai.reason;
      const request: FallbackRefreshRequest = { requestId: refreshReference(lease.jobId, "fallback"),
        expected: { context: evidence.snapshot.context, jobId: lease.jobId, pin: saved.pin, evidenceHash: evidence.snapshot.hash },
        ai, bounds: plan.fallback.bounds, maxElapsedMs: plan.fallback.maxElapsedMs };
      let fallback = await phase<FallbackRefreshResult>("fallback", plan.fallback.maxElapsedMs,
        plan.publicationReserveMs + plan.observation.bounds.timeoutMs * plan.observation.bounds.maxRequests,
        (workflow) => options.fallback.resolve(request, workflow), () => options.fallback.resolveWithoutProvider(request));
      if (fallback.status === "denied") {
        phases.fallback = fallback.reason;
        fallback = options.fallback.resolveWithoutProvider(request);
      }
      if (fallback.status === "denied") return finish("failed", `fallback:${fallback.reason}`);
      if (fallback.candidate.audit.providerReason !== null) phases.fallback = fallback.candidate.audit.providerReason;
      const candidate = parseResolvedForecastCandidate(fallback.candidate);
      const generationCompletedAt = utcInstantFromEpochMilliseconds((await options.store.stage(lease.jobId, "fallback", "completed"))!.at);
      const observation = await phase<Observation | null>("observation", plan.observation.bounds.timeoutMs * plan.observation.bounds.maxRequests,
        plan.publicationReserveMs, (workflow) => options.observation.collect(saved.member, plan.observation.bounds, workflow), () => null);
      if (!observation) return finish("failed", "observation-unavailable");
      // Always let lifecycle process verified early play/corrections, including stale
      // safety evidence, before freshness decides whether publication is possible.
      const observed = await options.lifecycle.observe(observation.input);
      const original = observed.observation;
      if (original.retrievedAt > now() || now() - original.retrievedAt > plan.observation.maxAgeMs) return finish("skipped", "stale-observation");
      const eligibility = await options.lifecycle.refreshEligibility(identity.fixtureId);
      if (!eligibility.eligible) return finish("skipped", eligibility.reason ?? "ineligible");
      await checkpoint();
      if (original.kickoffAt === null || original.kickoffAt !== candidate.context.context.kickoffAt) return finish("skipped", "schedule-changed");
      const result = await options.publisher.publish({ candidate, evidenceSnapshotId: plan.evidence.requestId,
        attemptKey: refreshReference(lease.jobId, "publication"), scheduleVersion: saved.member.cycle.scheduleVersion, generationCompletedAt,
        observation: { provider: "api-football", fixtureId: identity.fixtureId, externalFixtureId: original.externalFixtureId,
          cycleId: identity.cycleId, kickoffAt: original.kickoffAt, status: original.status, retrievedAt: original.retrievedAt,
          providerUpdatedAt: original.providerUpdatedAt, actualStartedAt: original.actualStartedAt, evidenceRef: original.evidenceRef } }, lease);
      return finish(result.refresh.outcome, result.refresh.reason, result);
    } catch (error) {
      if (context.signal.aborted) throw error;
      if (error instanceof PredictionRefreshError && error.reason === "ineligible") return finish("skipped", error.detail);
      throw error;
    }
  }
  const definition = defineJob({ type: options.type, handlerVersion: options.handlerVersion, payload: refreshPayload,
    handle: async (payload, context) => {
      if (evidenceFingerprint(payload) !== evidenceFingerprint(context.lease.job.envelope.payload)) return refreshFail("invalid-request");
      try { return await handle(context); }
      catch (error) {
        const identity = context.lease.job.envelope.refresh;
        if (!identity || context.signal.aborted || error instanceof PredictionRefreshError && error.reason === "unavailable" ||
          error instanceof ModelRegistryError && error.reason === "unavailable" ||
          error instanceof RevisionPublicationError && ["unavailable", "lost-lease"].includes(error.reason)) throw error;
        const reason = error instanceof PredictionRefreshError ? error.detail : error instanceof ModelRegistryError ? `model:${error.reason}` :
          error instanceof RevisionPublicationError ? `publication:${error.reason}` : null;
        if (reason === null) throw error;
        await context.checkpoint();
        const skipped = error instanceof RevisionPublicationError && error.reason === "eligibility-expired";
        await options.store.finish(context.lease, { ...identity, jobId: context.lease.jobId, at: now(), outcome: skipped ? "skipped" : "failed",
          reason, revisionId: null, publicationId: null, costs: await costs(context.lease.jobId), phases: {} });
        return skipped ? { status: "succeeded" } : { status: "failed", reason: "non-retryable", retryable: false };
      }
    },
    settled: async (job) => { if (job.envelope.refresh) await reconcileRun(job.envelope.refresh.runId); },
  });
  return Object.freeze({ definition, reconcileRun, outcome: options.store.outcome });
}

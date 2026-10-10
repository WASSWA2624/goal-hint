import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { assertOperationAllowed, type RuntimePolicy } from "../config/runtime-policy.ts";
import { createMysqlPublicCacheStore } from "../cache/mysql-public-cache.ts";
import { createDatabase, type DatabaseRuntime } from "../database/client.ts";
import { createEvidenceService } from "../evidence/evidence-service.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { createProviderFallbackAdapter } from "../fallback/fallback-adapter.ts";
import { createFallbackService } from "../fallback/fallback-service.ts";
import { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { createFootballCatalogStore } from "../football/catalog-mysql-store.ts";
import { createFootballCatalogImporter } from "../football/catalog-service.ts";
import { createPolicyQuotaGateway } from "../football/quota-gateway.ts";
import { createMysqlQuotaStore } from "../football/quota-mysql-store.ts";
import { createMysqlJobQueue } from "../jobs/job-mysql-store.ts";
import { createJobRegistry, defineJob, type JobDefinition } from "../jobs/job-registry.ts";
import { ModelRegistryError } from "../predictor/predictor-registry.ts";
import { createCutoffJob, createCutoffLockingService } from "../predictions/cutoff-service.ts";
import { createScheduleLifecycleService } from "../predictions/lifecycle-service.ts";
import { createRevisionPublicationService } from "../predictions/publication-service.ts";
import { createMysqlRefreshStore } from "../refresh/refresh-mysql-store.ts";
import { createRefreshObservationCollector } from "../refresh/refresh-observation.ts";
import { createPredictionRefreshService } from "../refresh/refresh-service.ts";
import type { ResultSyncPolicy } from "../results/result-sync-contract.ts";
import { createMysqlResultSyncStore } from "../results/result-sync-mysql-store.ts";
import { createResultSyncService } from "../results/result-sync-service.ts";
import { createMarketSettlementService } from "../settlement/settlement-service.ts";
import { DailySelectionError } from "../selection/selection-contract.ts";
import { scheduledSelection, selectionWindow } from "../selection/selection-input.ts";
import { createMysqlDailySelectionStore } from "../selection/selection-mysql-store.ts";
import { createDailySelectionService } from "../selection/selection-service.ts";
import { loadOwnerApprovals, missingOwnerApprovals, ownerEvidenceVerifier, type OwnerApprovals } from "./live-approvals.ts";
import { createAccountStatusReader, createQuotaRouter, type QuotaDay } from "./live-account.ts";
import { createLiveAuthorities, LIVE_ACTOR } from "./live-authorities.ts";
import { fallbackRefreshPlan, LIVE_REFRESH_TYPE, liveReferences, liveWorkload, REFRESH_REQUESTS_PER_JOB,
  resultSyncPolicy, selectionPolicy, cutoffPolicy, lifecyclePolicy, providerFallbackPolicy, publicationPolicy } from "./live-plan.ts";

const DAY_MS = 86_400_000;
export class LiveConfigurationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Live operation is not configured:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "LiveConfigurationError"; this.issues = Object.freeze([...issues]);
  }
}
/** Checks everything the live runner needs before it opens a database pool or calls a provider. */
export function liveReadiness(policy: RuntimePolicy, approvals?: OwnerApprovals) {
  const issues: string[] = [];
  if (policy.scope !== "production") issues.push("GOAL_HINT_OPERATION_SCOPE must be production for public provisional publication.");
  if (policy.capabilities.ai) issues.push("GOAL_HINT_AI_ENABLED must stay false until an AI provider transport is integrated (prompt 012).");
  if (policy.capabilities.research) issues.push("GOAL_HINT_RESEARCH_ENABLED must stay false until a licensed research adapter exists (prompt 011).");
  if (policy.choices.competitionIds === null) issues.push("GOAL_HINT_COMPETITION_IDS is required.");
  let verify;
  try { verify = ownerEvidenceVerifier(approvals ?? loadOwnerApprovals()); } catch (error) { issues.push((error as Error).message); }
  if (verify) for (const missing of missingOwnerApprovals(policy, verify)) issues.push(`Owner approval missing for ${missing}.`);
  if (issues.length > 0 || !verify) throw new LiveConfigurationError(issues);
  assertOperationAllowed(policy, "publication", verify);
  return verify;
}

export type LiveRuntimeOverrides = Readonly<{
  /** Isolated tests only: a synthetic provider transport and owner register. */
  fetcher?: typeof fetch; approvals?: OwnerApprovals;
}>;
/** Composes the fallback-only daily pipeline on one shared database and provider account. */
export async function createLiveRuntime(policy: RuntimePolicy, overrides: LiveRuntimeOverrides = {}) {
  const verify = liveReadiness(policy, overrides.approvals), refs = liveReferences(policy);
  const fetcher = overrides.fetcher === undefined ? {} : { fetcher: overrides.fetcher };
  const database = createDatabase(policy, verify);
  try {
    if (await database.readiness() !== "ready") throw new LiveConfigurationError(["The application database is unavailable."]);
    const queue = createMysqlJobQueue(database);
    const quota = createQuotaRouter({ store: createMysqlQuotaStore(database), readStatus: createAccountStatusReader({ policy, verifyEvidence: verify, ...fetcher }) });
    const day: QuotaDay = await quota.refresh();
    const workload = liveWorkload(day.status.dailyLimit, day.status.secondLimit, day.status.plan);
    const selection = selectionPolicy(policy, refs, workload), statusEvidenceRef = `${refs.freshness}#status`;
    let results: ResultSyncPolicy | null = null;
    const authorities = createLiveAuthorities({ policy, verify, refs, selection, statusEvidenceRef, resultPolicy: () => results });
    const gateway = createPolicyQuotaGateway({ limiter: quota.limiter, policy, verifyEvidence: verify });
    // The adapter identity is the stable provider account; daily limiter accounts sit behind the router.
    const adapter = createApiFootballAdapter({ accountId: day.status.accountKey, credential: { read: () => policy.secrets.footballKey?.read() ?? "" },
      gateway, authorize: () => assertOperationAllowed(policy, "football", verify), cacheCapacity: 1024, ...fetcher,
      verifyLogo: authorities.catalog.verifyLogo, verifyRegulationScore: authorities.catalog.verifyRegulationScore,
      // API-Football documents up to 20 IDs per /fixtures?ids request.
      batchEvidence: { maximumIds: 20, evidenceRef: "api-football-documentation-v3:fixtures-ids-maximum-20" },
      verifyBatchEvidence: (evidence) => evidence.maximumIds === 20 });
    const cutoff = createCutoffLockingService({ database, queue, policy: cutoffPolicy(refs), authority: authorities.cutoff });
    const lifecycle = createScheduleLifecycleService({ database, cutoff, policy: lifecyclePolicy(refs), authority: authorities.lifecycle });
    const catalog = createFootballCatalogStore(database, { coordinateFixtureMutation: lifecycle.coordinateFixtureMutation, transactionTimeoutMs: 120_000 });
    const importer = createFootballCatalogImporter({ adapter, store: catalog, authority: authorities.catalog });
    const selectionStore = createMysqlDailySelectionStore(database, queue);
    const dailySelection = createDailySelectionService({ policy: selection, authority: authorities.selection, store: selectionStore, importer, cutoff });
    const publisher = createRevisionPublicationService({ database, queue, policy: publicationPolicy(refs), authority: authorities.publication });
    const evidence = createEvidenceService({ authority: authorities.evidence, store: createMysqlEvidenceStore(database), research: null,
      football: { async collect() { throw new Error("Fallback-only refreshes collect no football evidence."); } } });
    const providerFallback = createProviderFallbackAdapter({ adapter, catalog, policy: providerFallbackPolicy(refs),
      authority: authorities.providerFallback, maxJobs: 1000 });
    const fallback = createFallbackService({ fallback: providerFallback, authority: authorities.fallback, maxInflight: 100,
      verifyRequest: authorities.verifyFallbackRequest });
    const refresh = createPredictionRefreshService({ type: LIVE_REFRESH_TYPE, handlerVersion: 1, store: createMysqlRefreshStore(database, queue),
      selection: selectionStore, authority: authorities.refresh, configure: (member) => fallbackRefreshPlan(member, refs),
      models: { async resolve() { throw new ModelRegistryError("unavailable"); } },
      predictor: { async predict() { return { status: "denied", reason: "unconfigured", requestsDispatched: 0, requestCountUnknown: false }; } },
      evidence, fallback, lifecycle, publisher, costs: { ai: null, research: null },
      observation: createRefreshObservationCollector({ adapter: adapter.evidence, evidenceRef: statusEvidenceRef, verifyResponse: authorities.verifyStatusResponse }) });
    const settlement = createMarketSettlementService({ database, queue });
    const cache = createMysqlPublicCacheStore(database);

    // Refresh jobs wait (retryably) instead of eating the reserve kept for selection and result checks.
    const refreshDefinition: JobDefinition = Object.freeze({ ...refresh.definition, async handle(payload, context) {
      if (await quota.remaining() < workload.refreshFloor + REFRESH_REQUESTS_PER_JOB) return { status: "failed", reason: "rate-limited", retryable: true };
      return refresh.definition.handle(payload, context);
    } });
    // After repeated incomplete imports, the owner's degradation policy finalizes known coverage as partial.
    const selectionDefinition = defineJob({ type: "daily.selection", handlerVersion: 1, payload: scheduledSelection,
      async handle(payload, context) {
        await context.checkpoint();
        const runDate = selectionWindow(payload.scheduledFor).runDate;
        // A shortened plan horizon is partial by design; otherwise retry incomplete imports twice first.
        const degrade = workload.importDays < 7 || context.lease.job.attemptCount >= 3;
        try {
          const result = await dailySelection.run(payload.scheduledFor, degrade ? { actor: LIVE_ACTOR, policyRef: selection.degradationPolicyRef!,
            evidenceRef: `${selection.degradationPolicyRef}:${runDate}` } : undefined, context.signal);
          await context.checkpoint();
          return result.status === "busy" ? { status: "failed", reason: "handler-failed", retryable: true } : { status: "succeeded" };
        } catch (error) {
          return { status: "failed", reason: "handler-failed", retryable: error instanceof DailySelectionError &&
            ["incomplete-import", "lost-lease", "unavailable"].includes(error.reason) };
        }
      } });
    const registry = createJobRegistry([selectionDefinition, refreshDefinition, createCutoffJob(cutoff)]);

    /** Result coverage follows the competitions this runner predicts in the current window. */
    async function resultCoverage(): Promise<ResultSyncPolicy["coverage"]> {
      const now = Date.now();
      const rows = await database.query((tx) => tx.$queryRaw<{ competitionId: bigint; season: number }[]>`
        SELECT DISTINCT cp.externalId AS competitionId, s.year AS season FROM PredictionCycle c
        JOIN FootballFixture f ON f.id = c.fixtureId JOIN FootballSeason s ON s.id = f.seasonId
        JOIN FootballCompetitionProvider cp ON cp.competitionId = s.competitionId AND cp.provider = 'api-football'
        WHERE c.kickoffAt >= ${new Date(now - 3 * DAY_MS)} AND c.kickoffAt < ${new Date(now + 8 * DAY_MS)}
        ORDER BY competitionId, season LIMIT ${maximumCompetitionScope}`);
      return rows.map((row) => ({ competitionId: Number(row.competitionId), season: row.season }));
    }
    let poller: Readonly<{ policy: ResultSyncPolicy; accountId: string; service: ReturnType<typeof createResultSyncService> }> | null = null;
    /** Rebuilds the leased poller when its coverage or provider-day quota account changes. */
    async function resultPoller() {
      const current = quota.current(), coverage = await resultCoverage();
      if (current === null) return poller;
      if (coverage.length === 0) { results = null; poller = null; return null; }
      const next = resultSyncPolicy(refs, workload, coverage);
      if (poller && poller.accountId === current.accountId && evidenceFingerprint(poller.policy) === evidenceFingerprint(next)) return poller;
      results = next;
      // The poller lease belongs to the shared quota account row, so it follows the active provider day.
      poller = Object.freeze({ policy: next, accountId: current.accountId, service: createResultSyncService({ accountId: current.accountId,
        policy: next, authority: authorities.results, adapter: adapter.evidence,
        store: createMysqlResultSyncStore({ database, accountId: current.accountId, lifecycle }) }) });
      return poller;
    }
    return Object.freeze({ policy, database, queue, quota, workload, registry, settlement, cache, resultPoller, day,
      now: () => utcInstantFromEpochMilliseconds(Date.now()), close: () => database.disconnect() });
  } catch (error) { await database.disconnect().catch(() => {}); throw error; }
}
export type LiveRuntime = Awaited<ReturnType<typeof createLiveRuntime>>;
export type LiveDatabase = DatabaseRuntime;

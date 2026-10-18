import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { assertOperationAllowed, type RuntimePolicy } from "../config/runtime-policy.ts";
import { createMysqlPublicCacheStore } from "../cache/mysql-public-cache.ts";
import { createDatabase } from "../database/client.ts";
import { createEvidenceService } from "../evidence/evidence-service.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { createProviderFallbackAdapter } from "../fallback/fallback-adapter.ts";
import { createFallbackService } from "../fallback/fallback-service.ts";
import { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { createFootballCatalogStore } from "../football/catalog-mysql-store.ts";
import { createFootballCatalogImporter } from "../football/catalog-service.ts";
import { quotaPriorities } from "../football/quota-contract.ts";
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
import { createLiveAiRuntime, type LiveAiRuntime } from "./live-ai.ts";
import { liveAiModel } from "./live-ai-model.ts";
import { createLiveFootballPreparation, readLiveFootballSources } from "./live-ai-evidence.ts";
import { liveAiEvidencePolicy } from "./live-ai-plan.ts";
import { canRunLiveRefresh } from "./live-refresh-quota.ts";
import { fallbackRefreshPlan, LIVE_REFRESH_TYPE, liveReferences, liveWorkload,
  resultSyncPolicy, selectionPolicy, cutoffPolicy, lifecyclePolicy, providerFallbackPolicy, publicationPolicy,
  oddsPolicy, oddsImportBounds, oddsCatalogBounds, oddsMaxRequests, ODDS_FRESHNESS_MS, teamCodeBounds, teamCodeImportsEnabled,
  refreshEnvelopeFor } from "./live-plan.ts";
import { oddsFail } from "../odds/odds-contract.ts";
import { createOddsJobDefinitions, ODDS_PROVIDER_WINDOW_MS, ODDS_SWEEP_MS, type OddsQuotaUsage } from "../odds/odds-jobs.ts";
import { createMysqlOddsStore } from "../odds/odds-mysql-store.ts";
import { createOddsImportService } from "../odds/odds-service.ts";
import { createTeamCodeJobDefinitions } from "../teams/team-code-jobs.ts";
import { createMysqlTeamCodeStore } from "../teams/team-code-mysql-store.ts";
import { createTeamCodeService } from "../teams/team-code-service.ts";

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
  if (policy.capabilities.ai) {
    try { liveAiModel(policy); } catch (error) { issues.push((error as Error).message); }
  }
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
  fetcher?: typeof fetch; aiFetcher?: typeof fetch; approvals?: OwnerApprovals;
}>;
/** Composes the pinned primary and provider fallback pipeline on shared durable stores. */
export async function createLiveRuntime(policy: RuntimePolicy, overrides: LiveRuntimeOverrides = {}) {
  const verify = liveReadiness(policy, overrides.approvals), refs = liveReferences(policy);
  const fetcher = overrides.fetcher === undefined ? {} : { fetcher: overrides.fetcher };
  const database = createDatabase(policy, verify);
  try {
    if (await database.readiness() !== "ready") throw new LiveConfigurationError(["The application database is unavailable."]);
    const queue = createMysqlJobQueue(database);
    const quota = createQuotaRouter({ store: createMysqlQuotaStore(database), readStatus: createAccountStatusReader({ policy, verifyEvidence: verify, ...fetcher }) });
    const day: QuotaDay = await quota.refresh();
    const workload = liveWorkload(day.status.dailyLimit, day.status.secondLimit, day.status.plan, day.status.minuteLimit, policy.capabilities.ai);
    const selection = selectionPolicy(policy, refs, workload), statusEvidenceRef = `${refs.freshness}#status`;
    let results: ResultSyncPolicy | null = null;
    // Odds use the same workload inputs as their authority, so a policy can never verify against a different plan.
    const odds = oddsPolicy(policy, refs, workload);
    const aiModel = policy.capabilities.ai ? liveAiModel(policy) : null;
    let ai: LiveAiRuntime | null = null;
    const authorities = createLiveAuthorities({ policy, verify, refs, selection, statusEvidenceRef, resultPolicy: () => results,
      refreshPacing: workload.pacing, oddsPolicy: odds,
      ...(aiModel === null ? {} : { aiModel, verifyPrimary: (...args) => ai?.verifyAi(...args) === true,
        verifyPrimaryCandidate: (candidate) => ai?.verifyCandidate(candidate) === true }) });
    const gateway = createPolicyQuotaGateway({ limiter: quota.limiter, policy, verifyEvidence: verify });
    // The adapter identity is the stable provider account; daily limiter accounts sit behind the router.
    const adapter = createApiFootballAdapter({ accountId: day.status.accountKey, credential: { read: () => policy.secrets.footballKey?.read() ?? "" },
      gateway, authorize: () => assertOperationAllowed(policy, "football", verify), ...fetcher,
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
      // Live imports finish before analysis; collection saves only the frozen canonical sources.
      football: { async collect() { throw new Error("Live evidence collection uses stored sources only."); } } });
    const providerFallback = createProviderFallbackAdapter({ adapter, catalog, policy: providerFallbackPolicy(refs),
      authority: authorities.providerFallback, maxJobs: 1000 });
    const fallback = createFallbackService({ fallback: providerFallback, authority: authorities.fallback, maxInflight: 100,
      verifyRequest: authorities.verifyFallbackRequest });
    const refreshStore = createMysqlRefreshStore(database, queue);
    if (aiModel !== null) ai = await createLiveAiRuntime({ policy, verify, refs, model: aiModel, database, store: refreshStore,
      evidenceAuthority: authorities.evidence, pacing: workload.pacing, fallbackReserveMs: refreshEnvelopeFor(workload.pacing, true).fallbackReserveMs,
      ...(overrides.aiFetcher === undefined ? {} : { fetcher: overrides.aiFetcher }) });
    const refresh = createPredictionRefreshService({ type: LIVE_REFRESH_TYPE, handlerVersion: 1, store: refreshStore,
      selection: selectionStore, authority: authorities.refresh,
      ...(ai === null ? {} : { prepare: createLiveFootballPreparation({ importer, refs, pacing: workload.pacing }) }),
      configure: async (member) => {
        if (ai === null) return fallbackRefreshPlan(member, refs, workload.pacing);
        // A history read outage gives explicit missingness and sends no primary request.
        const sources = await readLiveFootballSources(database, member.context, liveAiEvidencePolicy(refs), refs).catch(() => []);
        return ai.configure(member, sources);
      },
      models: ai?.models ?? { async resolve() { throw new ModelRegistryError("unavailable"); } },
      predictor: ai?.predictor ?? { async predict() { return { status: "denied", reason: "unconfigured", requestsDispatched: 0, requestCountUnknown: false }; } },
      evidence, fallback, lifecycle, publisher, costs: { ai: ai?.costs ?? null, research: null },
      observation: createRefreshObservationCollector({ adapter: adapter.evidence, evidenceRef: statusEvidenceRef, verifyResponse: authorities.verifyStatusResponse }) });
    const settlement = createMarketSettlementService({ database, queue });
    const cache = createMysqlPublicCacheStore(database);

    // Only remaining outbound calls consume the reserve kept for selection and result checks.
    const refreshDefinition: JobDefinition = Object.freeze({ ...refresh.definition, async handle(payload, context) {
      if (!await canRunLiveRefresh({ store: refreshStore, jobId: context.lease.jobId, primaryEnabled: ai !== null,
        floor: workload.refreshFloor, remaining: () => quota.remaining() })) return { status: "failed", reason: "rate-limited", retryable: true };
      try { return await refresh.definition.handle(payload, context); }
      finally { ai?.release(context.lease.jobId); }
    } });
    // After repeated incomplete imports, the owner's degradation policy finalizes known coverage as partial.
    const selectionDefinition = defineJob({ type: "daily.selection", handlerVersion: 1, payload: scheduledSelection,
      async handle(payload, context) {
        await context.checkpoint();
        const runDate = selectionWindow(payload.scheduledFor).runDate;
        // A shortened plan horizon is partial by design; otherwise retry incomplete imports twice first.
        const degrade = workload.importDays < (selection.windowDays ?? 7) || context.lease.job.attemptCount >= 3;
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

    // Odds (052): imported only when the owner enables them AND the verified plan leaves spare ordinary quota.
    // A separate registry runs on its own worker, so odds never occupy refresh or cutoff workers.
    const oddsEnabled = policy.choices.odds.enabled && workload.odds.eligible && odds !== null;
    const oddsService = createOddsImportService({ adapter: adapter.odds, store: createMysqlOddsStore(database), authority: authorities.odds,
      accountId: () => quota.current()?.accountId ?? oddsFail("unavailable"),
      bounds: (request) => {
        const end = request.kind === "prices" ? request.slot + ODDS_SWEEP_MS : request.slot + DAY_MS;
        // The provider walk ends early enough that the receipt and per-fixture writes keep their own part of the job timeout.
        const deadline = utcInstantFromEpochMilliseconds(Math.min(Date.now() + ODDS_PROVIDER_WINDOW_MS, end));
        return request.kind === "prices" ? oddsImportBounds(deadline, workload.odds.maxPages) : oddsCatalogBounds(deadline);
      } });
    /** The enrichment gate's counters. Null until the new UTC provider day has settled and opened its limiter. Odds and
     * team codes are the only live callers at enrichment priority, so the limiter's own dispatched enrichment attempts
     * on the open provider day are exactly what both have spent together, uncertain dispatches included: they share one
     * spare, and neither can push the other past it. */
    async function oddsUsage(): Promise<OddsQuotaUsage | null> {
      const counters = await quota.counters();
      if (counters === null) return null;
      const { accountId, periodId } = counters.day;
      const [row] = await database.query((tx) => tx.$queryRaw<{ spent: bigint | number }[]>`SELECT COUNT(*) AS spent FROM ApiQuotaAttempt
        WHERE accountId = ${accountId} AND periodId = ${periodId} AND priority = ${quotaPriorities.enrichment.rank} AND dispatchedAt IS NOT NULL`);
      return Object.freeze({ remaining: counters.remaining, used: counters.used, oddsUsed: Number(row?.spent ?? 0) });
    }
    const enrichmentAllowance = Object.freeze({ floor: workload.odds.floor, spare: workload.odds.spare, reserve: workload.odds.reserve });
    const oddsDefinitions = createOddsJobDefinitions({ service: oddsService, policy: () => odds ?? oddsFail("unverified-policy"),
      enabled: () => oddsEnabled, usage: oddsUsage, allowance: enrichmentAllowance,
      maxRequests: (kind) => oddsMaxRequests(kind, workload.odds.maxPages) });
    const oddsRegistry = createJobRegistry(oddsDefinitions);

    // Team codes: on unless the owner turns them off, but only on plans with the odds spare (never Free or slow). Each
    // hourly slot imports /teams for a few nearest-kickoff competition-seasons with codeless teams through the ordinary
    // catalog importer; its receipts are the per-league "checked" markers, so codeless leagues are not re-requested.
    const teamCodesEnabled = teamCodeImportsEnabled(policy, workload);
    const teamCodeDefinitions = createTeamCodeJobDefinitions({ enabled: () => teamCodesEnabled, usage: oddsUsage, allowance: enrichmentAllowance,
      service: createTeamCodeService({ store: createMysqlTeamCodeStore(database), importer, retentionEvidenceRef: refs.retention,
        bounds: teamCodeBounds }) });
    const teamCodesRegistry = createJobRegistry(teamCodeDefinitions);
    // One enrichment worker runs both, so their quota gates are checked one job at a time; odds jobs claim first.
    const enrichmentRegistry = createJobRegistry([...oddsDefinitions, ...teamCodeDefinitions]);

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
    return Object.freeze({ policy, database, queue, quota, workload, registry, settlement, cache, catalog: importer, resultPoller, day,
      odds: Object.freeze({ enabled: oddsEnabled, registry: oddsRegistry, horizonDays: workload.odds.dates,
        // Write-time staleness needs no provider call, so it runs even while imports are off.
        expire: (limit: number) => oddsService.expire(odds?.freshnessMs ?? ODDS_FRESHNESS_MS, limit) }),
      teamCodes: Object.freeze({ enabled: teamCodesEnabled, registry: teamCodesRegistry }),
      enrichment: Object.freeze({ registry: enrichmentRegistry }),
      now: () => utcInstantFromEpochMilliseconds(Date.now()), close: () => database.disconnect() });
  } catch (error) { await database.disconnect().catch(() => {}); throw error; }
}
export type LiveRuntime = Awaited<ReturnType<typeof createLiveRuntime>>;

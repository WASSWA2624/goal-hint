import "server-only";
import { createRecommendationQuoteLoader } from "../odds/recommendation-quotes.ts";
import { evidenceFirstRecommendationPolicy } from "../../domain/recommendation.ts";
import { QUALIFIED_FORECAST_CASCADE } from "../fallback/fallback-contract.ts";

import { getReportingDayBounds, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { MARKET_REGISTRY_VERSION } from "../../domain/market-registry.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { assertOperationAllowed, type RuntimePolicy, type EvidenceVerifier } from "../config/runtime-policy.ts";
import { createMysqlPublicCacheStore } from "../cache/mysql-public-cache.ts";
import { createDatabase, DatabaseOperationError } from "../database/client.ts";
import { createEvidenceService } from "../evidence/evidence-service.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { createProviderFallbackAdapter } from "../fallback/fallback-adapter.ts";
import { createFallbackService } from "../fallback/fallback-service.ts";
import { createApiFootballAdapter, type ApiFootballAdapterOptions } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballFixtureRoundParameters, parseApiFootballFixtureRound,
  type ApiFootballResult, type FixtureRoundQuery } from "../football/api-football-contract.ts";
import { catalogImportSummary, createFootballCatalogStore, historyReplayKind } from "../football/catalog-mysql-store.ts";
import { catalogScopeKey, parseCatalogImportRequest } from "../football/catalog-input.ts";
import { createFootballCatalogImporter } from "../football/catalog-service.ts";
import { createCurrentDayContextJob, currentPlayerRequestLimit, currentReferenceFreshness } from "../football/current-day-refresh.ts";
import { createFootballHistoryBackfill, historyBackfillLimits, normalizeHistoryCompetition } from "../football/history-backfill.ts";
import { createFootballHistoryDateRepair } from "../football/history-date-repair.ts";
import { createFootballHistoryDetails } from "../football/history-details.ts";
import { createFootballHistoryFixtureReplay } from "../football/history-fixture-replay.ts";
import { createFixtureBackfillManifestStore } from "../football/history-fixture-manifest.ts";
import { createHistoryImportJob } from "../football/history-import-jobs.ts";
import { footballHistoryCatalogMaxAgeMs, readUpcomingFootballHistorySeasons } from "../football/history-fixture-scope.ts";
import { createFootballHistoryOddsMapping } from "../football/history-odds-mapping.ts";
import { createFootballHistoryPlayerProfiles, createFootballHistoryPlayerStatistics } from "../football/history-player-statistics.ts";
import { createFootballHistoryReference, verifyFootballHistoryReferencePass } from "../football/history-reference.ts";
import { createHistoricalReferenceCheckpoint } from "../football/history-reference-checkpoint.ts";
import { readHistoryPlayerStatisticsTargets, readHistoryReferenceTargets, type HistoryReferenceDataset } from "../football/history-reference-targets.ts";
import { createFootballHistorySource, type FootballHistoryReferencePhase } from "../football/history-source.ts";
import { createMysqlProviderCoverageStore } from "../football/provider-coverage-store.ts";
import { readPendingHistorySubjectIds, type FootballHistoryPlayerSubjectDataset } from "../football/history-subjects.ts";
import { quotaPriorities } from "../football/quota-contract.ts";
import { createPolicyQuotaGateway } from "../football/quota-gateway.ts";
import { createMysqlQuotaStore } from "../football/quota-mysql-store.ts";
import { createLiveLocalEngine } from "../intelligence/live-local-engine.ts";
import { LOCAL_GOALS_VERSION } from "../intelligence/local-goals-model.ts";
import { createMysqlJobQueue } from "../jobs/job-mysql-store.ts";
import { createJobRegistry, defineJob, type JobDefinition } from "../jobs/job-registry.ts";
import { ModelRegistryError } from "../predictor/predictor-registry.ts";
import { createCutoffJob, createCutoffLockingService } from "../predictions/cutoff-service.ts";
import { createScheduleLifecycleService } from "../predictions/lifecycle-service.ts";
import { createRevisionPublicationService } from "../predictions/publication-service.ts";
import { createMysqlRefreshStore } from "../refresh/refresh-mysql-store.ts";
import { createRefreshObservationCollector } from "../refresh/refresh-observation.ts";
import { createPredictionRefreshService } from "../refresh/refresh-service.ts";
import { createForecastRecovery } from "../refresh/forecast-recovery.ts";
import type { ResultSyncPolicy } from "../results/result-sync-contract.ts";
import { coordinatedResultDefaults } from "../results/result-sync-policy.ts";
import { createMysqlResultSyncStore } from "../results/result-sync-mysql-store.ts";
import { createResultSyncService } from "../results/result-sync-service.ts";
import { createMarketSettlementService } from "../settlement/settlement-service.ts";
import { createFinalImpliedCountCapture } from "../settlement/final-implied-counts.ts";
import { DailySelectionError } from "../selection/selection-contract.ts";
import { hourlySelectionWindow, scheduledHourlySelection, scheduledSelection, selectionWindow } from "../selection/selection-input.ts";
import { createMysqlDailySelectionStore } from "../selection/selection-mysql-store.ts";
import { createDailySelectionService } from "../selection/selection-service.ts";
import { verifiedFixturePage } from "../selection/fixture-import-receipt.ts";
import { createHourlyFixtureReconciler, HourlyScheduleQuotaUnavailable, type ForwardFixtureSweep } from "../selection/selection-fixture-reconciliation.ts";
import { HOURLY_SELECTION_TYPE } from "../selection/selection-trigger.ts";
import { loadOwnerApprovals, missingOwnerApprovals, ownerEvidenceVerifier, type OwnerApprovals } from "./live-approvals.ts";
import { createAccountStatusReader, createQuotaRouter, type QuotaDay } from "./live-account.ts";
import { createLiveAuthorities, LIVE_ACTOR } from "./live-authorities.ts";
import { createLiveAiRuntime, type LiveAiRuntime } from "./live-ai.ts";
import { liveAiModel, liveSourceOrder } from "./live-ai-model.ts";
import { createLiveFootballPreparation, fitLiveFootballSources, readLiveFootballSources } from "./live-ai-evidence.ts";
import { createLiveResearchRuntime } from "./live-research.ts";
import { liveAiEvidencePolicy } from "./live-ai-plan.ts";
import { canRunLiveRefresh } from "./live-refresh-quota.ts";
import { fallbackRefreshPlan, LIVE_REFRESH_TYPE, liveCascadePlan, liveReferences, liveWorkload,
  resultSyncPolicy, selectionPolicy, cutoffPolicy, lifecyclePolicy, providerFallbackPolicy, publicationPolicy,
  oddsPolicy, oddsImportBounds, oddsCatalogBounds, oddsMaxRequests, ODDS_FRESHNESS_MS, teamCodeBounds, teamCodeImportsEnabled,
  refreshEnvelopeFor } from "./live-plan.ts";
import { oddsFail } from "../odds/odds-contract.ts";
import { createOddsJobDefinitions, oddsQuotaAllows, ODDS_PROVIDER_WINDOW_MS, ODDS_SWEEP_MS, type OddsQuotaUsage } from "../odds/odds-jobs.ts";
import { createMysqlOddsStore } from "../odds/odds-mysql-store.ts";
import { storedPreMatchCatalogCoverage } from "../odds/bookmaker-odds-read.ts";
import { oddsPolicyHash } from "../odds/odds-input.ts";
import { createOddsImportService } from "../odds/odds-service.ts";
import { createInPlayOddsPoller } from "../odds/in-play-odds-service.ts";
import { createTeamCodeJobDefinitions } from "../teams/team-code-jobs.ts";
import { createMysqlTeamCodeStore } from "../teams/team-code-mysql-store.ts";
import { createTeamCodeService } from "../teams/team-code-service.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { coordinatedLiveDetailDefaults, type LiveMatchPolicy } from "../live-match/live-match-contract.ts";
import { createLiveMatchService } from "../live-match/live-match-service.ts";
import { createMysqlLiveMatchStore } from "../live-match/live-match-mysql-store.ts";
import { createLiveQuotaAdmission } from "./live-detail-quota.ts";
import { liveMatchPolicy, type LiveWorkload } from "./live-plan.ts";
import { bindLiveProviderArchive } from "./live-provider-archive.ts";
import { createLiveDiscoveryImport } from "./live-discovery-import.ts";
import type { NormalizedFixtureMatchDetails } from "../football/fixture-match-details.ts";

const DAY_MS = 86_400_000;
const REFERENCE_RECEIPT_REPLAY_MS = 5 * 60_000;
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
  if (policy.choices.competitionIds === null) issues.push("GOAL_HINT_COMPETITION_IDS is required.");
  let verify;
  try { verify = ownerEvidenceVerifier(approvals ?? loadOwnerApprovals()); } catch (error) { issues.push((error as Error).message); }
  const baseline = { ...policy, capabilities: { ...policy.capabilities, ai: false, research: false } };
  if (verify) for (const missing of missingOwnerApprovals(baseline, verify)) issues.push(`Owner approval missing for ${missing}.`);
  if (issues.length > 0 || !verify) throw new LiveConfigurationError(issues);
  assertOperationAllowed(baseline, "publication", verify);
  return verify;
}

/** Resolve optional capabilities without dispatch. Failed optional authorization disables only that layer.
 * The resulting policy is shared by every runtime boundary, so a disabled layer cannot authorize paid work. */
export function liveOptionalPolicy(input: RuntimePolicy, verify: EvidenceVerifier): RuntimePolicy {
  let ai = false, research = false;
  const aiOnly = { ...input, capabilities: { ...input.capabilities, research: false } };
  if (input.capabilities.ai) try {
    liveAiModel(aiOnly);
    assertOperationAllowed(aiOnly, "ai", verify);
    if (input.choices.evidencePolicyRef !== null && verify(`${input.choices.evidencePolicyRef}#openai-transmission`, "evidence-policy")) ai = true;
  } catch { /* Missing or unsupported optional AI leaves the baseline active. */ }
  const candidate = { ...input, capabilities: { ...input.capabilities, ai } };
  if (ai && input.capabilities.research && input.choices.research.provider === "brave-search" && input.choices.research.hosts?.length) try {
    assertOperationAllowed(candidate, "research", verify);
    research = true;
  } catch { /* Research needs its own real license, credentials and budget approvals. */ }
  return Object.freeze({ ...input, capabilities: Object.freeze({ ...input.capabilities, ai, research }) });
}

export type LiveRuntimeOverrides = Readonly<{
  /** Isolated tests only: a synthetic provider transport and owner register. */
  fetcher?: typeof fetch; aiFetcher?: typeof fetch; researchFetcher?: typeof fetch; approvals?: OwnerApprovals;
  /** Isolated integration only, with a synthetic transport and dedicated database. */
  syntheticArchive?: boolean;
  /** The development entry point verifies the owned MySQL datadir before setting this. */
  localFootball?: boolean;
  /** The historical archive command has already verified the owned target. */
  historyBackfill?: boolean;
  onPollerState?: (kind: "results" | "match-details", state: string) => void;
  onHourlyLookupFailure?: (reason: string, fixtureCount: number) => void;
  onForwardFixtureSweep?: (report: ForwardFixtureSweep) => void;
  onHistoryDetailBatch?: Parameters<ReturnType<typeof createFootballHistoryDetails>>[1];
  onDateImportFailure?: Parameters<typeof createDailySelectionService>[0]["onDateImportFailure"];
  onCurrentDayCoverage?: Parameters<typeof createCurrentDayContextJob>[0]["onCoverage"];
}>;
/** Composes the prediction cascade on shared durable stores. */
export async function createLiveRuntime(inputPolicy: RuntimePolicy, overrides: LiveRuntimeOverrides = {}) {
  const verify = liveReadiness(inputPolicy, overrides.approvals), policy = liveOptionalPolicy(inputPolicy, verify), refs = liveReferences(policy);
  const localFootball = overrides.localFootball === true;
  const archiveEnabled = policy.choices.historyImport.enabled;
  const databaseTarget = new URL(policy.secrets.databaseUrl?.read() ?? "about:blank");
  const smokeName = /^(?:[a-z0-9]+_)*smoke(?:_[a-z0-9]+)*$/u;
  const loopback = databaseTarget.hostname === "127.0.0.1";
  const syntheticArchive = overrides.syntheticArchive === true && overrides.fetcher !== undefined && overrides.approvals !== undefined && loopback &&
    (policy.mode === "development" && databaseTarget.pathname === "/goal_hint_test" ||
      policy.mode === "production" && smokeName.test(databaseTarget.pathname.slice(1)) && smokeName.test(decodeURIComponent(databaseTarget.username)));
  const productionTarget = policy.mode === "production" && process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT === "production";
  const privateRetention = verify(refs.retention, "football-private-use");
  const productionHistory = !localFootball && archiveEnabled && privateRetention && (syntheticArchive || productionTarget);
  const coordinated = policy.choices.coordinatedFootball.enabled && (productionTarget || syntheticArchive || localFootball);
  const forecastConcurrency = coordinated ? policy.choices.coordinatedFootball.forecastConcurrency : 0;
  if (localFootball) {
    if (policy.mode !== "development" || databaseTarget.hostname !== "127.0.0.1" || !/^\/goal_hint_football_\d{6}$/u.test(databaseTarget.pathname))
      throw new LiveConfigurationError(["Local football requires the owned loopback snapshot database."]);
  }
  const fetcher = overrides.fetcher === undefined ? {} : { fetcher: overrides.fetcher };
  const database = createDatabase(policy, verify);
  try {
    if (await database.readiness() !== "ready") throw new LiveConfigurationError(["The application database is unavailable."]);
    const queue = createMysqlJobQueue(database, coordinated ? { forecast: { type: LIVE_REFRESH_TYPE, concurrency: forecastConcurrency } } : undefined);
    const providerCoverage = policy.choices.footballResponseArchive.enabled && privateRetention && (productionTarget || syntheticArchive || localFootball)
      ? createMysqlProviderCoverageStore(database) : null;
    const providerArchive = providerCoverage ? bindLiveProviderArchive(providerCoverage.archive) : null;
    let activeWorkload: LiveWorkload | null = null;
    let stableAccountKey: string | null = null;
    const quota = createQuotaRouter({ store: createMysqlQuotaStore(database), readStatus: createAccountStatusReader({ policy, verifyEvidence: verify, ...fetcher,
      ...(providerArchive ? { observeStatus: providerArchive.observeStatus } : {}) }),
      admit: createLiveQuotaAdmission(() => activeWorkload, () => stableAccountKey, productionHistory || coordinated) });
    const day: QuotaDay = await quota.refresh();
    stableAccountKey = day.status.accountKey;
    const baselineWorkload = liveWorkload(day.status.dailyLimit, day.status.secondLimit, day.status.plan, day.status.minuteLimit,
      policy.capabilities.ai, policy.choices.liveDetails.enabled);
    const workload = coordinated ? { ...baselineWorkload,
      cadence: { liveMs: coordinatedResultDefaults.liveMs, dateMs: coordinatedResultDefaults.dateMs,
        activeMs: Math.max(coordinatedResultDefaults.activeMs, baselineWorkload.cadence.activeMs) },
      liveDetails: { ...baselineWorkload.liveDetails, intervalMs: coordinatedLiveDetailDefaults.liveMs },
    } : baselineWorkload;
    activeWorkload = workload;
    const statusEvidenceRef = `${refs.freshness}#status`;
    let results: ResultSyncPolicy | null = null;
    let liveDetailsPolicy: LiveMatchPolicy | null = null;
    // Odds use the same workload inputs as their authority, so a policy can never verify against a different plan.
    const odds = oddsPolicy(policy, refs, workload, localFootball || coordinated);
    let aiModel: ReturnType<typeof liveAiModel> | null = null;
    if (policy.capabilities.ai) try { aiModel = liveAiModel(policy); } catch { /* An unsupported optional model leaves the baseline active. */ }
    // The coordinated cascade can only dispatch models with reviewed numerical eligibility.
    if (coordinated && aiModel?.evaluation.status !== "evaluated") aiModel = null;
    const sourceOrder = coordinated || localFootball ? "ai-first" : liveSourceOrder(policy);
    const selection = Object.freeze({ ...selectionPolicy(policy, refs, workload), ...(coordinated ? { forecastLifecycle: {
      engineVersion: evidenceFingerprint([QUALIFIED_FORECAST_CASCADE, evidenceFirstRecommendationPolicy.version,
        aiModel, LOCAL_GOALS_VERSION, API_FOOTBALL_CONTRACT_VERSION]),
      marketRegistryVersion: MARKET_REGISTRY_VERSION,
    } } : {}) });
    let ai: LiveAiRuntime | null = null;
    const authorities = createLiveAuthorities({ policy, verify, refs, selection, statusEvidenceRef, resultPolicy: () => results, localFootball,
      refreshPacing: workload.pacing, oddsPolicy: odds, liveMatchPolicy: () => liveDetailsPolicy, sourceOrder, coordinatedForecasts: coordinated,
      ...(aiModel === null ? {} : { aiModel, verifyPrimary: (...args) => ai?.verifyAi(...args) === true,
        verifyPrimaryCandidate: (candidate) => ai?.verifyPublishedCandidate(candidate) === true,
        verifyPrimaryGoals: (candidate, distribution) => ai?.verifyPublishedGoalDistribution(candidate, distribution) === true }) });
    const gateway = createPolicyQuotaGateway({ limiter: quota.limiter, policy, verifyEvidence: verify });
    const historySource = productionHistory || (coordinated || localFootball && overrides.historyBackfill) && privateRetention
      ? createFootballHistorySource(database) : null;
    // The adapter identity is the stable provider account; daily limiter accounts sit behind the router.
    const adapterOptions: ApiFootballAdapterOptions = { accountId: day.status.accountKey, credential: { read: () => policy.secrets.footballKey?.read() ?? "" },
      gateway, authorize: () => assertOperationAllowed(policy, "football", verify), ...fetcher,
      ...(providerArchive ? { responseArchive: providerArchive.responseArchive } : {}),
      verifyLogo: authorities.catalog.verifyLogo, verifyRegulationScore: authorities.catalog.verifyRegulationScore,
      // API-Football documents up to 20 IDs per /fixtures?ids request.
      batchEvidence: { maximumIds: 20, evidenceRef: "api-football-documentation-v3:fixtures-ids-maximum-20" },
      verifyBatchEvidence: (evidence) => evidence.maximumIds === 20 };
    const adapter = createApiFootballAdapter(adapterOptions);
    const historyAdapter = historySource ? createApiFootballAdapter({ ...adapterOptions, retainPartiallyNormalizedFixturePages: true,
      observeFixturePage: async (rows, source) => {
        await historySource.savePage({ endpoint: "fixtures", rows, parameters: source.requestParameters, retrievedAt: source.retrievedAt });
      },
      observeCompetitionPage: async (rows, source) => {
        await historySource.savePage({ endpoint: "competitions", rows, parameters: source.requestParameters, retrievedAt: source.retrievedAt });
      } }) : null;
    const cutoff = createCutoffLockingService({ database, queue, policy: cutoffPolicy(refs), authority: authorities.cutoff });
    const forecastRecovery = coordinated ? createForecastRecovery({ database, queue, jobType: LIVE_REFRESH_TYPE,
      scheduleCutoff: (target, tx) => cutoff.scheduleCycle(target, undefined, tx) }) : null;
    const lifecycle = createScheduleLifecycleService({ database, cutoff, policy: lifecyclePolicy(refs), authority: authorities.lifecycle });
    const catalog = createFootballCatalogStore(database, { coordinateFixtureMutation: lifecycle.coordinateFixtureMutation,
      transactionTimeoutMs: 120_000, ...(coordinated ? { sealFixtureResults: true } : {}),
      ...(sourceOrder === "ai-first" ? { sealTeamHistory: true } : {}) });
    const importer = createFootballCatalogImporter({ adapter, store: catalog, authority: authorities.catalog });
    const discoverFixtures = coordinated ? createLiveDiscoveryImport({ importer, competitionIds: policy.choices.competitionIds ?? [],
      retentionEvidenceRef: refs.retention }) : null;
    const historyBackfill = historySource && historyAdapter ? (() => {
      const store = createFootballCatalogStore(database, { historicalResults: true, transactionTimeoutMs: 120_000 });
      const roundSelection = (scope: FixtureRoundQuery) => ({ endpoint: "fixtureRounds", parameters: apiFootballFixtureRoundParameters(scope) } as const);
      return createFootballHistoryBackfill({ competitions: async (query, bounds) => {
        const parameters = query.competitionId === undefined ? {} : { id: String(query.competitionId) };
        const selector = { endpoint: "competitions", parameters } as const;
        const read = async (selection: typeof selector, after: number) => {
          const page = await historySource.latestPage(selection);
          if (!page || page.retrievedAt.getTime() < after) return null;
          const context = { endpoint: "/leagues", retrievedAt: utcInstantFromEpochMilliseconds(page.retrievedAt.getTime()) };
          return page.rows.flatMap((row) => {
            const normalized = normalizeHistoryCompetition(row, context);
            return normalized && (query.competitionId === undefined || normalized.id === query.competitionId) ? [normalized] : [];
          });
        };
        const expires = Date.now() - footballHistoryCatalogMaxAgeMs;
        const saved = await read(selector, expires);
        const cached = saved ?? (query.competitionId === undefined ? null : await read({ ...selector, parameters: {} }, expires));
        if (cached?.length) return { status: "partial", data: cached, error: null, requestsDispatched: 0 };
        const started = Date.now();
        const response = await historyAdapter.evidence.competitions(query, bounds);
        if (response.status !== "failed") {
          const fresh = await read(selector, started);
          if (fresh?.length) return { status: "partial", data: fresh, error: null, requestsDispatched: response.requestsDispatched };
        }
        return response;
      }, store,
        importer: createFootballCatalogImporter({ adapter: historyAdapter, store, authority: authorities.catalog, deferFixtureWritesAbove: 1_000 }),
        competitionIds: policy.choices.competitionIds ?? [], retentionEvidenceRef: refs.retention,
        manifest: createFixtureBackfillManifestStore(historySource),
        ...(coordinated ? { async initializeDate(date) {
          const receipt = await database.query(tx => tx.footballImport.findFirst({
            where: { provider: "api-football", kind: "fixtures", status: "complete", retentionEvidenceRef: refs.retention,
              scopeKey: catalogScopeKey({ kind: "fixtures", query: { date } }) }, select: { id: true },
          }));
          return receipt ? { status: "scanned", reason: null, requests: 0 } :
            { status: "deferred", reason: "current-date-awaiting-discovery", requests: 0 };
        }, repairDate: createFootballHistoryDateRepair({ source: historySource, importer, fetch: adapter.evidence.fixturesByDate,
          competitionIds: policy.choices.competitionIds ?? [], retentionEvidenceRef: refs.retention,
          now: () => utcInstantFromEpochMilliseconds(Date.now()), async readComplete(date) {
            const receipts = await database.query((tx) => tx.footballImport.findMany({ where: { provider: "api-football", kind: "fixtures",
              status: "complete", rejectedCount: 0, subsetEvidenceRef: null, retentionEvidenceRef: refs.retention,
              scopeKey: catalogScopeKey({ kind: "fixtures", query: { date } }), observedAt: { gte: new Date(getReportingDayBounds(date).endExclusive) } },
            orderBy: [{ observedAt: "desc" }, { sequence: "desc" }], take: 4 }));
            const receipt = receipts.find((row) => verifiedFixturePage(row.provenance, { date }, row.observedAt.getTime()));
            return receipt ? catalogImportSummary(receipt) : null;
          } }), } : {}),
        upcomingSeasons: () => readUpcomingFootballHistorySeasons(database, utcInstantFromEpochMilliseconds(Date.now())),
        hasFixtureSource: (parameters, observation) => {
          const selection = { endpoint: "fixtures", parameters } as const;
          return observation ? historySource.hasExactPage(selection, observation) : historySource.hasPage(selection);
        },
        hasExactFixtureScope: async (parameters, observation) => observation.pageId === undefined
          ? historySource.hasExactFixtureScope(parameters, observation)
          : (await historySource.readExactFixtureScope(parameters, observation))?.id === observation.pageId,
        rounds: {
          async read(scope) {
            const page = await historySource.latestPage(roundSelection(scope));
            const rows = page?.rows.map(parseApiFootballFixtureRound);
            return rows?.every((row) => row !== null) ? rows : null;
          },
          fetch: historyAdapter.evidence.fixtureRounds,
          save: (scope, rows, retrievedAt) => historySource.savePage({ ...roundSelection(scope), rows, retrievedAt }),
        },
        recordCoverage: async ({ competitionId, season }, coverage) => {
          await database.query((client) => client.footballSeason.updateMany({ where: { year: season, coverage: { equals: Prisma.DbNull },
            competition: { providers: { some: { provider: "api-football", externalId: BigInt(competitionId) } } } }, data: { coverage } }));
        },
        now: () => utcInstantFromEpochMilliseconds(Date.now()), providerDayEndsAt: () => quota.current()?.endsAt ?? null });
    })() : null;
    const historyDetails = historySource ? createFootballHistoryDetails({ database, adapter: adapter.evidence,
      competitionIds: policy.choices.competitionIds ?? [], batchSize: 20,
      ...(sourceOrder === "ai-first" && privateRetention ? {
        onFinalDetails: createFinalImpliedCountCapture(database, () => verify(refs.retention, "football-private-use")),
      } : {}),
      now: () => utcInstantFromEpochMilliseconds(Date.now()), providerDayEndsAt: () => quota.current()?.endsAt ?? null }) : null;
    const historyReference = historySource ? (() => {
      const now = () => utcInstantFromEpochMilliseconds(Date.now()), providerDayEndsAt = () => quota.current()?.endsAt ?? null;
      const replay = providerArchive ? { replayMaxAgeMs: REFERENCE_RECEIPT_REPLAY_MS } : {};
      const reference = createFootballHistoryReference({ reference: adapter.reference, hasPage: historySource.hasPage,
        savePage: historySource.savePage, now, providerDayEndsAt, ...replay,
        ...(providerCoverage ? { checkpoint: createHistoricalReferenceCheckpoint({ store: providerCoverage,
          accountKey: day.status.accountKey, save: historySource.savePage, now }) } : {}) });
      const playerStatistics = createFootballHistoryPlayerStatistics({ playerStatisticsPage: adapter.reference.playerStatisticsPage,
        readPages: historySource.readPlayerStatisticsPages, savePage: historySource.savePlayerStatisticsPage,
        recordConflict: historySource.recordPlayerStatisticsConflict, now, providerDayEndsAt, ...replay,
        ...(day.status.plan.trim().toLowerCase() === "free" ? { maximumPage: 3 } : {}) });
      const playerProfiles = createFootballHistoryPlayerProfiles({ playerProfilePage: adapter.reference.playerProfilePage,
        readPages: historySource.readPlayerProfilePages, savePage: historySource.savePlayerProfilePage,
        recordConflict: historySource.recordPlayerProfileConflict, now, providerDayEndsAt, ...replay });
      const mappingAuthorized = () => oddsEnabled && odds !== null && authorities.odds.verifyPolicy(odds) &&
        verify(refs.retention, "football-private-use") && authorities.odds.verifyRetention({
          evidenceRef: refs.retention, purpose: "structured-odds-history", rawPayloadsStored: false,
        });
      const oddsMapping = createFootballHistoryOddsMapping({ mappingPage: adapter.odds.mappingPage,
        readPages: historySource.readOddsMappingPages, savePage: historySource.saveOddsMappingPage, now, providerDayEndsAt,
        authorized: mappingAuthorized, async canDispatch() {
          const usage = await oddsUsage();
          return usage !== null && oddsQuotaAllows(usage, enrichmentAllowance, 1);
        } });
      const approved = policy.choices.competitionIds ?? [];
      return async (input: Readonly<{ maxRequests: number; competitionId?: number; dataset?: HistoryReferenceDataset }>, signal?: AbortSignal) => {
        if (input.competitionId !== undefined && !approved.includes(input.competitionId)) throw new RangeError("Choose an approved competition.");
        if (!Number.isSafeInteger(input.maxRequests) || input.maxRequests < 1 || input.maxRequests > historyBackfillLimits.maximumRequests) {
          throw new RangeError("Choose a historical reference request limit between 1 and 100.");
        }
        const globalScope = input.competitionId === undefined;
        const startedAt = now(), initialProviderDayEndsAt = providerDayEndsAt();
        const scope = input.competitionId === undefined ? approved : [input.competitionId], workflow = signal ? { signal } : {};
        const runPlayers = async (maxRequests: number) => playerStatistics.run({
          targets: await readHistoryPlayerStatisticsTargets(database, scope), maxRequests, ...workflow,
        });
        const runProfiles = (maxRequests: number) => playerProfiles.run({ maxRequests, ...workflow });
        if (input.dataset === "player-statistics") return runPlayers(input.maxRequests);
        if (input.dataset === "player-profiles") {
          if (!globalScope) throw new RangeError("The player profile catalog uses global scope.");
          return runProfiles(input.maxRequests);
        }
        const runOddsMapping = (maxRequests: number) => oddsMapping.run(maxRequests, signal);
        if (input.dataset === "odds-mapping") {
          if (!globalScope) throw new RangeError("Odds mapping uses global scope.");
          return runOddsMapping(input.maxRequests);
        }
        const playerEndpoint = ([
          ["player-teams", "playerTeams"], ["player-season-history", "playerSeasonHistory"], ["player-transfers", "playerTransfers"],
        ] as const).find(([dataset]) => dataset === input.dataset)?.[1];
        const personDataset = playerEndpoint !== undefined || input.dataset === "trophies" || input.dataset === "sidelined" ||
          input.dataset === "coach-profiles";
        if (personDataset && !globalScope) throw new RangeError("Person archive datasets use global scope.");
        if (!globalScope && (input.dataset === "teams-by-country" || input.dataset === "venues-by-country")) {
          throw new RangeError("Country archive datasets use global scope.");
        }
        const countryTeamDataset = input.dataset === "transfers" || input.dataset === "coaches" || input.dataset === "squads" ||
          input.dataset === "team-seasons";
        const subjectDiscovery = globalScope && (input.dataset === undefined || personDataset || countryTeamDataset)
          ? await historySource.indexSubjects() : null;
        const pendingDiscovery = Boolean(subjectDiscovery?.hasMore || subjectDiscovery?.hasInvalid);
        const runPlayerHistory = async (endpoint: FootballHistoryPlayerSubjectDataset, maxRequests: number) => {
          const playerIds = await readPendingHistorySubjectIds(database, endpoint, "player", maxRequests + 1);
          const targets = playerIds.slice(0, maxRequests).map((playerId) => ({ endpoint, playerId }));
          return reference.run({ targets, hasMoreTargets: pendingDiscovery || playerIds.length > maxRequests, maxRequests, ...workflow });
        };
        const runReference = async (maxRequests: number) => {
          const plan = await readHistoryReferenceTargets(database, scope, input.dataset, maxRequests, globalScope);
          return reference.run({ ...plan, hasMoreTargets: plan.hasMoreTargets || pendingDiscovery, maxRequests, ...workflow });
        };
        if (playerEndpoint !== undefined) return { ...await runPlayerHistory(playerEndpoint, input.maxRequests), subjectDiscovery };
        if (input.dataset !== undefined) return { ...await runReference(input.maxRequests), ...(subjectDiscovery ? { subjectDiscovery } : {}) };

        // Rotate by durable progress, including when live work leaves room for just one request.
        const mappingAllowed = mappingAuthorized();
        const order = (await historySource.referencePhaseOrder(globalScope)).filter((phase) => phase !== "oddsMapping" || mappingAllowed);
        const runners = { playerStatistics: runPlayers, playerProfiles: runProfiles, oddsMapping: runOddsMapping, reference: runReference,
          playerTeams: (limit: number) => runPlayerHistory("playerTeams", limit),
          playerSeasonHistory: (limit: number) => runPlayerHistory("playerSeasonHistory", limit),
          playerTransfers: (limit: number) => runPlayerHistory("playerTransfers", limit),
        };
        type ReferenceReport = Awaited<ReturnType<typeof runPlayers>> | Awaited<ReturnType<typeof runReference>> | Awaited<ReturnType<typeof runOddsMapping>>;
        const phases: Record<FootballHistoryReferencePhase, ReferenceReport | null> = {
          playerStatistics: null, playerProfiles: null, playerTeams: null, playerSeasonHistory: null, playerTransfers: null, oddsMapping: null, reference: null,
        };
        const blocked = (result: Readonly<{ stopped: string | null }> | null) =>
          Boolean(result?.stopped && result.stopped !== "request-budget" && result.stopped !== "target-limit");
        const totals = { requested: 0, archived: 0, skipped: 0, deferred: 0, requests: 0 };
        const bulkPhase = (phase: FootballHistoryReferencePhase) => phase !== "playerStatistics" && phase !== "playerProfiles";
        for (const [index, phase] of order.entries()) {
          const remaining = input.maxRequests - totals.requests;
          if (remaining < 1) break;
          const allowance = bulkPhase(phase) ? Math.max(1, Math.floor(
            (remaining - (order.length - index - 1)) / order.slice(index).filter(bulkPhase).length)) : 1;
          const report = phases[phase] = await runners[phase](allowance);
          for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += report[key];
          if (blocked(report) && (phase !== "oddsMapping" ||
              !["odds-mapping-quota-unavailable", "odds-mapping-archive-invalid", "pagination-incomplete", "schema-error", "coverage-error"].includes(report.stopped ?? ""))) break;
        }
        const reports = Object.values(phases).filter((report) => report !== null);
        const complete = reports.length === order.length && reports.every(({ status }) => status === "complete");
        const stopped = reports.find(blocked)?.stopped ??
          (reports.length < order.length || reports.some(({ stopped }) => stopped === "request-budget") ? "request-budget" :
            reports.some(({ stopped }) => stopped === "target-limit") ? "target-limit" : null);
        const verification = verifyFootballHistoryReferencePass({ globalScope, interrupted: signal?.aborted ?? false, startedAt,
          checkedAt: now(), providerDayEndsAt: initialProviderDayEndsAt, currentProviderDayEndsAt: providerDayEndsAt(),
          mappingAuthorized: mappingAllowed && mappingAuthorized(), subjectDiscovery, phases });
        return { status: complete ? "complete" as const : "partial" as const, ...totals, stopped, subjectDiscovery, ...phases, verification };
      };
    })() : null;
    // Hourly calls use the shared quota limiter and preserve the ordinary reserve on paid plans.
    const hourlySelectionEnabled = workload.dailyLimit >= 7_500 && workload.refreshCapacity > 0;
    const hourlyImporter = {
      async import(...[input, verifyScope, workflow]: Parameters<typeof importer.import>) {
        const request = parseCatalogImportRequest(input);
        if (await quota.remaining() < workload.refreshFloor + request.bounds.maxRequests)
          throw new HourlyScheduleQuotaUnavailable();
        return importer.import(request, verifyScope, workflow);
      },
    };
    const selectionStore = createMysqlDailySelectionStore(database, queue, hourlySelectionEnabled
      ? { hourly: { localEvidence: sourceOrder === "ai-first",
        ...(coordinated ? { reuseFutureDates: workload.importDays } : {}),
        scheduleCutoff: ({ fixtureId, cycleId }, tx) => cutoff.scheduleCycle({ fixtureId, cycleId }, undefined, tx) } } : {});
    const hourlyFixtureReconciler = hourlySelectionEnabled ? createHourlyFixtureReconciler({ database, importer: hourlyImporter,
      policy: selection, includeOverdue: coordinated,
      ...(overrides.onHourlyLookupFailure ? { onLookupFailure: overrides.onHourlyLookupFailure } : {}) }) : null;
    const dailySelection = createDailySelectionService({ policy: selection, authority: authorities.selection, store: selectionStore, importer, cutoff,
      ...(overrides.onDateImportFailure ? { onDateImportFailure: overrides.onDateImportFailure } : {}),
      ...(hourlyFixtureReconciler ? { hourlyImporter, reconcileHourly: hourlyFixtureReconciler.reconcile,
        ...(coordinated ? { sweepUpcoming: async (...args: Parameters<typeof hourlyFixtureReconciler.sweepUpcoming>) => {
          try {
            const report = await hourlyFixtureReconciler.sweepUpcoming(...args);
            overrides.onForwardFixtureSweep?.(report);
          }
          catch (error) { overrides.onHourlyLookupFailure?.(error instanceof DatabaseOperationError ? error.code : "forward-sweep-unavailable", 0); }
        } } : {}) } : {}) });
    // Long-lived performance quotes also require the development-only capture policy.
    const publisher = createRevisionPublicationService({ database, queue, policy: publicationPolicy(refs), authority: authorities.publication,
      recordForecastDecision: coordinated,
      quotes: { verify: () => publicPolicy.features.providerOdds && authorities.odds.verifyPublicDisplay() === true,
        freshnessMs: odds?.freshnessMs ?? ODDS_FRESHNESS_MS } });
    const evidence = createEvidenceService({ authority: authorities.evidence, store: createMysqlEvidenceStore(database), research: null,
      // Live imports finish before analysis; collection saves only the frozen canonical sources.
      football: { async collect() { throw new Error("Live evidence collection uses stored sources only."); } } });
    const providerFallback = createProviderFallbackAdapter({ adapter, catalog, policy: providerFallbackPolicy(refs),
      authority: authorities.providerFallback, maxJobs: 1000 });
    const fallback = createFallbackService({ fallback: providerFallback, authority: authorities.fallback, maxInflight: 100,
      localEngine: createLiveLocalEngine(database, coordinated && providerArchive
        ? { verifyPrivateUse: () => verify(refs.retention, "football-private-use") } : undefined),
      selectionPolicy: sourceOrder === "provider-first" ? "provider-baseline" : "optional-ai-primary", verifyRequest: authorities.verifyFallbackRequest });
    const refreshStore = createMysqlRefreshStore(database, queue);
    if (aiModel !== null) try { ai = await createLiveAiRuntime({ policy, verify, refs, model: aiModel, database, store: refreshStore,
      evidenceAuthority: authorities.evidence, pacing: workload.pacing, fallbackReserveMs: refreshEnvelopeFor(workload.pacing, true).fallbackReserveMs,
      sourceOrder, coordinated,
      ...(overrides.aiFetcher === undefined ? {} : { fetcher: overrides.aiFetcher }) }); } catch { /* Optional AI startup/accounting failure preserves baseline publication. */ }
    let research: Awaited<ReturnType<typeof createLiveResearchRuntime>> | null = null;
    if (ai !== null && aiModel !== null && policy.capabilities.research) try { research = await createLiveResearchRuntime({ policy, verify, refs, model: aiModel,
      database, evidenceAuthority: authorities.evidence, fallbackReserveMs: refreshEnvelopeFor(workload.pacing, true).fallbackReserveMs,
      ...(overrides.researchFetcher ? { fetcher: overrides.researchFetcher } : {}) }); } catch { /* Optional research startup failure preserves the baseline and AI structured evidence. */ }
    const footballPreparation = ai !== null || sourceOrder === "ai-first"
      ? createLiveFootballPreparation({ importer, refs, pacing: workload.pacing,
        ...(ai !== null || localFootball ? { adapter: adapter.evidence, database } : {}) }) : null;
    const refresh = createPredictionRefreshService({ type: LIVE_REFRESH_TYPE, handlerVersion: 1, store: refreshStore,
      selection: selectionStore, authority: authorities.refresh,
      ...(selection.forecastLifecycle ? { forecastLifecycle: selection.forecastLifecycle } : {}),
      prepare: async (member, context) => {
        const football = await footballPreparation?.(member, context);
        let news: readonly import("../evidence/evidence-contract.ts").EvidenceSource[] = [];
        let reason: string | null = policy.capabilities.research ? "unavailable" : "unconfigured";
        if (research) try { const result = await research.prepare(member, context); news = result.sources; reason = result.reason; }
        catch { reason = "unavailable"; }
        return { sources: [...(football?.sources ?? []), ...news], research: { status: reason === null ? "completed" as const : "denied" as const, reason } };
      },
      configure: async (member) => {
        const history = await readLiveFootballSources(database, member.context, liveAiEvidencePolicy(refs), refs).catch(() => []);
        const stage = await refreshStore.stage(member.jobId, "preparation", "completed");
        const extra = (stage?.value as { sources?: import("../evidence/evidence-contract.ts").EvidenceSource[] } | undefined)?.sources ?? [];
        const sources = fitLiveFootballSources(member.context, liveAiEvidencePolicy(refs), authorities.evidence, history, extra);
        const base = fallbackRefreshPlan(member, refs, workload.pacing);
        const reviewed = ai?.configure(member, sources) ??
          { ...base, evidence: { ...base.evidence, policy: liveAiEvidencePolicy(refs), cachedSources: sources } };
        if (coordinated) return liveCascadePlan({ ...reviewed, recommendationPolicy: evidenceFirstRecommendationPolicy }, false, QUALIFIED_FORECAST_CASCADE);
        return sourceOrder === "ai-first" ? liveCascadePlan(reviewed) : reviewed;
      },
      models: ai?.models ?? { async resolve() { throw new ModelRegistryError("unavailable"); } },
      predictor: ai?.predictor ?? { async predict() { return { status: "denied", reason: "unconfigured", requestsDispatched: 0, requestCountUnknown: false }; } },
      evidence, fallback, lifecycle, publisher, costs: { ai: ai?.costs ?? null, research: research?.costs ?? null },
      recommendations: { quotes: odds === null ? async () => [] : createRecommendationQuoteLoader(database, {
        bookmakerId: odds.bookmakerId, fallbackBookmakerIds: policy.choices.odds.fallbackBookmakerIds,
        freshnessMs: odds.freshnessMs, expectedPolicyHash: evidenceFingerprint(odds),
        verifyInternalUse: () => policy.capabilities.football && verify(refs.retention, "football-private-use") &&
          authorities.odds.verifyPolicy(odds) === true && authorities.odds.verifyRetention({ evidenceRef: refs.retention,
            purpose: "structured-odds-history", rawPayloadsStored: false }) === true }) },
      observation: createRefreshObservationCollector({ adapter: adapter.evidence, evidenceRef: statusEvidenceRef, verifyResponse: authorities.verifyStatusResponse }) });
    const settlement = createMarketSettlementService({ database, queue, extendedMarketsEnabled: sourceOrder === "ai-first" });
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
    const hourlySelectionDefinition = defineJob({ type: HOURLY_SELECTION_TYPE, handlerVersion: 1, payload: scheduledHourlySelection,
      async handle(payload, context) {
        if (!hourlySelectionEnabled) return { status: "succeeded" };
        await context.checkpoint();
        const { window } = hourlySelectionWindow(payload.scheduledFor, selection.windowDays);
        // Commit verified slices when a provider retry has left some dates unavailable.
        const degrade = workload.importDays < (selection.windowDays ?? 7) || context.lease.job.attemptCount >= 2;
        try {
          const result = await dailySelection.runHourly(payload.scheduledFor, context.signal, degrade ? {
            actor: LIVE_ACTOR, policyRef: selection.degradationPolicyRef!,
            evidenceRef: `${selection.degradationPolicyRef}:${window.runDate}`,
          } : undefined);
          await context.checkpoint();
          return result.status === "busy" ? { status: "failed", reason: "handler-failed", retryable: true } : { status: "succeeded" };
        } catch (error) {
          return { status: "failed", reason: "handler-failed", retryable: error instanceof DailySelectionError &&
            ["incomplete-import", "lost-lease", "unavailable"].includes(error.reason) };
        }
      } });
    const registry = createJobRegistry([selectionDefinition, hourlySelectionDefinition, refreshDefinition, createCutoffJob(cutoff)]);

    // Odds (052): imported only when the owner enables them AND the verified plan leaves spare ordinary quota.
    // A separate registry runs on its own worker, so odds never occupy refresh or cutoff workers.
    const oddsEnabled = policy.choices.odds.enabled && workload.odds.eligible && odds !== null;
    const hostedOddsArchive = oddsEnabled && privateRetention && (productionTarget || syntheticArchive);
    const resumePricePages = coordinated || hostedOddsArchive;
    const oddsStore = createMysqlOddsStore(database);
    const oddsService = createOddsImportService({ adapter: adapter.odds, store: oddsStore, authority: authorities.odds,
      resumePricePages,
      accountId: () => quota.current()?.accountId ?? oddsFail("unavailable"),
      bounds: (request) => {
        const end = request.kind === "prices" ? request.slot + ODDS_SWEEP_MS : request.slot + DAY_MS;
        // The provider walk ends early enough that the receipt and per-fixture writes keep their own part of the job timeout.
        const deadline = utcInstantFromEpochMilliseconds(Math.min(Date.now() + ODDS_PROVIDER_WINDOW_MS, end));
        return request.kind === "prices" ? oddsImportBounds(deadline, workload.odds.maxPages) : oddsCatalogBounds(deadline);
      } });
    /** The odds, team code and history jobs share one spare. The limiter counts every enrichment dispatch,
     * including uncertain ones. Null while the provider day is settling. */
    async function oddsUsage(): Promise<OddsQuotaUsage | null> {
      const counters = await quota.counters();
      if (counters === null) return null;
      const { accountId, periodId } = counters.day;
      const [row] = await database.query((tx) => tx.$queryRaw<{ spent: bigint | number }[]>`SELECT COUNT(*) AS spent FROM ApiQuotaAttempt
        WHERE accountId = ${accountId} AND periodId = ${periodId}
          AND priority IN (${quotaPriorities.enrichment.rank}, ${quotaPriorities["historical-backfill"].rank})
          AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.priority')) = 'enrichment' AND dispatchedAt IS NOT NULL`);
      return Object.freeze({ remaining: counters.remaining, used: counters.used, oddsUsed: Number(row?.spent ?? 0) });
    }
    const enrichmentAllowance = Object.freeze({ floor: workload.odds.floor, spare: workload.odds.spare, reserve: workload.odds.reserve });
    const verifyOddsProjection = () => odds !== null && authorities.odds.verifyPublicDisplay() &&
      authorities.odds.verifyPolicy(odds) && authorities.odds.verifyRetention({
        evidenceRef: refs.retention, purpose: "structured-odds-history", rawPayloadsStored: false,
      });
    async function projectAuthorizedStoredOdds() {
      if (localFootball || !oddsEnabled || odds === null || !verifyOddsProjection()) return null;
      const catalog = await oddsStore.latestBetCatalog();
      if (!catalog) return null;
      return oddsStore.projectRetainedPrices({ policy: odds, policyHash: oddsPolicyHash(odds), catalog,
        limit: 500, verify: verifyOddsProjection });
    }
    async function requalifyLocalOdds() {
      if (!localFootball || !odds || !oddsEnabled) return oddsFail("unverified-policy");
      const current = quota.current();
      if (!current) return oddsFail("unavailable");
      if (!verifyOddsProjection()) return oddsFail("unverified-policy");
      const catalogService = createOddsImportService({ adapter: adapter.odds, store: oddsStore, authority: authorities.odds,
        accountId: () => current.accountId,
        bounds: () => ({ ...oddsCatalogBounds(utcInstantFromEpochMilliseconds(Math.min(Date.now() + 20_000, current.endsAt))),
          timeoutMs: 15_000, maxRequests: 1, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 } }),
      });
      let requests = 0;
      for (const kind of ["bets", "bookmakers"] as const) {
        if (await oddsStore.hasCompleteCatalog(kind, current.startsAt)) continue;
        const usage = await oddsUsage();
        if (!usage || !oddsQuotaAllows(usage, enrichmentAllowance, 1)) return oddsFail("unavailable");
        const id = evidenceFingerprint({ kind, slot: current.startsAt, purpose: "local-odds-requalification" });
        const summary = await catalogService.importCatalog({ id, kind, date: null, policy: odds, slot: current.startsAt });
        requests += summary.requestsDispatched;
        if (summary.status !== "complete") return { requests, scanned: 0, updated: 0, status: summary.status, catalog: kind };
      }
      const catalog = await oddsStore.latestBetCatalog();
      if (!catalog) return oddsFail("unavailable");
      return { requests, status: "complete", ...await oddsStore.projectRetainedPrices({ policy: odds,
        policyHash: oddsPolicyHash(odds), catalog, limit: 500, verify: verifyOddsProjection }) };
    }
    const oddsDefinitions = createOddsJobDefinitions({ service: oddsService, policy: () => odds ?? oddsFail("unverified-policy"), resumePricePages,
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
    const replayHistory = productionHistory && historySource ? createFootballHistoryFixtureReplay(database, authorities.catalog, refs.retention) : null;
    const currentDayContext = coordinated && hourlySelectionEnabled && historySource ? createCurrentDayContextJob({ database,
      competitionIds: policy.choices.competitionIds ?? [], retentionEvidenceRef: refs.retention,
      reference: createFootballHistoryReference({ reference: adapter.reference, priority: "enrichment", now: () => utcInstantFromEpochMilliseconds(Date.now()),
        providerDayEndsAt: () => quota.current()?.endsAt ?? null, savePage: historySource.savePage,
        hasPage: (selector) => {
          const freshness = currentReferenceFreshness(selector.endpoint);
          return historySource.hasPage(selector, freshness === undefined ? undefined : Date.now() - freshness);
        }, ...(providerArchive ? { replayMaxAgeMs: REFERENCE_RECEIPT_REPLAY_MS } : {}) }),
      refreshPlayers(date, targets, signal) {
        const pager = createFootballHistoryPlayerStatistics({ ...historySource.playerStatisticsSnapshot(date), priority: "enrichment",
          maxRequestsPerTarget: Math.max(1, Math.ceil(currentPlayerRequestLimit / targets.length)),
          playerStatisticsPage: adapter.reference.playerStatisticsPage,
          now: () => utcInstantFromEpochMilliseconds(Date.now()), providerDayEndsAt: () => quota.current()?.endsAt ?? null });
        return pager.run({ targets, maxRequests: currentPlayerRequestLimit, signal });
      },
      ...(overrides.onCurrentDayCoverage ? { onCoverage: overrides.onCurrentDayCoverage } : {}),
    }) : null;
    const archiveBatch = { maxRequests: 6 };
    function referenceStep(dataset: HistoryReferenceDataset, endpoint: string) {
      return async (signal: AbortSignal) => {
        if (!historyReference) throw new Error("Reference coverage is unavailable.");
        const report = await historyReference({ ...archiveBatch, dataset }, signal);
        const imported = await database.query((client) => client.footballHistorySourcePage.count({ where: { endpoint } }));
        const complete = report.status === "complete";
        return { complete, stopped: report.stopped, coverage: { imported, remaining: complete ? 0 : null, unavailable: null } };
      };
    }
    const historyJob = createHistoryImportJob({ database, queue, enabled: productionHistory,
      steps: historySource && historyBackfill && historyDetails && historyReference && replayHistory ? {
        async fixtures(signal) {
          const result = await historyBackfill(archiveBatch, undefined, signal);
          if (result.status === "catalog-unavailable") return { complete: false, stopped: result.reason ?? "catalog-unavailable",
            coverage: { imported: null, remaining: null, unavailable: null } };
          return { complete: result.status === "complete", stopped: result.stopped, coverage: {
            imported: result.completed - result.verifiedEmpty,
            remaining: coordinated && result.unlistedCompetitions.length > 0 ? null : result.planned - result.completed,
            unavailable: result.verifiedEmpty, ...(coordinated && result.anchorDate ? { scan: {
              date: result.anchorDate, dateScanned: result.dateScanned, dateComplete: null,
              scannedSeasons: result.scannedSeasons, partialSeasons: result.partialSeasons, nextScope: result.nextScope,
              ...(result.dateRepair && { dateRepair: { ...result.dateRepair, complete: result.dateComplete === true } }),
            } } : {}) } };
        },
        async replay(signal) {
          const result = await replayHistory(signal);
          const imported = await database.query((client) => client.footballImport.count({ where: { provider: "api-football",
            kind: historyReplayKind, status: "complete", retentionEvidenceRef: refs.retention } }));
          return { complete: result.status === "complete", stopped: result.stopped,
            coverage: { imported, remaining: result.pending, unavailable: null } };
        },
        async details(signal) {
          const result = await historyDetails(archiveBatch, overrides.onHistoryDetailBatch, signal);
          const { eligible, storedComplete, unsupported, exhausted, delayed, due } = result.coverage;
          return { complete: result.passComplete && due + delayed + exhausted === 0, stopped: result.stopped,
            coverage: { imported: storedComplete, remaining: eligible - storedComplete - unsupported, unavailable: unsupported } };
        },
        "half-statistics": referenceStep("half-statistics", "fixtureHalfStatistics"),
        "team-statistics": referenceStep("team-statistics", "teamStatistics"),
        "player-statistics": referenceStep("player-statistics", "playerStatistics"),
        async reference(signal) {
          const result = await historyReference(archiveBatch, signal);
          const complete = result.status === "complete";
          return { complete, stopped: result.stopped,
            coverage: { imported: null, remaining: complete ? 0 : null, unavailable: null } };
        },
        ...(oddsEnabled ? { async "odds-mapping"(signal) {
          const result = await historyReference({ ...archiveBatch, dataset: "odds-mapping" }, signal);
          if (!("totalPages" in result)) throw new Error("Odds mapping coverage is unavailable.");
          return { complete: result.status === "complete", stopped: result.stopped,
            coverage: { imported: result.pagesVerified, remaining: result.totalPages === null ? null : result.totalPages - result.pagesVerified,
              unavailable: null } };
        } } : {}),
      } : {},
    });
    // The same worker serializes these gates. Odds and team codes claim before the archive.
    const enrichmentRegistry = createJobRegistry([...oddsDefinitions, ...teamCodeDefinitions, historyJob, ...(currentDayContext ? [currentDayContext] : [])]);
    const retainInPlayOdds = coordinated || hostedOddsArchive;
    const inPlayOdds = localFootball || retainInPlayOdds ? createInPlayOddsPoller({
      database, adapter: adapter.odds, now: Date.now, enabled: () => oddsEnabled && quota.current() !== null,
      displayAllowed: authorities.odds.verifyPublicDisplay,
      ...(retainInPlayOdds ? { competitionIds: policy.choices.competitionIds ?? [],
        retentionAllowed: () => privateRetention && odds !== null && authorities.odds.verifyPolicy(odds) &&
        authorities.odds.verifyRetention({ evidenceRef: refs.retention, purpose: "structured-odds-history", rawPayloadsStored: false }) } : {}),
    }) : null;

    /** Follow configured stored fixtures even when a fixture received no prediction. */
    async function resultCoverage(): Promise<ResultSyncPolicy["coverage"]> {
      const now = Date.now();
      const ids = Prisma.join(policy.choices.competitionIds!);
      const rows = await database.query((tx) => tx.$queryRaw<{ competitionId: bigint; season: number }[]>(Prisma.sql`
        SELECT DISTINCT cp.externalId AS competitionId, s.year AS season FROM FootballFixture f
        JOIN FootballSeason s ON s.id = f.seasonId
        JOIN FootballCompetitionProvider cp ON cp.competitionId = s.competitionId AND cp.provider = 'api-football'
        WHERE cp.externalId IN (${ids}) AND (f.status = 'live' AND (${!coordinated} OR f.kickoff >= ${new Date(now - 3 * DAY_MS)}) OR
          (f.kickoff >= ${new Date(now - 3 * DAY_MS)} AND f.kickoff < ${new Date(now + 8 * DAY_MS)}))
        ${coordinated ? Prisma.sql`UNION DISTINCT
          SELECT cp.externalId AS competitionId, s.year AS season FROM FootballSeason s
          JOIN FootballCompetitionProvider cp ON cp.competitionId = s.competitionId AND cp.provider = 'api-football'
          WHERE cp.externalId IN (${ids}) AND s.current = TRUE` : Prisma.empty}
        ORDER BY competitionId, season LIMIT ${maximumCompetitionScope}`));
      return rows.map((row) => ({ competitionId: Number(row.competitionId), season: row.season }));
    }
    let latestDetails: ApiFootballResult<NormalizedFixtureMatchDetails> | null = null;
    let detailPoller: Readonly<{ policy: LiveMatchPolicy; service: ReturnType<typeof createLiveMatchService> }> | null = null;
    let poller: Readonly<{ policy: ResultSyncPolicy; accountId: string; service: ReturnType<typeof createResultSyncService> }> | null = null;
    /** Rebuilds the leased poller when its coverage or provider-day quota account changes. */
    async function resultPoller(cadence?: LiveWorkload["cadence"]) {
      const current = quota.current(), coverage = await resultCoverage();
      if (current === null) return poller;
      if (coverage.length === 0) { results = null; poller = null; return null; }
      const base = resultSyncPolicy(refs, cadence ? { ...workload, cadence } : workload, coverage, localFootball, coordinated);
      const next = Object.freeze({ ...base, ...(coordinated ? { archiveCompetitionIds: policy.choices.competitionIds! } : {}) });
      if (poller && poller.accountId === current.accountId && evidenceFingerprint(poller.policy) === evidenceFingerprint(next)) return poller;
      results = next;
      // The poller lease belongs to the shared quota account row, so it follows the active provider day.
      poller = Object.freeze({ policy: next, accountId: current.accountId, service: createResultSyncService({ accountId: current.accountId,
        policy: next, authority: authorities.results, adapter: coordinated ? { ...adapter.evidence, async liveFixtures(bounds, workflow) {
          latestDetails = await adapter.evidence.liveFixtureDetails(bounds, workflow);
          detailPoller?.service.observeLiveFixtureDetails(latestDetails);
          return latestDetails;
        } } : adapter.evidence,
        ...(discoverFixtures ? { onDiscoveredFixtures: discoverFixtures } : {}),
        ...(overrides.onPollerState ? { onState: (state) => overrides.onPollerState?.("results", state) } : {}),
        store: createMysqlResultSyncStore({ database, accountId: current.accountId, lifecycle }) }) });
      return poller;
    }
    /** Detail collection covers configured stored fixtures, including those without predictions. */
    async function liveMatchPoller(intervalMultiplier = 1) {
      if (!workload.liveDetails.eligible || quota.current() === null) return null;
      const coverage = await resultCoverage();
      if (coverage.length === 0) { liveDetailsPolicy = null; detailPoller = null; return null; }
      const paced = intervalMultiplier > 1 ? { ...workload, liveDetails: { ...workload.liveDetails,
        intervalMs: workload.liveDetails.intervalMs * intervalMultiplier } } : workload;
      const next = liveMatchPolicy(refs, paced, coverage, localFootball || coordinated, coordinated);
      if (detailPoller && evidenceFingerprint(detailPoller.policy) === evidenceFingerprint(next)) return detailPoller;
      liveDetailsPolicy = next;
      detailPoller = Object.freeze({ policy: next, service: createLiveMatchService({ accountKey: day.status.accountKey,
        policy: next, authority: authorities.liveMatch, adapter: adapter.evidence,
        ...(localFootball || coordinated ? { batchDetails: adapter.evidence.matchDetails } : {}),
        ...(coordinated ? { supplements: { lineups: adapter.evidence.availability, players: adapter.evidence.fixturePlayers,
          halfStatistics: adapter.reference.page } } : {}),
        ...(overrides.onPollerState ? { onState: (state) => overrides.onPollerState?.("match-details", state) } : {}),
        store: createMysqlLiveMatchStore({ database, accountKey: day.status.accountKey }) }) });
      if (latestDetails) detailPoller.service.observeLiveFixtureDetails(latestDetails);
      return detailPoller;
    }
    return Object.freeze({ policy, database, queue, quota, workload, registry, hourlySelectionEnabled, settlement, cache, catalog: importer,
      historyBackfill, historyDetails, historyReference, resultPoller, liveMatchPoller, inPlayOdds, day,
      coordinated, forecastConcurrency, forecastRecovery, currentDayContextEnabled: currentDayContext !== null,
      odds: Object.freeze({ enabled: oddsEnabled, registry: oddsRegistry, horizonDays: workload.odds.dates, bookmakerScope: odds?.bookmakerScope,
        requalifyLocal: requalifyLocalOdds, projectAuthorizedStored: projectAuthorizedStoredOdds,
        catalogCoverage: (asOf: number) => database.query((tx) => storedPreMatchCatalogCoverage(tx, asOf)),
        // Write-time staleness needs no provider call, so it runs even while imports are off.
        expire: (limit: number) => oddsService.expire(odds?.freshnessMs ?? ODDS_FRESHNESS_MS, limit) }),
      teamCodes: Object.freeze({ enabled: teamCodesEnabled, registry: teamCodesRegistry }),
      enrichment: Object.freeze({ registry: enrichmentRegistry, historyEnabled: productionHistory }),
      now: () => utcInstantFromEpochMilliseconds(Date.now()), close: () => database.disconnect() });
  } catch (error) { await database.disconnect().catch(() => {}); throw error; }
}
export type LiveRuntime = Awaited<ReturnType<typeof createLiveRuntime>>;

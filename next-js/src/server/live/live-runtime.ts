import "server-only";
import { createRecommendationQuoteLoader } from "../odds/recommendation-quotes.ts";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { assertOperationAllowed, type RuntimePolicy, type EvidenceVerifier } from "../config/runtime-policy.ts";
import { createMysqlPublicCacheStore } from "../cache/mysql-public-cache.ts";
import { createDatabase } from "../database/client.ts";
import { createEvidenceService } from "../evidence/evidence-service.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { createProviderFallbackAdapter } from "../fallback/fallback-adapter.ts";
import { createFallbackService } from "../fallback/fallback-service.ts";
import { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { apiFootballFixtureRoundParameters, parseApiFootballFixtureRound, type FixtureRoundQuery } from "../football/api-football-contract.ts";
import { createFootballCatalogStore } from "../football/catalog-mysql-store.ts";
import { createFootballCatalogImporter } from "../football/catalog-service.ts";
import { createFootballHistoryBackfill, historyBackfillLimits, normalizeHistoryCompetition } from "../football/history-backfill.ts";
import { createFootballHistoryDetails } from "../football/history-details.ts";
import { footballHistoryCatalogMaxAgeMs, readUpcomingFootballHistorySeasons } from "../football/history-fixture-scope.ts";
import { createFootballHistoryOddsMapping } from "../football/history-odds-mapping.ts";
import { createFootballHistoryPlayerProfiles, createFootballHistoryPlayerStatistics } from "../football/history-player-statistics.ts";
import { createFootballHistoryReference, verifyFootballHistoryReferencePass } from "../football/history-reference.ts";
import { readHistoryPlayerStatisticsTargets, readHistoryReferenceTargets, type HistoryReferenceDataset } from "../football/history-reference-targets.ts";
import { createFootballHistorySource, type FootballHistoryReferencePhase } from "../football/history-source.ts";
import { readPendingHistorySubjectIds, type FootballHistoryPlayerSubjectDataset } from "../football/history-subjects.ts";
import { quotaPriorities } from "../football/quota-contract.ts";
import { createPolicyQuotaGateway } from "../football/quota-gateway.ts";
import { createMysqlQuotaStore } from "../football/quota-mysql-store.ts";
import { createLiveLocalEngine } from "../intelligence/live-local-engine.ts";
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
import { oddsPolicyHash } from "../odds/odds-input.ts";
import { createOddsImportService } from "../odds/odds-service.ts";
import { createInPlayOddsPoller } from "../odds/in-play-odds-service.ts";
import { createTeamCodeJobDefinitions } from "../teams/team-code-jobs.ts";
import { createMysqlTeamCodeStore } from "../teams/team-code-mysql-store.ts";
import { createTeamCodeService } from "../teams/team-code-service.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { LiveMatchPolicy } from "../live-match/live-match-contract.ts";
import { createLiveMatchService } from "../live-match/live-match-service.ts";
import { createMysqlLiveMatchStore } from "../live-match/live-match-mysql-store.ts";
import { createLiveQuotaAdmission } from "./live-detail-quota.ts";
import { liveMatchPolicy, type LiveWorkload } from "./live-plan.ts";

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
  /** The development entry point verifies the owned MySQL datadir before setting this. */
  localFootball?: boolean;
  /** The historical archive command has already verified the owned target. */
  historyBackfill?: boolean;
  onPollerState?: (kind: "results" | "match-details", state: string) => void;
}>;
/** Composes the prediction cascade on shared durable stores. */
export async function createLiveRuntime(inputPolicy: RuntimePolicy, overrides: LiveRuntimeOverrides = {}) {
  const verify = liveReadiness(inputPolicy, overrides.approvals), policy = liveOptionalPolicy(inputPolicy, verify), refs = liveReferences(policy);
  const localFootball = overrides.localFootball === true;
  if (localFootball) {
    const url = new URL(policy.secrets.databaseUrl?.read() ?? "about:blank");
    if (policy.mode !== "development" || url.hostname !== "127.0.0.1" || !/^\/goal_hint_football_\d{6}$/u.test(url.pathname))
      throw new LiveConfigurationError(["Local football requires the owned loopback snapshot database."]);
  }
  const fetcher = overrides.fetcher === undefined ? {} : { fetcher: overrides.fetcher };
  const database = createDatabase(policy, verify);
  try {
    if (await database.readiness() !== "ready") throw new LiveConfigurationError(["The application database is unavailable."]);
    const queue = createMysqlJobQueue(database);
    let activeWorkload: LiveWorkload | null = null;
    let stableAccountKey: string | null = null;
    const quota = createQuotaRouter({ store: createMysqlQuotaStore(database), readStatus: createAccountStatusReader({ policy, verifyEvidence: verify, ...fetcher }),
      admit: createLiveQuotaAdmission(() => activeWorkload, () => stableAccountKey) });
    const day: QuotaDay = await quota.refresh();
    stableAccountKey = day.status.accountKey;
    const workload = liveWorkload(day.status.dailyLimit, day.status.secondLimit, day.status.plan, day.status.minuteLimit, policy.capabilities.ai, policy.choices.liveDetails.enabled);
    activeWorkload = workload;
    const selection = selectionPolicy(policy, refs, workload), statusEvidenceRef = `${refs.freshness}#status`;
    let results: ResultSyncPolicy | null = null;
    let liveDetailsPolicy: LiveMatchPolicy | null = null;
    // Odds use the same workload inputs as their authority, so a policy can never verify against a different plan.
    const odds = oddsPolicy(policy, refs, workload, localFootball);
    let aiModel: ReturnType<typeof liveAiModel> | null = null;
    if (policy.capabilities.ai) try { aiModel = liveAiModel(policy); } catch { /* An unsupported optional model leaves the baseline active. */ }
    // Owned development follows the current cascade; hosted runs retain the explicit rollback setting.
    const sourceOrder = localFootball ? "ai-first" : liveSourceOrder(policy);
    let ai: LiveAiRuntime | null = null;
    const authorities = createLiveAuthorities({ policy, verify, refs, selection, statusEvidenceRef, resultPolicy: () => results, localFootball,
      refreshPacing: workload.pacing, oddsPolicy: odds, liveMatchPolicy: () => liveDetailsPolicy, sourceOrder,
      ...(aiModel === null ? {} : { aiModel, verifyPrimary: (...args) => ai?.verifyAi(...args) === true,
        verifyPrimaryCandidate: (candidate) => ai?.verifyPublishedCandidate(candidate) === true,
        verifyPrimaryGoals: (candidate, distribution) => ai?.verifyPublishedGoalDistribution(candidate, distribution) === true }) });
    const gateway = createPolicyQuotaGateway({ limiter: quota.limiter, policy, verifyEvidence: verify });
    const historySource = localFootball && overrides.historyBackfill && verify(refs.retention, "football-private-use")
      ? createFootballHistorySource(database) : null;
    // The adapter identity is the stable provider account; daily limiter accounts sit behind the router.
    const adapter = createApiFootballAdapter({ accountId: day.status.accountKey, credential: { read: () => policy.secrets.footballKey?.read() ?? "" },
      gateway, authorize: () => assertOperationAllowed(policy, "football", verify), ...fetcher,
      ...(historySource ? {
        retainPartiallyNormalizedFixturePages: true as const,
        observeFixturePage: async (rows, source) => {
          await historySource.savePage({ endpoint: "fixtures", rows, parameters: source.requestParameters, retrievedAt: source.retrievedAt });
        },
        observeCompetitionPage: async (rows, source) => {
          await historySource.savePage({ endpoint: "competitions", rows, parameters: source.requestParameters, retrievedAt: source.retrievedAt });
        },
      } : {}),
      verifyLogo: authorities.catalog.verifyLogo, verifyRegulationScore: authorities.catalog.verifyRegulationScore,
      // API-Football documents up to 20 IDs per /fixtures?ids request.
      batchEvidence: { maximumIds: 20, evidenceRef: "api-football-documentation-v3:fixtures-ids-maximum-20" },
      verifyBatchEvidence: (evidence) => evidence.maximumIds === 20 });
    const cutoff = createCutoffLockingService({ database, queue, policy: cutoffPolicy(refs), authority: authorities.cutoff });
    const lifecycle = createScheduleLifecycleService({ database, cutoff, policy: lifecyclePolicy(refs), authority: authorities.lifecycle });
    const catalog = createFootballCatalogStore(database, { coordinateFixtureMutation: lifecycle.coordinateFixtureMutation, transactionTimeoutMs: 120_000 });
    const importer = createFootballCatalogImporter({ adapter, store: catalog, authority: authorities.catalog });
    const historyBackfill = historySource ? (() => {
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
        const response = await adapter.evidence.competitions(query, bounds);
        if (response.status !== "failed") {
          const fresh = await read(selector, started);
          if (fresh?.length) return { status: "partial", data: fresh, error: null, requestsDispatched: response.requestsDispatched };
        }
        return response;
      }, store,
        importer: createFootballCatalogImporter({ adapter, store, authority: authorities.catalog, deferFixtureWritesAbove: 1_000 }),
        competitionIds: policy.choices.competitionIds ?? [], retentionEvidenceRef: refs.retention,
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
          fetch: adapter.evidence.fixtureRounds,
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
      now: () => utcInstantFromEpochMilliseconds(Date.now()), providerDayEndsAt: () => quota.current()?.endsAt ?? null }) : null;
    const historyReference = historySource ? (() => {
      const now = () => utcInstantFromEpochMilliseconds(Date.now()), providerDayEndsAt = () => quota.current()?.endsAt ?? null;
      const reference = createFootballHistoryReference({ reference: adapter.reference, hasPage: historySource.hasPage,
        savePage: historySource.savePage, now, providerDayEndsAt });
      const playerStatistics = createFootballHistoryPlayerStatistics({ playerStatisticsPage: adapter.reference.playerStatisticsPage,
        readPages: historySource.readPlayerStatisticsPages, savePage: historySource.savePlayerStatisticsPage,
        recordConflict: historySource.recordPlayerStatisticsConflict, now, providerDayEndsAt,
        ...(day.status.plan.trim().toLowerCase() === "free" ? { maximumPage: 3 } : {}) });
      const playerProfiles = createFootballHistoryPlayerProfiles({ playerProfilePage: adapter.reference.playerProfilePage,
        readPages: historySource.readPlayerProfilePages, savePage: historySource.savePlayerProfilePage,
        recordConflict: historySource.recordPlayerProfileConflict, now, providerDayEndsAt });
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
    const selectionStore = createMysqlDailySelectionStore(database, queue);
    const dailySelection = createDailySelectionService({ policy: selection, authority: authorities.selection, store: selectionStore, importer, cutoff });
    // Original public quotes follow the published-slip precedent: the code flag and owner-recorded odds display rights.
    const publisher = createRevisionPublicationService({ database, queue, policy: publicationPolicy(refs), authority: authorities.publication,
      quotes: { verify: () => publicPolicy.features.providerOdds && authorities.odds.verifyPublicDisplay() === true,
        freshnessMs: odds?.freshnessMs ?? ODDS_FRESHNESS_MS } });
    const evidence = createEvidenceService({ authority: authorities.evidence, store: createMysqlEvidenceStore(database), research: null,
      // Live imports finish before analysis; collection saves only the frozen canonical sources.
      football: { async collect() { throw new Error("Live evidence collection uses stored sources only."); } } });
    const providerFallback = createProviderFallbackAdapter({ adapter, catalog, policy: providerFallbackPolicy(refs),
      authority: authorities.providerFallback, maxJobs: 1000 });
    const fallback = createFallbackService({ fallback: providerFallback, authority: authorities.fallback, maxInflight: 100,
      localEngine: createLiveLocalEngine(database),
      selectionPolicy: sourceOrder === "provider-first" ? "provider-baseline" : "optional-ai-primary", verifyRequest: authorities.verifyFallbackRequest });
    const refreshStore = createMysqlRefreshStore(database, queue);
    if (aiModel !== null) try { ai = await createLiveAiRuntime({ policy, verify, refs, model: aiModel, database, store: refreshStore,
      evidenceAuthority: authorities.evidence, pacing: workload.pacing, fallbackReserveMs: refreshEnvelopeFor(workload.pacing, true).fallbackReserveMs,
      sourceOrder,
      ...(overrides.aiFetcher === undefined ? {} : { fetcher: overrides.aiFetcher }) }); } catch { /* Optional AI startup/accounting failure preserves baseline publication. */ }
    let research: Awaited<ReturnType<typeof createLiveResearchRuntime>> | null = null;
    if (ai !== null && aiModel !== null && policy.capabilities.research) try { research = await createLiveResearchRuntime({ policy, verify, refs, model: aiModel,
      database, evidenceAuthority: authorities.evidence, fallbackReserveMs: refreshEnvelopeFor(workload.pacing, true).fallbackReserveMs,
      ...(overrides.researchFetcher ? { fetcher: overrides.researchFetcher } : {}) }); } catch { /* Optional research startup failure preserves the baseline and AI structured evidence. */ }
    const footballPreparation = createLiveFootballPreparation({ importer, refs, pacing: workload.pacing, adapter: adapter.evidence, database });
    const refresh = createPredictionRefreshService({ type: LIVE_REFRESH_TYPE, handlerVersion: 1, store: refreshStore,
      selection: selectionStore, authority: authorities.refresh,
      prepare: async (member, context) => {
        const football = await footballPreparation(member, context);
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
        return sourceOrder === "ai-first" ? liveCascadePlan(reviewed, localFootball) : reviewed;
      },
      models: ai?.models ?? { async resolve() { throw new ModelRegistryError("unavailable"); } },
      predictor: ai?.predictor ?? { async predict() { return { status: "denied", reason: "unconfigured", requestsDispatched: 0, requestCountUnknown: false }; } },
      evidence, fallback, lifecycle, publisher, costs: { ai: ai?.costs ?? null, research: research?.costs ?? null },
      recommendations: { quotes: odds === null ? async () => [] : createRecommendationQuoteLoader(database, {
        bookmakerId: odds.bookmakerId, freshnessMs: odds.freshnessMs, expectedPolicyHash: evidenceFingerprint(odds),
        verifyInternalUse: () => policy.capabilities.football && verify(refs.retention, "football-private-use") &&
          authorities.odds.verifyPolicy(odds) === true && authorities.odds.verifyRetention({ evidenceRef: refs.retention,
            purpose: "structured-odds-history", rawPayloadsStored: false }) === true }) },
      observation: createRefreshObservationCollector({ adapter: adapter.evidence, evidenceRef: statusEvidenceRef, verifyResponse: authorities.verifyStatusResponse }) });
    const settlement = createMarketSettlementService({ database, queue, extendedMarketsEnabled: localFootball });
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
    const oddsStore = createMysqlOddsStore(database);
    const oddsService = createOddsImportService({ adapter: adapter.odds, store: oddsStore, authority: authorities.odds,
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
        WHERE accountId = ${accountId} AND periodId = ${periodId} AND priority = ${quotaPriorities.enrichment.rank}
          AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.priority')) = 'enrichment' AND dispatchedAt IS NOT NULL`);
      return Object.freeze({ remaining: counters.remaining, used: counters.used, oddsUsed: Number(row?.spent ?? 0) });
    }
    const enrichmentAllowance = Object.freeze({ floor: workload.odds.floor, spare: workload.odds.spare, reserve: workload.odds.reserve });
    async function requalifyLocalOdds() {
      if (!localFootball || !odds || !oddsEnabled) return oddsFail("unverified-policy");
      const current = quota.current();
      if (!current) return oddsFail("unavailable");
      const verifyProjection = () => authorities.odds.verifyPublicDisplay() && authorities.odds.verifyPolicy(odds) &&
        authorities.odds.verifyRetention({ evidenceRef: refs.retention, purpose: "structured-odds-history", rawPayloadsStored: false });
      if (!verifyProjection()) return oddsFail("unverified-policy");
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
        policyHash: oddsPolicyHash(odds), catalog, limit: 500, verify: verifyProjection }) };
    }
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
    const inPlayOdds = localFootball ? createInPlayOddsPoller({
      database, adapter: adapter.odds, now: Date.now, enabled: () => oddsEnabled && quota.current() !== null,
      displayAllowed: authorities.odds.verifyPublicDisplay,
    }) : null;

    /** Follow configured stored fixtures even when a fixture received no prediction. */
    async function resultCoverage(): Promise<ResultSyncPolicy["coverage"]> {
      const now = Date.now();
      const rows = await database.query((tx) => tx.$queryRaw<{ competitionId: bigint; season: number }[]>`
        SELECT DISTINCT cp.externalId AS competitionId, s.year AS season FROM FootballFixture f
        JOIN FootballSeason s ON s.id = f.seasonId
        JOIN FootballCompetitionProvider cp ON cp.competitionId = s.competitionId AND cp.provider = 'api-football'
        WHERE cp.externalId IN (${Prisma.join(policy.choices.competitionIds!)}) AND (f.status = 'live' OR
          (f.kickoff >= ${new Date(now - 3 * DAY_MS)} AND f.kickoff < ${new Date(now + 8 * DAY_MS)}))
        ORDER BY competitionId, season LIMIT ${maximumCompetitionScope}`);
      return rows.map((row) => ({ competitionId: Number(row.competitionId), season: row.season }));
    }
    let poller: Readonly<{ policy: ResultSyncPolicy; accountId: string; service: ReturnType<typeof createResultSyncService> }> | null = null;
    /** Rebuilds the leased poller when its coverage or provider-day quota account changes. */
    async function resultPoller() {
      const current = quota.current(), coverage = await resultCoverage();
      if (current === null) return poller;
      if (coverage.length === 0) { results = null; poller = null; return null; }
      const next = resultSyncPolicy(refs, workload, coverage, localFootball);
      if (poller && poller.accountId === current.accountId && evidenceFingerprint(poller.policy) === evidenceFingerprint(next)) return poller;
      results = next;
      // The poller lease belongs to the shared quota account row, so it follows the active provider day.
      poller = Object.freeze({ policy: next, accountId: current.accountId, service: createResultSyncService({ accountId: current.accountId,
        policy: next, authority: authorities.results, adapter: adapter.evidence,
        ...(overrides.onPollerState ? { onState: (state) => overrides.onPollerState?.("results", state) } : {}),
        store: createMysqlResultSyncStore({ database, accountId: current.accountId, lifecycle }) }) });
      return poller;
    }
    let detailPoller: Readonly<{ policy: LiveMatchPolicy; service: ReturnType<typeof createLiveMatchService> }> | null = null;
    /** Detail collection covers configured stored fixtures, including those without predictions. */
    async function liveMatchPoller() {
      if (!workload.liveDetails.eligible || quota.current() === null) return null;
      const coverage = await resultCoverage();
      if (coverage.length === 0) { liveDetailsPolicy = null; detailPoller = null; return null; }
      const next = liveMatchPolicy(refs, workload, coverage, localFootball);
      if (detailPoller && evidenceFingerprint(detailPoller.policy) === evidenceFingerprint(next)) return detailPoller;
      liveDetailsPolicy = next;
      detailPoller = Object.freeze({ policy: next, service: createLiveMatchService({ accountKey: day.status.accountKey,
        policy: next, authority: authorities.liveMatch, adapter: adapter.evidence,
        ...(localFootball ? { batchDetails: adapter.evidence.matchDetails } : {}),
        ...(overrides.onPollerState ? { onState: (state) => overrides.onPollerState?.("match-details", state) } : {}),
        store: createMysqlLiveMatchStore({ database, accountKey: day.status.accountKey }) }) });
      return detailPoller;
    }
    return Object.freeze({ policy, database, queue, quota, workload, registry, settlement, cache, catalog: importer, historyBackfill, historyDetails, historyReference, resultPoller, liveMatchPoller, inPlayOdds, day,
      odds: Object.freeze({ enabled: oddsEnabled, registry: oddsRegistry, horizonDays: workload.odds.dates, bookmakerScope: odds?.bookmakerScope,
        requalifyLocal: requalifyLocalOdds,
        // Write-time staleness needs no provider call, so it runs even while imports are off.
        expire: (limit: number) => oddsService.expire(odds?.freshnessMs ?? ODDS_FRESHNESS_MS, limit) }),
      teamCodes: Object.freeze({ enabled: teamCodesEnabled, registry: teamCodesRegistry }),
      enrichment: Object.freeze({ registry: enrichmentRegistry }),
      now: () => utcInstantFromEpochMilliseconds(Date.now()), close: () => database.disconnect() });
  } catch (error) { await database.disconnect().catch(() => {}); throw error; }
}
export type LiveRuntime = Awaited<ReturnType<typeof createLiveRuntime>>;

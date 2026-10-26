import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { assertOperationAllowed, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import type { EvidenceAuthority } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { ProviderFallbackAuthority, ProviderFallbackPolicy } from "../fallback/fallback-adapter.ts";
import type { FallbackContext, FallbackResolutionAuthority, ForecastSourceOrder } from "../fallback/fallback-contract.ts";
import type { FallbackRefreshRequest } from "../fallback/fallback-service.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballEndpoint, type ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFixture, RegulationScoreCandidate } from "../football/api-football-normalize.ts";
import type { CatalogAuthority } from "../football/catalog-contract.ts";
import type { OddsAuthority, OddsPolicy } from "../odds/odds-contract.ts";
import { oddsRequestParameters } from "../odds/odds-input.ts";
import type { CutoffAuthority, CutoffPolicy } from "../predictions/cutoff-contract.ts";
import type { LifecycleAuthority, LifecyclePolicy } from "../predictions/lifecycle-contract.ts";
import type { PublicationAuthority, PublicationPolicy } from "../predictions/publication-contract.ts";
import type { RefreshAuthority, RefreshMember } from "../refresh/refresh-contract.ts";
import { parseRefreshPlan } from "../refresh/refresh-input.ts";
import type { ModelVersion } from "../predictor/predictor-contract.ts";
import type { ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";
import { verifyLiveResearchSource } from "./live-research.ts";
import type { PredictorResult } from "../predictor/predictor-service.ts";
import { liveAiEvidencePolicy, liveAiRefreshPlan } from "./live-ai-plan.ts";
import { verifyLiveFootballSource } from "./live-ai-evidence.ts";
import type { ResultSyncAuthority, ResultSyncPolicy } from "../results/result-sync-contract.ts";
import type { LiveMatchAuthority, LiveMatchPolicy } from "../live-match/live-match-contract.ts";
import type { SelectionAuthority, SelectionPolicy } from "../selection/selection-contract.ts";
import { parseSelectionPolicy } from "../selection/selection-input.ts";
import { cutoffPolicy, evidencePolicy, fallbackRefreshPlan, lifecyclePolicy, providerFallbackPolicy, providerStatusMappings,
  publicationPolicy, type LiveReferences, type RefreshPacing } from "./live-plan.ts";

/** Clock skew tolerated between provider retrieval stamps and this process. */
const SKEW_MS = 5_000;
export const LIVE_ACTOR = "goal-hint-live-runner";
/** Team and league logos, and country flags (`/flags/gb.svg`, subdivisions such as `/flags/gb-eng.svg`), on the provider's media host. */
const API_FOOTBALL_MEDIA = /^https:\/\/media(?:-\d+)?\.api-sports\.io\/(?:football\/(?:teams|leagues)\/\d+\.png|flags\/[a-z]{2}(?:-[a-z]{2,4})?\.svg)$/u;
/** Whether a URL is provider media the owner-recorded public rights decision covers (logos and country flags). */
export function isApiFootballMediaUrl(url: string): boolean { return API_FOOTBALL_MEDIA.test(url); }
const same = (value: unknown, expected: unknown) => evidenceFingerprint(value) === evidenceFingerprint(expected);
function pages(result: Pick<ApiFootballResult<unknown>, "provenance">, endpoint: ApiFootballEndpoint, now: number) {
  return Array.isArray(result.provenance) && result.provenance.every((page) => page.provider === "api-football" &&
    page.endpoint === endpoint && page.contractVersion === API_FOOTBALL_CONTRACT_VERSION && page.retrievedAt <= now + SKEW_MS);
}

/** Trusted operator binding for the primary and fallback live pipeline. Every approval
 * re-runs the runtime gates against the owner register, binds exact policies, and
 * refuses manual-operator paths (voids, recovery, identity remapping) this runner never uses. */
export function createLiveAuthorities(options: Readonly<{
  policy: RuntimePolicy; verify: EvidenceVerifier; refs: LiveReferences; selection: SelectionPolicy;
  resultPolicy: () => ResultSyncPolicy | null; statusEvidenceRef: string; clock?: Clock;
  liveMatchPolicy?: () => LiveMatchPolicy | null;
  /** The same verified plan pacing used to configure refresh requests. */
  refreshPacing: RefreshPacing;
  /** The exact odds policy configured from the same workload as the runtime, or null without a bookmaker. */
  oddsPolicy?: OddsPolicy | null;
  aiModel?: ModelVersion;
  /** The order frozen into AI plans by the same runtime; provider-first when omitted. */
  sourceOrder?: ForecastSourceOrder;
  verifyPrimary?(result: PredictorResult, context: FallbackContext): boolean;
  verifyPrimaryCandidate?(candidate: ResolvedForecastCandidate): boolean;
}>) {
  const { policy, verify, refs } = options;
  const now = () => options.clock?.now() ?? utcInstantFromEpochMilliseconds(Date.now());
  const football = () => assertOperationAllowed(policy, "football", verify);
  const publish = () => assertOperationAllowed(policy, "publication", verify);
  const expected = Object.freeze({
    selection: parseSelectionPolicy(options.selection), cutoff: cutoffPolicy(refs) as CutoffPolicy, lifecycle: lifecyclePolicy(refs) as LifecyclePolicy,
    publication: publicationPolicy(refs) as PublicationPolicy, evidence: evidencePolicy(refs), fallback: providerFallbackPolicy(refs) as ProviderFallbackPolicy,
  });
  const statuses = new Map(providerStatusMappings.map((entry) => [entry.providerStatus, entry.status]));
  const verifyScore = (candidate: RegulationScoreCandidate) => candidate.sourceField === "score.fulltime" &&
    candidate.period === "regulation-including-stoppage-time" && ["FT", "AET", "PEN"].includes(candidate.providerStatus) &&
    [candidate.home, candidate.away].every((goals) => Number.isSafeInteger(goals) && goals >= 0 && goals <= 99);

  const catalog: CatalogAuthority = Object.freeze({
    authorize(request) { football(); if (request.retentionEvidenceRef !== refs.retention) throw new Error("Unapproved retention."); },
    verifyRetention: (permission) => permission.evidenceRef === refs.retention && permission.rawPayloadsStored === false &&
      permission.purpose === "structured-catalog-and-audit-history",
    verifyObservation: (_request, result) => pages(result, "fixtures", now()) || pages(result, "teams", now()) || pages(result, "competitions", now()),
    // Remote provider logos and country flags display under the owner-recorded public rights decision.
    verifyLogo: (url) => verify(refs.publicRights, "football-public-rights") && isApiFootballMediaUrl(url),
    // API-Football score.fulltime is the regulation score, including after extra time or penalties.
    verifyRegulationScore: verifyScore,
    regulationEvidenceRef: (candidate) => verifyScore(candidate)
      ? `api-football:fixture:${candidate.fixtureId}:${candidate.providerStatus}:score.fulltime` : null,
    authorizeMapping() { throw new Error("Alternate identity mapping needs manual review."); },
    verifyMapping: () => false,
    verifyKnownSubset: () => false,
  });
  const selection: SelectionAuthority = Object.freeze({
    authorize() { football(); },
    verifyPolicy: (value) => same(value, expected.selection),
    // The owner-approved degradation policy lets the runner finalize an incomplete import as partial coverage.
    verifyDegradedAction: (action, runDate) => action.policyRef === refs.degradation && action.actor === LIVE_ACTOR &&
      action.evidenceRef === `${refs.degradation}:${runDate}`,
    verifyCycleEligibility: () => false,
  });
  const cutoff: CutoffAuthority = Object.freeze({
    authorize(action) { if (action === "void" || action === "recover") throw new Error("Manual cutoff operation."); },
    verifyPolicy: (value) => same(value, expected.cutoff),
    verifyObservation: (observation) => observation.provider === "api-football" && observation.retrievedAt <= now() + SKEW_MS &&
      observation.evidenceRef.length > 0,
    verifyVoid: () => false,
    verifyRecovery: () => false,
  });
  const lifecycle: LifecycleAuthority = Object.freeze({
    authorize() { /* Observation ingestion records stored provider evidence and dispatches nothing. */ },
    verifyPolicy: (value) => same(value, expected.lifecycle),
    verifyObservation: (observation) => observation.endpoint.startsWith("/fixtures") && observation.retrievedAt <= now() + SKEW_MS &&
      (observation.providerStatus === null ? observation.status === "unknown" : statuses.get(observation.providerStatus) === observation.status) &&
      (observation.regulationScore === null || observation.regulationScore.verified === true),
  });
  const publication: PublicationAuthority = Object.freeze({
    authorize() { publish(); },
    verifyPolicy: (value) => same(value, expected.publication),
    verifyObservation: (observation) => observation.provider === "api-football" && observation.evidenceRef === options.statusEvidenceRef &&
      observation.retrievedAt <= now() + SKEW_MS,
    verifyRecommendation: (input) => {
      const selected = input.candidate.audit.recommendation?.selected;
      if (!selected) return true;
      const configured = options.oddsPolicy;
      return policy.capabilities.football && verify(refs.retention, "football-private-use") && configured !== null &&
        configured !== undefined && selected.quote.bookmakerId === configured.bookmakerId &&
        configured.retentionEvidenceRef === refs.retention && selected.quote.permitted && !selected.quote.suspended;
    },
    verifyCandidate: (input) => {
      if (!verify(refs.publicRights, "football-public-rights")) return false;
      return Object.values(input.candidate.markets).every((market) => {
        if (!market.available) return true;
        if (market.provenance.kind === "api-football") return market.provenance.policyVersion === expected.fallback.version &&
          market.provenance.policyEvidenceRef === expected.fallback.evidenceRef;
        return policy.capabilities.ai && options.aiModel !== undefined &&
          market.provenance.modelVersionId === options.aiModel.id &&
          same(market.provenance.pin, input.candidate.context.pin) &&
          market.provenance.evidenceHash === input.candidate.context.evidenceHash &&
          verify(`${refs.evidence}#openai-transmission`, "evidence-policy") &&
          options.verifyPrimaryCandidate?.(input.candidate) === true;
      });
    },
  });
  const evidence: EvidenceAuthority = Object.freeze({
    authorize() { football(); },
    verifyContext: (context) => context.provider === "api-football" && context.cycleId !== null && context.runId !== null,
    verifyPolicy: (value) => same(value, expected.evidence) || same(value, liveAiEvidencePolicy(refs)),
    verifySource: (source, context) => verifyLiveFootballSource(source, context, refs) || verifyLiveResearchSource(source, context, policy),
    verifyReuse: (source, context) => source.reuse.allowSummary && (source.kind === "news" ? source.reuse.evidenceRef === policy.choices.research.licenseRef : source.reuse.evidenceRef === refs.retention) &&
      source.reuse.retainUntil >= context.analysisAt && verify(refs.retention, "football-private-use"),
  });
  const providerFallback: ProviderFallbackAuthority = Object.freeze({
    authorize() { football(); },
    verifyContext: (context) => context.provider === "api-football" && context.cycleId !== null && context.runId !== null,
    verifyPolicy: (value) => same(value, expected.fallback),
    verifyMapping: (mapping, _context, value) => same(mapping, expected.fallback.matchResultMapping) && same(value, expected.fallback),
    verifyObservation: (result, request) => pages(result, "predictions", now()) &&
      result.provenance.every((page) => page.requestParameters.fixture === String(request.context.externalFixtureId)),
    verifySourceUrl: (url, value) => url === expected.fallback.sourceUrl && same(value, expected.fallback),
  });
  const unconfiguredAi = (result: FallbackRefreshRequest["ai"]) => result.status === "denied" && result.reason === "unconfigured" &&
    result.requestsDispatched === 0 && result.requestCountUnknown === false;
  const fallback: FallbackResolutionAuthority = Object.freeze({
    authorize() { football(); },
    verifyContext: (context) => context.context.cycleId !== null && context.context.runId !== null &&
      (context.pin === null || options.aiModel !== undefined && context.pin.modelVersionId === options.aiModel.id),
    verifyAi: (result, context) => context.pin === null ? unconfiguredAi(result) : options.verifyPrimary?.(result, context) === true,
    verifyProvider: (candidate, context) => candidate.provenance.provider === "api-football" && candidate.provenance.jobId === context.jobId &&
      candidate.policyVersion === expected.fallback.version && same(candidate.context, context.context),
  });
  const verifyFallbackRequest = (request: FallbackRefreshRequest) =>
    (request.expected.pin === null ? unconfiguredAi(request.ai) : options.verifyPrimary?.(request.ai, request.expected) === true) &&
    request.bounds !== null && request.bounds.priority === "near-kickoff-fallback";
  const refresh: RefreshAuthority = Object.freeze({
    authorize() { publish(); },
    verifyPlan: (plan, member: RefreshMember) => {
      try {
        const baseline = fallbackRefreshPlan(member, refs, options.refreshPacing);
        const reviewed = plan.modelVersionId === null ? { ...baseline, evidence: { ...baseline.evidence,
          policy: liveAiEvidencePolicy(refs), cachedSources: plan.evidence.cachedSources } } :
          options.aiModel === undefined ? null : liveAiRefreshPlan(member, refs, policy, options.aiModel,
            plan.evidence.cachedSources as import("../evidence/evidence-contract.ts").EvidenceSource[], options.refreshPacing,
            (plan.recommendationPolicy === undefined ? plan.sourceOrder : options.sourceOrder) ?? "ai-first");
        if (reviewed === null) return false;
        if (same(plan, parseRefreshPlan(reviewed, member))) return true;
        if (plan.modelVersionId === null && same(plan, parseRefreshPlan(baseline, member))) return true;
        // Old sealed intents predate recommendation selection and reserved only the two publication calls.
        // Reconstruct that exact reviewed shape; never add new behavior to a recovered intent.
        if (plan.recommendationPolicy === undefined) {
          const { recommendationPolicy: _recommendation, ...previous } = reviewed; void _recommendation;
          const legacy = { ...previous, footballRequestLimit: 2 };
          if (same(plan, parseRefreshPlan(legacy, member))) return true;
          if (plan.modelVersionId === null) {
            const { recommendationPolicy: _baselineRecommendation, ...oldBaseline } = baseline; void _baselineRecommendation;
            if (same(plan, parseRefreshPlan({ ...oldBaseline, footballRequestLimit: 2 }, member))) return true;
          }
        }
        // AI intents saved before source orders existed stay valid as legacy AI-first, without contemporaneous capture.
        if (plan.sourceOrder !== undefined || plan.ai === null || reviewed.sourceOrder === undefined) return false;
        const { sourceOrder: _order, ...legacy } = reviewed; void _order;
        return same(plan, parseRefreshPlan(legacy, member));
      } catch { return false; }
    },
  });
  const results: ResultSyncAuthority = Object.freeze({
    authorize() { football(); },
    verifyPolicy: (value) => { const current = options.resultPolicy(); return current !== null && same(value, current); },
    verifyResponse: (response) => pages(response, "fixtures", now()),
  });
  const verifyStatusResponse = (result: ApiFootballResult<NormalizedFixture>, member: RefreshMember) => pages(result, "fixtures", now()) &&
    result.data.length <= 1 && result.data.every((row) => row.id === member.context.externalFixtureId);
  const liveMatch: LiveMatchAuthority = Object.freeze({
    authorize() { football(); publish(); },
    verifyPolicy(value) {
      const configured = options.liveMatchPolicy?.();
      return policy.choices.liveDetails.enabled && configured !== undefined && configured !== null && same(value, configured);
    },
    verifyResponse(response) {
      const endpoint = response.provenance[0]?.endpoint;
      return response.provenance.length === 1 && (endpoint === "statistics" || endpoint === "events") && pages(response, endpoint, now());
    },
  });
  // Odds (052): private structured retention under the private-use reference; public projection only under
  // owner-recorded odds display rights, which the runner never requires to start.
  const oddsEndpoints = { prices: "odds", bets: "oddsBets", bookmakers: "oddsBookmakers" } as const;
  const odds: OddsAuthority = Object.freeze({
    authorize(request) {
      football();
      if (!options.oddsPolicy || request.policy.retentionEvidenceRef !== refs.retention) throw new Error("Unapproved odds import.");
    },
    verifyPolicy: (value) => options.oddsPolicy !== undefined && options.oddsPolicy !== null && same(value, options.oddsPolicy),
    verifyRetention: (permission) => permission.evidenceRef === refs.retention && permission.purpose === "structured-odds-history" &&
      permission.rawPayloadsStored === false,
    verifyObservation: (request, result) => pages(result, oddsEndpoints[request.kind], now()) && result.provenance.every((page) => {
      const { page: _page, ...selectors } = page.requestParameters;
      void _page; return same(selectors, oddsRequestParameters(request));
    }),
    verifyPublicDisplay: () => refs.oddsRights !== null && verify(refs.oddsRights, "football-odds-rights"),
  });
  return Object.freeze({ catalog, selection, cutoff, lifecycle, publication, evidence, providerFallback, fallback, verifyFallbackRequest,
    refresh, results, verifyStatusResponse, odds, liveMatch });
}

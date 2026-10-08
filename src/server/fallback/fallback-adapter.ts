import "server-only";

import { z } from "zod";
import { getPublicationDeadline, utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import { marketRules, validateMarketSnapshot, type MarketSnapshot, type SourceGroup } from "../../domain/markets.ts";
import type { EvidenceContext, EvidenceWorkflow } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, freezeEvidence, isSafeEvidenceLink, parseEvidenceContext } from "../evidence/evidence-input.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFallbackPrediction } from "../football/api-football-normalize.ts";
import { parseCatalogEvidenceRef, parseCatalogImportRequest } from "../football/catalog-input.ts";
import type { CatalogFixtureSnapshot } from "../football/catalog-mysql-store.ts";
import type { TrialFreshness } from "../football/provider-trial-contract.ts";
import type { ProviderFallbackCandidate, ProviderFallbackReason, ProviderFallbackResult } from "./fallback-contract.ts";

export type ProviderFallbackMapping = Readonly<{
  sourceField: "predictions.percent"; probabilityUnits: "percent";
  period: typeof marketRules.period; completeProbabilities: true; evidenceRef: string;
}>;
export type ProviderFallbackPolicy = Readonly<{
  version: string; evidenceRef: string; sourceEvidenceRef: string;
  fixtureFreshness: TrialFreshness; predictionFreshness: TrialFreshness;
  unknownGenerationTime: "reject" | "allow-flagged";
  matchResultMapping: ProviderFallbackMapping | null;
  /** An independently approved real provider link; never an invented fixture URL. */
  sourceUrl: string | null;
}>;
export type ProviderFallbackRequest = Readonly<{
  context: EvidenceContext; jobId: string; requestedGroups: readonly SourceGroup[]; bounds: ApiFootballBounds;
}>;
export type ProviderFallbackAuthority = Readonly<{
  authorize(request: ProviderFallbackRequest): void;
  /** Proves the current canonical revision, home/away aliases, cycle/run and job eligibility. */
  verifyContext(context: EvidenceContext): boolean;
  verifyPolicy(policy: ProviderFallbackPolicy): boolean;
  verifyMapping(mapping: ProviderFallbackMapping, context: EvidenceContext, policy: ProviderFallbackPolicy): boolean;
  verifyObservation(result: ApiFootballResult<NormalizedFallbackPrediction>, request: ProviderFallbackRequest, policy: ProviderFallbackPolicy): boolean;
  verifySourceUrl(url: string, policy: ProviderFallbackPolicy): boolean;
}>;
class ProviderFallbackError extends Error {
  readonly reason: ProviderFallbackReason;
  constructor(reason: ProviderFallbackReason) {
    super("Provider fallback is invalid or unavailable. Private provider diagnostics are withheld.");
    this.name = "ProviderFallbackError"; this.reason = reason;
  }
}
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const reference = z.string().min(1).max(512).transform(parseCatalogEvidenceRef);
const freshness = z.object({ maxRetrievalAgeMs: count, maxSourceAgeMs: count,
  unknownUpdateTime: z.enum(["reject", "retrieval-only"]), evidenceRef: reference }).strict();
const policySchema = z.object({ version: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u),
  evidenceRef: reference, sourceEvidenceRef: reference, fixtureFreshness: freshness, predictionFreshness: freshness,
  unknownGenerationTime: z.enum(["reject", "allow-flagged"]),
  matchResultMapping: z.object({ sourceField: z.literal("predictions.percent"), probabilityUnits: z.literal("percent"),
    period: z.literal(marketRules.period), completeProbabilities: z.literal(true), evidenceRef: reference }).strict().nullable(),
  sourceUrl: z.string().max(2048).refine(isSafeEvidenceLink).nullable() }).strict();
export function parseProviderFallbackPolicy(value: unknown): ProviderFallbackPolicy {
  try { return freezeEvidence(policySchema.parse(value)); } catch { throw new ProviderFallbackError("invalid-request"); }
}
export function parseProviderFallbackRequest(value: unknown): ProviderFallbackRequest {
  try {
    if (!value || typeof value !== "object" || Object.keys(value).some((key) => !["context", "jobId", "requestedGroups", "bounds"].includes(key))) throw new Error();
    const input = value as ProviderFallbackRequest, context = parseEvidenceContext(input.context);
    if (!/^[a-f0-9]{64}$/u.test(input.jobId) || !Array.isArray(input.requestedGroups) || input.requestedGroups.length < 1 ||
      input.requestedGroups.length > 3 || new Set(input.requestedGroups).size !== input.requestedGroups.length ||
      input.requestedGroups.some((group) => !["match-result", "total-goals", "both-teams-to-score"].includes(group)) ||
      input.bounds?.priority !== "near-kickoff-fallback" ||
      input.bounds?.cacheScope !== undefined && input.bounds.cacheScope !== input.jobId) throw new Error();
    const parsed = parseCatalogImportRequest({ id: context.fixtureId, selection: { kind: "fixtures", query: { fixtureId: context.externalFixtureId } },
      bounds: { ...input.bounds, cacheScope: input.jobId }, retentionEvidenceRef: "provider-fallback-structured-contract" });
    return freezeEvidence({ context, jobId: input.jobId, requestedGroups: [...input.requestedGroups], bounds: parsed.bounds });
  } catch { throw new ProviderFallbackError("invalid-request"); }
}
function synchronous(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
function verified(check: () => unknown): boolean { try { return synchronous(check()) === true; } catch { return false; } }
function sameFixture(fixture: CatalogFixtureSnapshot, context: EvidenceContext): boolean {
  return fixture.id === context.fixtureId && fixture.dataVersion === context.fixtureVersion && fixture.externalId === context.externalFixtureId &&
    fixture.homeTeamId === context.home.teamId && fixture.awayTeamId === context.away.teamId && fixture.kickoff === context.kickoffAt &&
    fixture.homeExternalIds.includes(context.home.externalId) && fixture.awayExternalIds.includes(context.away.externalId);
}
function assertFresh(retrievedAt: UtcInstant, providerUpdatedAt: UtcInstant | null, policy: TrialFreshness, now: UtcInstant,
  staleReason: "stale" | "stale-context" = "stale"): void {
  try {
    utcInstantFromEpochMilliseconds(retrievedAt);
    if (providerUpdatedAt !== null) utcInstantFromEpochMilliseconds(providerUpdatedAt);
  } catch { throw new ProviderFallbackError("invalid-response"); }
  if (retrievedAt > now || providerUpdatedAt !== null && providerUpdatedAt > retrievedAt) throw new ProviderFallbackError("future-source-time");
  if (now - retrievedAt > policy.maxRetrievalAgeMs || providerUpdatedAt !== null && now - providerUpdatedAt > policy.maxSourceAgeMs)
    throw new ProviderFallbackError(staleReason);
  if (providerUpdatedAt === null && policy.unknownUpdateTime !== "retrieval-only") throw new ProviderFallbackError("unknown-source-time");
}
function unsupportedMarkets(markets: MarketSnapshot): MarketSnapshot {
  const unsupported = ["total-goals", "both-teams-to-score"] as const;
  return freezeEvidence({ ...markets, markets: { ...markets.markets,
    "total-goals": { available: false, reason: "unsupported-family" }, "both-teams-to-score": { available: false, reason: "unsupported-family" } },
    issues: [...markets.issues.filter((issue) => !unsupported.some((family) => family === issue.family)),
      ...unsupported.map((family) => ({ family, reason: "unsupported-family" as const }))] });
}
type CandidateProof = Readonly<{
  request: ProviderFallbackRequest; policy: ProviderFallbackPolicy; result: ApiFootballResult<NormalizedFallbackPrediction>;
  now(): UtcInstant;
  isCurrent(now: UtcInstant): boolean;
  authorize(now: UtcInstant): void;
}>;
const prepared = new WeakMap<ProviderFallbackCandidate, CandidateProof>();
/** Only candidates produced by this boundary carry current response and policy proof. */
export function assertProviderFallbackCandidate(candidate: ProviderFallbackCandidate, context: EvidenceContext, jobId: string,
  now?: UtcInstant): void {
  const proof = prepared.get(candidate);
  if (!proof || evidenceFingerprint(context) !== evidenceFingerprint(proof.request.context) || jobId !== proof.request.jobId)
    throw new ProviderFallbackError("wrong-identity");
  proof.authorize(utcInstantFromEpochMilliseconds(now ?? proof.now()));
  if (!proof.isCurrent(proof.now())) throw new ProviderFallbackError("stale");
}
/** Final time-only check after authority callbacks; it performs no external proof hooks. */
export function isProviderFallbackCurrent(candidate: ProviderFallbackCandidate, context: EvidenceContext, jobId: string, now: UtcInstant): boolean {
  try {
    const proof = prepared.get(candidate);
    return proof !== undefined && evidenceFingerprint(context) === evidenceFingerprint(proof.request.context) &&
      jobId === proof.request.jobId && proof.isCurrent(utcInstantFromEpochMilliseconds(now));
  } catch { return false; }
}

/** Ready-made provider forecasts remain isolated from primary evidence and public readers. */
export function createProviderFallbackAdapter(options: Readonly<{
  adapter: Pick<ReturnType<typeof createApiFootballAdapter>, "fallback">;
  catalog: Readonly<{ fixtureByProviderId(id: number): Promise<CatalogFixtureSnapshot | null> }>;
  policy: ProviderFallbackPolicy; authority: ProviderFallbackAuthority; clock?: Clock; maxJobs: number;
}>) {
  const policy = parseProviderFallbackPolicy(options.policy);
  if (!Number.isSafeInteger(options.maxJobs) || options.maxJobs < 1 || options.maxJobs > 100_000) throw new ProviderFallbackError("invalid-request");
  const currentTime = () => utcInstantFromEpochMilliseconds(options.clock?.now() ?? Date.now());
  type Job = { fingerprint: string; charged: number; maxRequests: number; deadlineAt: UtcInstant; timeoutMs: number; pending: boolean };
  const jobs = new Map<string, Job>();
  const denied = (reason: ProviderFallbackReason, requestsDispatched = 0, requestCountUnknown = false): ProviderFallbackResult =>
    freezeEvidence({ status: "denied", reason, requestsDispatched, requestCountUnknown });
  return Object.freeze({ async collect(value: ProviderFallbackRequest, workflow?: EvidenceWorkflow): Promise<ProviderFallbackResult> {
    let request: ProviderFallbackRequest;
    try { request = parseProviderFallbackRequest(value); } catch { return denied("invalid-request"); }
    let dispatched = 0, finalFailure: ProviderFallbackReason | undefined, state: Job | undefined, providerPending = false, countUnknown = false,
      ownsPending = false;
    const startedAt = performance.now();
    let enteredAt: UtcInstant;
    try { enteredAt = currentTime(); } catch { return denied("invalid-request"); }
    let lastNow = enteredAt;
    const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(request.bounds.deadlineAt, getPublicationDeadline(request.context.kickoffAt),
      workflow?.deadlineAt ?? Infinity));
    const allowance = deadlineAt - enteredAt;
    const controller = new AbortController();
    const signal = workflow === undefined ? controller.signal : AbortSignal.any([controller.signal, workflow.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortWait: (() => void) | undefined;
    function timeCheck() {
      const now = currentTime();
      if (now < lastNow) throw new ProviderFallbackError("clock-regression");
      lastNow = now;
      if (signal.aborted || now >= deadlineAt || performance.now() - startedAt >= allowance) throw new ProviderFallbackError("timeout");
      if (now < request.context.analysisAt) throw new ProviderFallbackError("future-source-time");
      return now;
    }
    function authorize(at?: UtcInstant) {
      const now = at ?? timeCheck();
      if (now >= getPublicationDeadline(request.context.kickoffAt)) throw new ProviderFallbackError("ineligible-refresh");
      try {
        if (workflow !== undefined && synchronous(workflow.check()) !== undefined ||
          synchronous(options.authority.authorize(request)) !== undefined || synchronous(options.authority.verifyContext(request.context)) !== true ||
          synchronous(options.authority.verifyPolicy(policy)) !== true ||
          policy.sourceUrl !== null && synchronous(options.authority.verifySourceUrl(policy.sourceUrl, policy)) !== true) throw new Error();
      } catch { throw new ProviderFallbackError("not-authorized"); }
      if (policy.matchResultMapping === null || !verified(() => options.authority.verifyMapping(policy.matchResultMapping!, request.context, policy)))
        throw new ProviderFallbackError("unverified-mapping");
      if (policy.unknownGenerationTime !== "allow-flagged") throw new ProviderFallbackError("unknown-source-time");
      if (at === undefined) timeCheck();
    }
    async function canonical() {
      const fixture = await options.catalog.fixtureByProviderId(request.context.externalFixtureId);
      authorize();
      if (!fixture || !sameFixture(fixture, request.context)) throw new ProviderFallbackError("wrong-identity");
      if (fixture.status !== "scheduled") throw new ProviderFallbackError("ineligible-refresh");
      assertFresh(fixture.retrievedAt, fixture.providerUpdatedAt, policy.fixtureFreshness, timeCheck(), "stale-context");
      return fixture;
    }
    try {
      if (!request.requestedGroups.includes("match-result")) return denied("unsupported-markets");
      authorize();
      // Tightening a deadline never resets the original job request allowance.
      const fingerprint = evidenceFingerprint({ context: request.context, bounds: { priority: request.bounds.priority,
        maxRequests: request.bounds.maxRequests, maxPages: request.bounds.maxPages, maxRows: request.bounds.maxRows,
        maxResponseBytes: request.bounds.maxResponseBytes, retry: request.bounds.retry, cacheMaxAgeMs: request.bounds.cacheMaxAgeMs }, policy });
      state = jobs.get(request.jobId);
      if (state && (state.fingerprint !== fingerprint || request.bounds.deadlineAt > state.deadlineAt || request.bounds.timeoutMs > state.timeoutMs))
        return denied("invalid-request");
      if (state?.pending) return denied("provider-unavailable");
      if (!state) {
        if (jobs.size >= options.maxJobs) return denied("request-budget-exhausted");
        state = { fingerprint, charged: 0, maxRequests: request.bounds.maxRequests, deadlineAt: request.bounds.deadlineAt,
          timeoutMs: request.bounds.timeoutMs, pending: false };
        jobs.set(request.jobId, state);
      } else {
        state.deadlineAt = request.bounds.deadlineAt;
        state.timeoutMs = request.bounds.timeoutMs;
      }
      state.pending = true;
      ownsPending = true;
      const owningJob = state;
      const expiration = new Promise<never>((_resolve, reject) => {
        abortWait = () => reject(new ProviderFallbackError("timeout"));
        signal.addEventListener("abort", abortWait, { once: true });
        if (signal.aborted) abortWait();
        timer = setTimeout(() => {
          controller.abort(); reject(new ProviderFallbackError("timeout"));
        }, Math.max(1, allowance - (performance.now() - startedAt)));
      });
      void expiration.catch(() => undefined);
      async function bounded<Value>(operation: () => Promise<Value>): Promise<Value> {
        authorize(); const result = await Promise.race([operation(), expiration]); authorize(); return result;
      }
      const fixture = await bounded(canonical);
      providerPending = true;
      const result = await bounded(() => options.adapter.fallback.predictions(request.context.externalFixtureId,
        { ...request.bounds, deadlineAt, timeoutMs: Math.min(request.bounds.timeoutMs, Math.max(1, deadlineAt - timeCheck())),
          maxRequests: Math.max(1, owningJob.maxRequests - owningJob.charged) }, {
          signal, deadlineAt,
          check() {
            try {
              authorize();
              assertFresh(fixture.retrievedAt, fixture.providerUpdatedAt, policy.fixtureFreshness, timeCheck(), "stale-context");
            } catch (error) {
              finalFailure = error instanceof ProviderFallbackError ? error.reason : "not-authorized";
              throw error;
            }
          },
          beforeReserve() {
            authorize();
            if (owningJob.charged >= owningJob.maxRequests) {
              finalFailure = "request-budget-exhausted";
              throw new ProviderFallbackError(finalFailure);
            }
          },
          beforeDispatch() {
            authorize();
            if (owningJob.charged >= owningJob.maxRequests) {
              finalFailure = "request-budget-exhausted";
              throw new ProviderFallbackError(finalFailure);
            }
            owningJob.charged++; dispatched++;
          },
        }));
      providerPending = false;
      countUnknown = dispatched > 0 && (result.provenance.length === 0 || result.provenance.some((page) => page.quota.kind === "uncertain"));
      if (!Number.isSafeInteger(result.requestsDispatched) || result.requestsDispatched !== dispatched) throw new ProviderFallbackError("invalid-response");
      if (finalFailure !== undefined) throw new ProviderFallbackError(finalFailure);
      if (result.status !== "complete" || !result.completeness.complete || result.error !== null) {
        const reason = result.error?.reason;
        throw new ProviderFallbackError(reason === "quota-denied" || reason === "rate-limited" ? "quota-denied" :
          reason === "deadline-exceeded" ? "timeout" : reason === "request-budget-exhausted" ? "request-budget-exhausted" :
          reason === "operation-not-authorized" ? "not-authorized" : reason === "schema-error" ? "invalid-response" : "provider-unavailable");
      }
      if (result.data.length !== 1 || result.provenance.length < 1 || result.provenance.length > request.bounds.maxRequests + 1 ||
        result.completeness.invalidRows !== 0) throw new ProviderFallbackError("invalid-response");
      const pages = result.provenance.filter((page) => page.currentPage === 1 && page.totalPages === 1 && page.quota.kind === "success");
      if (pages.length !== 1 || result.provenance.some((page) => page.provider !== "api-football" || page.endpoint !== "predictions" ||
        page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION || evidenceFingerprint(page.requestParameters) !==
          evidenceFingerprint({ fixture: String(request.context.externalFixtureId) }) || page.retrievedAt > timeCheck() ||
        page.providerUpdatedAt !== null && page.providerUpdatedAt > page.retrievedAt || typeof page.fromCache !== "boolean" ||
        page !== pages[0] && (page.currentPage !== null || page.totalPages !== null || !["uncertain", "rate-limited", "provider-error"].includes(page.quota.kind))))
        throw new ProviderFallbackError("wrong-identity");
      const row = result.data[0]!, page = pages[0]!;
      if (row.purpose !== "fallback-only" || row.homeTeam.id !== request.context.home.externalId || row.awayTeam.id !== request.context.away.externalId ||
        page.provider !== "api-football" || page.endpoint !== "predictions" || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION ||
        evidenceFingerprint(page.requestParameters) !== evidenceFingerprint({ fixture: String(request.context.externalFixtureId) }) ||
        page.currentPage !== 1 || page.totalPages !== 1 || page.quota.kind !== "success" || typeof page.fromCache !== "boolean" ||
        row.source.provider !== "api-football" || row.source.endpoint !== "/predictions" || row.source.retrievedAt !== page.retrievedAt ||
        row.source.providerUpdatedAt !== page.providerUpdatedAt || [row.homeTeam.source, row.awayTeam.source].some((source) =>
          evidenceFingerprint(source) !== evidenceFingerprint(row.source))) throw new ProviderFallbackError("wrong-identity");
      if (!verified(() => options.authority.verifyObservation(result, request, policy))) throw new ProviderFallbackError("not-authorized");
      assertFresh(row.source.retrievedAt, row.source.providerUpdatedAt, policy.predictionFreshness, timeCheck());
      await bounded(canonical);
      const probabilities = row.reportedPercentages;
      const markets = unsupportedMarkets(validateMarketSnapshot({ "match-result": { source: "api-football", period: marketRules.period,
        probabilities: { "home-win": probabilities.home === null ? null : probabilities.home / 100,
          draw: probabilities.draw === null ? null : probabilities.draw / 100,
          "away-win": probabilities.away === null ? null : probabilities.away / 100 } } }));
      const candidate: ProviderFallbackCandidate = freezeEvidence({ context: request.context, policyVersion: policy.version, policyEvidenceRef: policy.evidenceRef,
        markets, timestamps: { generatedAt: null, retrievedAt: row.source.retrievedAt, providerUpdatedAt: row.source.providerUpdatedAt },
        provenance: { provider: "api-football", endpoint: "predictions", externalFixtureId: request.context.externalFixtureId, jobId: request.jobId,
          contractVersion: API_FOOTBALL_CONTRACT_VERSION, observationHash: evidenceFingerprint({ data: result.data, provenance: result.provenance.map(({ quota: _quota, ...rest }) => { void _quota; return rest; }) }),
          sourceUrl: policy.sourceUrl, sourceEvidenceRef: policy.sourceEvidenceRef,
          supportEvidenceRefs: { "match-result": policy.matchResultMapping!.evidenceRef }, fromCache: page.fromCache },
        flags: row.source.providerUpdatedAt === null ? ["unknown-generation-time", "unknown-provider-update-time"] : ["unknown-generation-time"] });
      const proof: CandidateProof = { request, policy, result, now: currentTime, isCurrent(now) {
        try {
          if (now < enteredAt || now >= getPublicationDeadline(request.context.kickoffAt)) return false;
          assertFresh(fixture.retrievedAt, fixture.providerUpdatedAt, policy.fixtureFreshness, now, "stale-context");
          assertFresh(row.source.retrievedAt, row.source.providerUpdatedAt, policy.predictionFreshness, now);
          return policy.unknownGenerationTime === "allow-flagged";
        } catch { return false; }
      }, authorize(now) {
        if (now < enteredAt) throw new ProviderFallbackError("clock-regression");
        authorize(now);
        assertFresh(fixture.retrievedAt, fixture.providerUpdatedAt, policy.fixtureFreshness, now, "stale-context");
        assertFresh(row.source.retrievedAt, row.source.providerUpdatedAt, policy.predictionFreshness, now);
        if (!verified(() => options.authority.verifyObservation(result, request, policy))) throw new ProviderFallbackError("not-authorized");
        authorize(now);
        const actualNow = currentTime();
        if (actualNow < now) throw new ProviderFallbackError("clock-regression");
        assertFresh(fixture.retrievedAt, fixture.providerUpdatedAt, policy.fixtureFreshness, actualNow, "stale-context");
        assertFresh(row.source.retrievedAt, row.source.providerUpdatedAt, policy.predictionFreshness, actualNow);
        if (actualNow >= getPublicationDeadline(request.context.kickoffAt)) throw new ProviderFallbackError("ineligible-refresh");
      } };
      proof.authorize(timeCheck()); prepared.set(candidate, proof);
      return freezeEvidence({ status: "candidate", candidate, requestsDispatched: dispatched, requestCountUnknown: false });
    } catch (error) {
      controller.abort();
      return denied(error instanceof ProviderFallbackError ? error.reason : finalFailure ?? "provider-unavailable", dispatched, providerPending || countUnknown);
    } finally {
      clearTimeout(timer);
      if (abortWait !== undefined) signal.removeEventListener("abort", abortWait);
      if (state && ownsPending) state.pending = false;
    }
  } });
}

import { createProviderFallbackAdapter } from "../../src/server/fallback/fallback-adapter.ts";
import { createApiFootballAdapter } from "../../src/server/football/api-football-adapter.ts";
import { createQuotaGateway } from "../../src/server/football/quota-gateway.ts";
import { marketRules } from "../../src/domain/markets.ts";
import { EVIDENCE_NOW, evidenceContext, evidenceHash } from "./evidence-fixtures.mjs";

// All accounts, permissions, catalogue rows and responses here are synthetic.
// Real HTTP is replaced and no live credential or provider account is read.
export const FALLBACK_NOW = EVIDENCE_NOW + 10_000;
export const FALLBACK_JOB = evidenceHash("synthetic-provider-fallback-job");
export function fallbackPolicy(overrides = {}) {
  const freshness = { maxRetrievalAgeMs: 60_000, maxSourceAgeMs: 120_000,
    unknownUpdateTime: "retrieval-only", evidenceRef: "synthetic-provider-freshness-proof" };
  return { version: "synthetic-provider-fallback-v1", evidenceRef: "synthetic-provider-fallback-policy-proof",
    sourceEvidenceRef: "synthetic-provider-private-forecast-rights", fixtureFreshness: { ...freshness }, predictionFreshness: { ...freshness },
    unknownGenerationTime: "allow-flagged", matchResultMapping: { sourceField: "predictions.percent", probabilityUnits: "percent",
      period: marketRules.period, completeProbabilities: true, evidenceRef: "synthetic-regulation-percent-mapping-proof" },
    sourceUrl: "https://www.api-football.com/documentation-v3", ...overrides };
}
export function fallbackBounds(overrides = {}) {
  return { priority: "near-kickoff-fallback", deadlineAt: FALLBACK_NOW + 10_000, timeoutMs: 1000,
    maxRequests: 1, maxPages: 1, maxRows: 1, maxResponseBytes: 100_000,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0, ...overrides };
}
export function fallbackCanonical(context = evidenceContext(), overrides = {}) {
  return { id: context.fixtureId, dataVersion: context.fixtureVersion, externalId: context.externalFixtureId,
    homeTeamId: context.home.teamId, awayTeamId: context.away.teamId,
    homeExternalIds: [1000, context.home.externalId], awayExternalIds: [2000, context.away.externalId],
    kickoff: context.kickoffAt, status: "scheduled", providerStatus: "NS", retrievedAt: FALLBACK_NOW - 1000,
    providerUpdatedAt: null, ...overrides };
}
export function fallbackRawPrediction(context = evidenceContext(), overrides = {}) {
  return { teams: { home: { id: context.home.externalId, name: "Synthetic home" }, away: { id: context.away.externalId, name: "Synthetic away" } },
    predictions: { winner: { id: context.home.externalId, name: "Synthetic home" }, win_or_draw: true, under_over: "-2.5",
      goals: { home: "1.5", away: "0.5" }, advice: "Synthetic provider pick only", percent: { home: "60%", draw: "25%", away: "15%" } }, ...overrides };
}
export function fallbackResponse(url, rows, { status = 200, errors = [], headers = {} } = {}) {
  return new Response(JSON.stringify({ get: url.pathname.slice(1), parameters: Object.fromEntries(url.searchParams),
    errors, results: rows.length, paging: { current: 1, total: 1 }, response: rows }),
  { status, headers: { "content-type": "application/json", ...headers } });
}
export function fallbackAdapterSetup({ context = evidenceContext(), policy = fallbackPolicy(), fixture = fallbackCanonical(context),
  respond, authority = {}, limiter = {}, cacheAllowed = true, maxJobs = 10, adapterOptions = {} } = {}) {
  let now = FALLBACK_NOW, allowed = true, mappingAllowed = true, permission = cacheAllowed, catalogue = fixture;
  const network = [], reservations = [], completions = [], canonicalReads = [], credentials = [];
  const authorize = () => { if (!allowed) throw new Error("Synthetic private revoked authorization"); };
  const gateway = createQuotaGateway({ authorize, limiter: {
    async reserve(request) { reservations.push(request); return { status: "reserved", permit: {
      requestId: request.requestId, periodId: evidenceHash("synthetic-fallback-quota-period"), ownerToken: evidenceHash(request.requestId),
      dispatchedAt: now, launchBefore: now + 1000 } }; },
    async claimLaunch() { return { status: "claimed", timeoutMs: 1000 }; },
    async complete(permit, feedback) { completions.push({ permit, feedback }); return { status: "recorded" }; }, ...limiter,
  } });
  const api = createApiFootballAdapter({ accountId: evidenceHash("synthetic-fallback-account"), credential: { read() {
    credentials.push(true); return "synthetic-private-fallback-key";
  } }, gateway, authorize, clock: { now: () => now }, sleep: async (ms) => { now += ms; }, random: () => 0.5,
  verifyCacheUse: () => permission,
  fetcher: async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    network.push({ url, init }); return respond ? respond(url, init, network.length) : fallbackResponse(url, [fallbackRawPrediction(context)]);
  }, ...adapterOptions });
  const fallback = createProviderFallbackAdapter({ adapter: api, policy, maxJobs, clock: { now: () => now },
    catalog: { async fixtureByProviderId(id) { canonicalReads.push(id); return catalogue; } },
    authority: { authorize, verifyContext: () => true, verifyPolicy: () => true, verifyMapping: () => mappingAllowed,
      verifyObservation: () => true, verifySourceUrl: () => true, ...authority } });
  const request = (overrides = {}) => ({ context, jobId: FALLBACK_JOB,
    requestedGroups: ["match-result", "total-goals", "both-teams-to-score"], bounds: fallbackBounds(), ...overrides });
  return { api, fallback, context, policy, request, network, reservations, completions, canonicalReads, credentials,
    setNow(value) { now = value; }, setAllowed(value) { allowed = value; }, setMappingAllowed(value) { mappingAllowed = value; },
    setCacheAllowed(value) { permission = value; }, setCanonical(value) { catalogue = value; } };
}

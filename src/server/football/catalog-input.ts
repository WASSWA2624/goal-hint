import "server-only";
import { isSafeRemoteImageUrl as isSafeCatalogLogo } from "../../domain/remote-image.ts";
export { isSafeRemoteImageUrl as isSafeCatalogLogo } from "../../domain/remote-image.ts";

import { createHash } from "node:crypto";
import { z } from "zod";
import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { settleMarketSelection } from "../../domain/market-settlement.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballEndpoints } from "./api-football-contract.ts";
import { normalizeFixture, type NormalizedFixture, type NormalizedTeam, type NormalizedCompetition } from "./api-football-normalize.ts";
import type { CatalogAuthority, CatalogImportRequest, CatalogPreparedBatch, CatalogProviderRow, CatalogSelection, CatalogTeamMapping } from "./catalog-contract.ts";
import type { ApiFootballResult, ApiFootballFailure } from "./api-football-contract.ts";

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonnegative = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Reuse 007's safe integer identity range; MySQL stores these as unsigned BIGINT.
const identity = positive;
const season = positive.max(9999);
const instant = z.number().int().refine((value) => {
  try {
    utcInstantFromEpochMilliseconds(value);
    const year = new Date(value).getUTCFullYear();
    return year >= 1000 && year <= 9999;
  } catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
const date = z.string().refine((value) => {
  try { return Number(parseReportingDate(value).slice(0, 4)) >= 1000; } catch { return false; }
});
const reference = z.string().min(1).max(512).refine((value) => value === value.trim() && !/[\r\n\0]/u.test(value) &&
  (!/^https?:/iu.test(value) || isSafeCatalogLogo(value)));
const string = (maximum: number) => z.string().max(maximum).refine((value) => !/\0/u.test(value));
const searchableText = (maximum: number) => string(maximum).refine((value) => {
  try { return normalizeCatalogSearch(value).length <= maximum; } catch { return false; }
}).nullable();
const text = string(512).nullable();
const country = searchableText(256);
const fixtureQuery = z.object({
  date: date.optional(), competitionId: identity.optional(), season: season.optional(), teamId: identity.optional(),
  from: date.optional(), to: date.optional(), round: z.string().min(1).max(200).optional(), fixtureId: identity.optional(),
}).strict().refine((query) => {
  if (!Object.values(query).some((value) => value !== undefined) || query.competitionId !== undefined && query.season === undefined) return false;
  if (query.season !== undefined && query.competitionId === undefined && query.teamId === undefined) return false;
  if ((query.from === undefined) !== (query.to === undefined) || query.date !== undefined && query.from !== undefined) return false;
  if (query.from !== undefined && query.to !== undefined && query.from > query.to) return false;
  if (query.round !== undefined && query.competitionId === undefined) return false;
  return query.fixtureId === undefined || Object.values(query).filter((value) => value !== undefined).length === 1;
});
const selectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixtures"), query: fixtureQuery }).strict(),
  z.object({ kind: z.literal("teams"), query: z.union([
    z.object({ teamId: identity }).strict(), z.object({ competitionId: identity, season }).strict(),
  ]) }).strict(),
  z.object({ kind: z.literal("competitions"), query: z.object({ competitionId: identity.optional(), season: season.optional() }).strict() }).strict(),
]);
const boundsSchema = z.object({
  priority: z.enum(["results-cutoff", "recovery", "near-kickoff-fallback", "live-date-sync", "daily-inputs", "enrichment"]),
  deadlineAt: instant, timeoutMs: positive.max(2_147_483_647), maxRequests: positive, maxPages: positive,
  maxRows: positive, maxResponseBytes: positive, cacheMaxAgeMs: nonnegative, cacheScope: z.string().min(1).max(256).optional(),
  retry: z.object({ maxAttempts: positive, baseDelayMs: nonnegative.max(2_147_483_647), maxDelayMs: nonnegative.max(2_147_483_647) }).strict(),
}).strict().refine((bounds) => bounds.retry.baseDelayMs <= bounds.retry.maxDelayMs);
const requestSchema = z.object({
  id: z.uuid().transform((value) => value.toLowerCase()), selection: selectionSchema, bounds: boundsSchema, retentionEvidenceRef: reference,
  knownSubset: z.object({ fixtureIds: z.array(identity).min(1), evidenceRef: reference }).strict().optional(),
}).strict().refine((request) => request.knownSubset === undefined || request.selection.kind === "fixtures" &&
  new Set(request.knownSubset.fixtureIds).size === request.knownSubset.fixtureIds.length);
const mappingSchema = z.object({ externalId: identity, candidateExternalId: identity, evidenceRef: reference.nullable(),
  sourceRef: reference.refine((value) => {
    if (!/^https?:/iu.test(value)) return true;
    return isSafeCatalogLogo(value);
  }), observedAt: instant,
}).strict().refine((mapping) => mapping.externalId !== mapping.candidateExternalId);

const sourceSchema = z.object({ provider: z.literal("api-football"), endpoint: z.enum(["/fixtures", "/teams", "/leagues"]),
  retrievedAt: instant, providerUpdatedAt: instant.nullable() }).strict();
const logoSchema = z.object({ url: z.string().max(2048).nullable(), rights: z.enum(["approved", "review-required", "unavailable"]) }).strict();
const teamSchema = z.object({ id: identity, name: searchableText(512), code: string(64).nullable(), country, national: z.boolean().nullable(),
  logo: logoSchema, source: sourceSchema }).strict();
const coverageKeys = new Set(["fixtures.events", "fixtures.lineups", "fixtures.statistics_fixtures", "fixtures.statistics_players",
  "standings", "players", "top_scorers", "top_assists", "top_cards", "injuries", "predictions", "odds"]);
const competitionSchema = z.object({ id: identity, name: searchableText(512), country, type: string(32).nullable(), season: season.nullable(), round: text,
  seasons: z.array(z.object({ year: season, current: z.boolean().nullable(),
    coverage: z.record(z.string(), z.boolean().nullable()).refine((values) => Object.keys(values).every((key) => coverageKeys.has(key))),
  }).strict()).max(200), logo: logoSchema, source: sourceSchema,
}).strict().refine((competition) => new Set(competition.seasons.map((entry) => entry.year)).size === competition.seasons.length);
const goal = nonnegative.max(1000);
const pair = z.object({ home: goal.nullable(), away: goal.nullable() }).strict();
const score = z.object({ fixtureId: identity, providerStatus: z.enum(["FT", "AET", "PEN"]), sourceField: z.literal("score.fulltime"),
  period: z.literal("regulation-including-stoppage-time"), home: goal, away: goal, verified: z.boolean() }).strict();
const fixtureSchema = z.object({ id: identity, homeTeam: teamSchema, awayTeam: teamSchema, competition: competitionSchema,
  kickoff: instant.nullable(), status: z.enum(["scheduled", "live", "finished-regulation", "finished-extra-time", "finished-penalties",
    "postponed", "canceled", "abandoned", "awarded", "unknown"]), providerStatus: string(32).nullable(), elapsedMinutes: goal.nullable(),
  regulationScore: score.nullable(), reportedGoals: pair, extraTimeScore: pair, penaltyScore: pair, source: sourceSchema,
}).strict().refine((fixture) => fixture.homeTeam.id !== fixture.awayTeam.id && fixture.competition.season !== null);
const failures = ["invalid-request", "invalid-credential", "operation-not-authorized", "authentication-error", "subscription-expired",
  "rate-limited", "transport-error", "response-body-error", "coverage-error", "schema-error", "response-too-large", "quota-denied",
  "shared-work-pending", "deadline-exceeded", "request-budget-exhausted", "pagination-incomplete"] as const;
const quotaReasons = ["invalid-request", "unverified-account", "unknown-account", "storage-unavailable", "clock-regression",
  "credential-failure", "subscription-expired", "request-expired", "already-attempted", "priority-wait", "pacing", "second-limit",
  "minute-limit", "daily-limit", "essential-reserve", "retry-delay", "reset-unconfirmed", "invalid-reset-evidence",
  "operation-not-authorized", "dispatch-expired"] as const;
const failureSchema = z.object({ reason: z.enum(failures), retryable: z.boolean(), httpStatus: positive.max(599).optional(),
  retryAfterMs: nonnegative.optional(), quotaReason: z.enum(quotaReasons).optional(), retryAt: instant.optional() }).strict();
const quotaSchema = z.object({ kind: z.enum(["success", "uncertain", "rate-limited", "credential-failure", "subscription-expired", "provider-error"]),
  dailyLimit: nonnegative.optional(), dailyRemaining: nonnegative.optional(), minuteLimit: nonnegative.optional(),
  minuteRemaining: nonnegative.optional(), retryAfterMs: nonnegative.optional() }).strict();
const provenanceSchema = z.object({ provider: z.literal("api-football"), endpoint: z.enum(["fixtures", "teams", "competitions"]),
  requestParameters: z.record(z.string(), z.string().max(512)), contractVersion: z.literal(API_FOOTBALL_CONTRACT_VERSION),
  retrievedAt: instant, providerUpdatedAt: instant.nullable(), fromCache: z.boolean(),
  currentPage: positive.nullable(), totalPages: positive.nullable(), quota: quotaSchema,
}).strict();
const safeCoverage = z.string().min(1).max(512).regex(/^[a-z0-9._-]+$/u);
const resultSchema = z.object({ status: z.enum(["complete", "partial", "failed"]), data: z.array(z.unknown()),
  completeness: z.object({ complete: z.boolean(), reasons: z.array(z.enum(failures)), missingIds: z.array(identity),
    missingCoverage: z.array(safeCoverage), invalidRows: nonnegative }).strict(),
  provenance: z.array(z.unknown()), requestsDispatched: nonnegative, error: failureSchema.nullable(),
}).strict();

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined).sort(([left], [right]) => left.localeCompare(right, "en-US")).map(([key, child]) => [key, canonical(child)]),
  );
  return value;
}
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const verified = (operation: () => boolean): boolean => { try { return operation() === true; } catch { return false; } };
const validatedBatches = new WeakMap<object, CatalogAuthority>();
export class CatalogInputError extends Error {
  readonly reason: "invalid-request" | "invalid-result" | "invalid-mapping" | "operation-not-authorized" | "retention-not-authorized" | "unverified-observation";
  constructor(reason: CatalogInputError["reason"]) {
    super("Catalog input or authorization is invalid. Private values are withheld.");
    this.name = "CatalogInputError";
    this.reason = reason;
  }
}
export function parseCatalogImportRequest(value: unknown): CatalogImportRequest {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) throw new CatalogInputError("invalid-request");
  return freeze(canonical(parsed.data)) as CatalogImportRequest;
}
export function parseCatalogTeamMapping(value: unknown): CatalogTeamMapping {
  const parsed = mappingSchema.safeParse(value);
  if (!parsed.success) throw new CatalogInputError("invalid-mapping");
  return freeze(parsed.data);
}
export function parseCatalogEvidenceRef(value: unknown): string {
  const parsed = reference.safeParse(value);
  if (!parsed.success) throw new CatalogInputError("invalid-request");
  return parsed.data;
}
/** Only the original immutable validation result can cross the persistence boundary. */
export function assertCatalogPreparedBatch(value: unknown, authority?: CatalogAuthority): asserts value is CatalogPreparedBatch {
  if (value === null || typeof value !== "object" || !validatedBatches.has(value) ||
    authority !== undefined && validatedBatches.get(value) !== authority) throw new CatalogInputError("invalid-result");
}
export function catalogRequestFingerprint(request: CatalogImportRequest): string {
  return fingerprint(parseCatalogImportRequest(request));
}
export function catalogScopeKey(selection: CatalogSelection): string {
  const parsed = selectionSchema.safeParse(selection);
  if (!parsed.success) throw new CatalogInputError("invalid-request");
  return fingerprint(parsed.data);
}
/** Accents and meaningful punctuation remain searchable; names never establish identity. */
export function normalizeCatalogSearch(value: string): string {
  if (typeof value !== "string" || value.length > 512 || /\0/u.test(value)) throw new CatalogInputError("invalid-request");
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  if (normalized.length > 512) throw new CatalogInputError("invalid-request");
  return normalized;
}
function parameters(selection: CatalogSelection): Record<string, string> {
  const params: Record<string, string> = {};
  if (selection.kind === "fixtures") {
    params.timezone = "Africa/Kampala";
    for (const [field, name] of [["date", "date"], ["competitionId", "league"], ["season", "season"], ["teamId", "team"],
      ["from", "from"], ["to", "to"], ["round", "round"], ["fixtureId", "id"]] as const) {
      const value = selection.query[field];
      if (value !== undefined) params[name] = String(value);
    }
  } else if (selection.kind === "teams") {
    if ("teamId" in selection.query) params.id = String(selection.query.teamId);
    else { params.league = String(selection.query.competitionId); params.season = String(selection.query.season); }
  } else {
    if (selection.query.competitionId !== undefined) params.id = String(selection.query.competitionId);
    if (selection.query.season !== undefined) params.season = String(selection.query.season);
  }
  return params;
}
function sources(row: CatalogProviderRow) {
  return "homeTeam" in row ? [row.source, row.homeTeam.source, row.awayTeam.source, row.competition.source] : [row.source];
}
function inScope(row: CatalogProviderRow, selection: CatalogSelection): boolean {
  if (selection.kind === "fixtures") {
    if (!("homeTeam" in row)) return false;
    const query = selection.query;
    if (query.fixtureId !== undefined && row.id !== query.fixtureId || query.competitionId !== undefined && row.competition.id !== query.competitionId ||
      query.season !== undefined && row.competition.season !== query.season || query.teamId !== undefined && ![row.homeTeam.id, row.awayTeam.id].includes(query.teamId) ||
      query.round !== undefined && row.competition.round !== query.round) return false;
    if (row.kickoff !== null) {
      let date;
      try { date = getReportingDate(row.kickoff); } catch { return false; }
      if (Number(date.slice(0, 4)) < 1000) return false;
      if (query.date !== undefined && date !== query.date || query.from !== undefined && (date < query.from || date > query.to!)) return false;
    } else if (query.date !== undefined || query.from !== undefined) return false;
    // Reuse 007's status mapping rather than maintain a second provider status table.
    const normalized = normalizeFixture({ fixture: { id: row.id, status: { short: row.providerStatus } },
      teams: { home: { id: row.homeTeam.id }, away: { id: row.awayTeam.id } }, league: { id: row.competition.id },
      goals: row.reportedGoals, score: { fulltime: row.regulationScore === null ? null : {
        home: row.regulationScore.home, away: row.regulationScore.away } } },
    { retrievedAt: row.source.retrievedAt, endpoint: "/fixtures" });
    if (!normalized.valid || normalized.data.status !== row.status) return false;
    return row.regulationScore === null || row.regulationScore.fixtureId === row.id && row.regulationScore.providerStatus === row.providerStatus;
  }
  if (selection.kind === "teams") return "national" in row && (!('teamId' in selection.query) || row.id === selection.query.teamId);
  if (!("seasons" in row)) return false;
  return (selection.query.competitionId === undefined || row.id === selection.query.competitionId) &&
    (selection.query.season === undefined || row.seasons.some((entry) => entry.year === selection.query.season));
}
function approvedTeam(team: NormalizedTeam, authority: CatalogAuthority, missing: Set<string>): NormalizedTeam {
  const logo = approvedLogo(team.logo, authority, missing);
  return { ...team, logo };
}
function approvedLogo(logo: NormalizedTeam["logo"], authority: CatalogAuthority, missing: Set<string>): NormalizedTeam["logo"] {
  if (logo.url === null) return logo;
  if (logo.rights === "approved" && isSafeCatalogLogo(logo.url) && verified(() => authority.verifyLogo(logo.url!))) return logo;
  missing.add("logo-rights-review");
  return { url: null, rights: "review-required" };
}
function approvedRow(row: CatalogProviderRow, authority: CatalogAuthority, missing: Set<string>, scoreEvidenceRefs: Record<string, string>): CatalogProviderRow {
  if ("homeTeam" in row) {
    const candidate = row.regulationScore;
    let regulationScore: NormalizedFixture["regulationScore"] = null;
    if (candidate !== null) {
      const { verified: wasVerified, ...proof } = candidate;
      const settlement = settleMarketSelection("match-result", "home-win", { status: row.status, cycleEligibility: { eligible: true }, regulationScore: candidate });
      let evidenceRef: string | null = null;
      try {
        const parsedRef = reference.safeParse(authority.regulationEvidenceRef?.(proof));
        if (parsedRef.success) evidenceRef = parsedRef.data;
      } catch { /* Missing attributable score evidence leaves the candidate unverified. */ }
      if (wasVerified && evidenceRef !== null && ["correct", "incorrect"].includes(settlement.status) && verified(() => authority.verifyRegulationScore(proof))) {
        regulationScore = candidate;
        scoreEvidenceRefs[String(row.id)] = evidenceRef;
      } else {
        regulationScore = { ...candidate, verified: false };
        missing.add("regulation-score-verification");
      }
    }
    return { ...row, homeTeam: approvedTeam(row.homeTeam, authority, missing), awayTeam: approvedTeam(row.awayTeam, authority, missing),
      competition: { ...row.competition, logo: approvedLogo(row.competition.logo, authority, missing) }, regulationScore };
  }
  return { ...row, logo: approvedLogo(row.logo, authority, missing) };
}

/** Validated structured observations only; this function never fetches or stores raw provider data. */
export function validateCatalogBatch(input: CatalogImportRequest, result: ApiFootballResult<CatalogProviderRow>, authority: CatalogAuthority, clock: Clock): CatalogPreparedBatch {
  const request = parseCatalogImportRequest(input);
  const now = instant.safeParse(clock.now());
  if (!now.success) throw new CatalogInputError("invalid-result");
  try { authority.authorize(request); } catch { throw new CatalogInputError("operation-not-authorized"); }
  if (!verified(() => authority.verifyRetention({ selection: request.selection, evidenceRef: request.retentionEvidenceRef,
    purpose: "structured-catalog-and-audit-history", rawPayloadsStored: false }))) throw new CatalogInputError("retention-not-authorized");
  const parsed = resultSchema.safeParse(result);
  if (!parsed.success || parsed.data.requestsDispatched > request.bounds.maxRequests || parsed.data.data.length > request.bounds.maxRows ||
    parsed.data.provenance.length > request.bounds.maxRequests + request.bounds.maxPages) throw new CatalogInputError("invalid-result");
  if (!verified(() => authority.verifyObservation(request, result))) throw new CatalogInputError("unverified-observation");
  const observation = parsed.data, expected = parameters(request.selection), reasons = new Set<string>(observation.completeness.reasons);
  const missing = new Set(observation.completeness.missingCoverage), validPages: z.infer<typeof provenanceSchema>[] = [];
  for (const page of observation.provenance) {
    const value = provenanceSchema.safeParse(page);
    if (!value.success || value.data.endpoint !== request.selection.kind || value.data.retrievedAt > now.data ||
      value.data.providerUpdatedAt !== null && value.data.providerUpdatedAt > value.data.retrievedAt ||
      fingerprint(value.data.requestParameters) !== fingerprint(expected)) { reasons.add("invalid-source-provenance"); continue; }
    validPages.push(value.data);
  }
  if (validPages.length === 0) reasons.add("missing-source-provenance");
  if (validPages.length !== 1 || validPages.some((page) => page.currentPage !== 1 || page.totalPages !== 1 || page.quota.kind !== "success")) {
    reasons.add("retrieval-incomplete");
  }
  const schema = request.selection.kind === "fixtures" ? fixtureSchema : request.selection.kind === "teams" ? teamSchema : competitionSchema;
  const accepted: CatalogProviderRow[] = [], ids = new Set<number>(), scoreEvidenceRefs: Record<string, string> = {};
  let rejected = 0;
  for (const raw of observation.data) {
    const value = schema.safeParse(raw);
    if (!value.success || !inScope(value.data, request.selection) || ids.has(value.data.id) || !sources(value.data).every((source) =>
      source.retrievedAt <= now.data && (source.providerUpdatedAt === null || source.providerUpdatedAt <= source.retrievedAt) && validPages.some((page) =>
        source.endpoint === apiFootballEndpoints[page.endpoint].path && source.retrievedAt === page.retrievedAt && source.providerUpdatedAt === page.providerUpdatedAt))) {
      rejected++; reasons.add("invalid-row-or-scope"); continue;
    }
    ids.add(value.data.id);
    accepted.push(approvedRow(value.data, authority, missing, scoreEvidenceRefs));
  }
  const missingIds = [...new Set(observation.completeness.missingIds)].sort((left, right) => left - right);
  if (request.selection.kind === "fixtures" && request.selection.query.fixtureId !== undefined && !ids.has(request.selection.query.fixtureId)) {
    missingIds.push(request.selection.query.fixtureId);
  }
  if (missingIds.length > 0) reasons.add("missing-identities");
  if (observation.completeness.invalidRows > 0 || rejected > 0) reasons.add("invalid-rows");
  if (!observation.completeness.complete || observation.status !== "complete" || observation.error !== null) reasons.add("retrieval-incomplete");
  let status: CatalogPreparedBatch["status"] = reasons.size === 0 ? "complete" : accepted.length === 0 ? "failed" : "partial";
  if (request.knownSubset !== undefined) {
    const subset = request.knownSubset;
    const permitted = observation.status === "partial" && request.selection.kind === "fixtures" && accepted.length > 0 && rejected === 0 &&
      accepted.every((row) => subset.fixtureIds.includes(row.id)) && verified(() => authority.verifyKnownSubset?.({ selection: request.selection,
        fixtureIds: subset.fixtureIds, evidenceRef: subset.evidenceRef }) === true);
    if (permitted) { status = "degraded"; reasons.add("explicit-known-subset"); }
    else { status = accepted.length > 0 ? "partial" : "failed"; reasons.add("known-subset-unverified"); }
  }
  const provenance = validPages.map((page) => ({ provider: page.provider, endpoint: page.endpoint, requestParameters: page.requestParameters,
    contractVersion: page.contractVersion, retrievedAt: page.retrievedAt, providerUpdatedAt: page.providerUpdatedAt, fromCache: page.fromCache,
    currentPage: page.currentPage, totalPages: page.totalPages }));
  const latestRetrievedAt = provenance.length > 0 ? utcInstantFromEpochMilliseconds(Math.max(...provenance.map((page) => page.retrievedAt))) : null;
  const rows = { fixtures: request.selection.kind === "fixtures" ? accepted as NormalizedFixture[] : [],
    teams: request.selection.kind === "teams" ? accepted as NormalizedTeam[] : [],
    competitions: request.selection.kind === "competitions" ? accepted as NormalizedCompetition[] : [] };
  const content = { request, selection: request.selection, rows, scoreEvidenceRefs, latestRetrievedAt, scopeKey: catalogScopeKey(request.selection),
    requestFingerprint: catalogRequestFingerprint(request), status, reasons: [...reasons].sort(), missingIds: [...new Set(missingIds)].sort((a, b) => a - b),
    missingCoverage: [...missing].sort(), invalidRows: observation.completeness.invalidRows + rejected, requestsDispatched: observation.requestsDispatched,
    provenance, error: canonical(observation.error) as ApiFootballFailure | null,
    completeEmpty: status === "complete" && request.selection.kind === "fixtures" && accepted.length === 0 };
  const batch = freeze({ ...content, observedAt: latestRetrievedAt ?? now.data, fingerprint: fingerprint(content) });
  validatedBatches.set(batch, authority);
  return batch;
}

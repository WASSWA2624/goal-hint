import "server-only";

import { z } from "zod";
import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import { DE_MARGIN_METHOD } from "../../domain/odds.ts";
import { ODDS_MAPPING_VERSION } from "../../domain/odds-markets.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { API_FOOTBALL_CONTRACT_VERSION, ODDS_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballEndpoint,
  type ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFixtureOdds } from "../football/api-football-normalize.ts";
import { oddsFail, type OddsAuthority, type OddsImportRequest, type OddsPolicy, type OddsProvenance,
  type ValidatedOddsObservation } from "./odds-contract.ts";

const DAY = 86_400_000;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.number().int().min(0).max(253_402_300_799_999);
/** Bookmaker and bet ids are stored in unsigned 32-bit columns; provider fixture and league ids are not. */
const identity = z.number().int().positive().max(4_294_967_295);
const providerIdentity = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const reference = z.string().trim().min(1).max(512).regex(/^[^\p{Cc}]+$/u);
const policySchema = z.strictObject({
  version: z.literal(1), evidenceRef: reference, retentionEvidenceRef: reference, basis: z.literal("bookmaker"),
  bookmakerId: identity, method: z.literal(DE_MARGIN_METHOD), mappingVersion: z.literal(ODDS_MAPPING_VERSION),
  contractVersion: z.literal(ODDS_CONTRACT_VERSION),
  freshnessMs: z.number().int().min(60_000).max(7 * DAY), retainAfterKickoffMs: z.number().int().min(DAY).max(400 * DAY),
  horizonDays: z.number().int().min(1).max(7), sweepMs: z.number().int().min(15 * 60_000).max(DAY),
});
const requestSchema = z.strictObject({
  id: hash, kind: z.enum(["prices", "bets", "bookmakers"]), slot: instant, date: z.iso.date().nullable(), policy: policySchema,
}).refine((value) => (value.kind === "prices") === (value.date !== null));
const providerTimes = z.strictObject({ provider: z.literal("api-football"), endpoint: z.string(), retrievedAt: instant,
  providerUpdatedAt: instant.nullable() });
const oddsRowSchema = z.strictObject({
  fixtureId: providerIdentity,
  competition: z.strictObject({ id: providerIdentity, season: z.number().int().min(1).max(9_999).nullable() }),
  kickoff: instant.nullable(),
  bookmakers: z.array(z.strictObject({
    id: identity, name: z.string().min(1).max(128).nullable(),
    bets: z.array(z.strictObject({ id: identity, name: z.string().min(1).max(256).nullable(),
      values: z.array(z.strictObject({ label: z.string().min(1).max(64), odd: z.string().regex(/^[1-9]\d{0,4}(?:\.\d{0,3}[1-9])?$/u) }))
        .min(1).max(1_000) })).max(1_000),
    // The normalizer quarantines a bet whose id does not fit storage, so a rejected id may exceed 32 bits.
    rejectedBets: z.array(providerIdentity).max(1_000),
  })).max(200),
  source: providerTimes,
});
const catalogRowSchema = z.strictObject({ id: identity, name: z.string().min(1).max(256), source: providerTimes });
const failureReason = z.string().regex(/^[a-z-]{1,64}$/u);
const resultSchema = z.object({
  status: z.enum(["complete", "partial", "failed"]), data: z.array(z.unknown()),
  completeness: z.object({ complete: z.boolean(), reasons: z.array(failureReason), missingIds: z.array(z.number()),
    missingCoverage: z.array(z.string().min(1).max(512)), invalidRows: z.number().int().nonnegative() }).strict(),
  provenance: z.array(z.unknown()), requestsDispatched: z.number().int().nonnegative(),
  error: z.object({ reason: failureReason, retryable: z.boolean() }).passthrough().nullable(),
}).strict();
const pageSchema = z.object({ provider: z.literal("api-football"), endpoint: z.string(), requestParameters: z.record(z.string(), z.string().max(512)),
  contractVersion: z.literal(API_FOOTBALL_CONTRACT_VERSION), retrievedAt: instant, providerUpdatedAt: instant.nullable(), fromCache: z.boolean(),
  currentPage: z.number().int().positive().nullable(), totalPages: z.number().int().positive().nullable(),
  quota: z.object({ kind: z.string() }).passthrough() }).strict();

const validated = new WeakSet<object>();
const endpointOf = { prices: "odds", bets: "oddsBets", bookmakers: "oddsBookmakers" } as const satisfies Record<OddsImportRequest["kind"], ApiFootballEndpoint>;

export function parseOddsPolicy(value: unknown): OddsPolicy {
  const parsed = policySchema.safeParse(value);
  return parsed.success ? freezeEvidence(parsed.data) : oddsFail("invalid-request");
}
export function parseOddsRequest(value: unknown): OddsImportRequest {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) return oddsFail("invalid-request");
  if (parsed.data.date !== null) { try { parseReportingDate(parsed.data.date); } catch { return oddsFail("invalid-request"); } }
  return freezeEvidence(parsed.data as OddsImportRequest);
}
export const oddsPolicyHash = (policy: OddsPolicy) => evidenceFingerprint(parseOddsPolicy(policy));
export function oddsScopeKey(request: Pick<OddsImportRequest, "kind" | "date" | "policy">): string {
  return request.kind === "prices" ? `date:${request.date}:bookmaker:${request.policy.bookmakerId}` : request.kind;
}
/** Exact provider selectors for one request; every non-timezone selector is echoed by the provider. */
export function oddsRequestParameters(request: OddsImportRequest): Readonly<Record<string, string>> {
  return request.kind === "prices" ? Object.freeze({ bookmaker: String(request.policy.bookmakerId), date: request.date!, timezone: "Africa/Kampala" })
    : Object.freeze({});
}
function verified(check: () => unknown): boolean {
  try { const value = check(); if (value instanceof Promise) void value.catch(() => undefined); return value === true; } catch { return false; }
}
/** The authority accepts the request, its exact policy and the retention purpose before any provider call. */
export function authorizeOddsRequest(input: OddsImportRequest, authority: OddsAuthority): OddsImportRequest {
  const request = parseOddsRequest(input);
  try { authority.authorize(request); } catch { return oddsFail("operation-not-authorized"); }
  if (!verified(() => authority.verifyPolicy(request.policy))) return oddsFail("unverified-policy");
  if (!verified(() => authority.verifyRetention({ evidenceRef: request.policy.retentionEvidenceRef, purpose: "structured-odds-history",
    rawPayloadsStored: false }))) return oddsFail("retention-not-authorized");
  return request;
}

/** Structured observations only; this never fetches or stores provider payloads. Page provenance must match the
 * exact selectors; each row's retrieval time must equal its page's, and its own provider update time may not follow it. */
export function validateOddsObservation(input: OddsImportRequest, result: ApiFootballResult<unknown>, bounds: ApiFootballBounds,
  authority: OddsAuthority, clock: Clock): ValidatedOddsObservation {
  const request = authorizeOddsRequest(input, authority);
  const now = clock.now();
  if (!Number.isSafeInteger(now)) return oddsFail("invalid-result");
  const parsed = resultSchema.safeParse(result);
  if (!parsed.success || parsed.data.requestsDispatched > bounds.maxRequests || parsed.data.data.length > bounds.maxRows ||
    parsed.data.provenance.length > bounds.maxRequests + bounds.maxPages) return oddsFail("invalid-result");
  if (!verified(() => authority.verifyObservation(request, result))) return oddsFail("unverified-observation");
  const observation = parsed.data, endpoint = endpointOf[request.kind], expected = oddsRequestParameters(request);
  const reasons = new Set<string>(observation.completeness.reasons), pages: OddsProvenance[] = [];
  for (const raw of observation.provenance) {
    const page = pageSchema.safeParse(raw);
    // Failed attempts carry provenance too; only successful pages establish retrieval.
    if (page.success && page.data.quota.kind !== "success") continue;
    const { page: pageNumber, ...selectors } = page.success ? page.data.requestParameters : {};
    if (!page.success || page.data.endpoint !== endpoint || page.data.retrievedAt > now || page.data.providerUpdatedAt !== null ||
      page.data.fromCache || evidenceFingerprint(selectors) !== evidenceFingerprint(expected) ||
      (request.kind === "prices" ? pageNumber !== String(page.data.currentPage) : pageNumber !== undefined)) {
      reasons.add("invalid-source-provenance"); continue;
    }
    const { quota: _quota, ...retained } = page.data;
    void _quota; pages.push(retained as unknown as OddsProvenance);
  }
  if (pages.length === 0) reasons.add("missing-source-provenance");
  if (pages.some((page, index) => page.currentPage !== index + 1 || page.totalPages !== pages[0]!.totalPages) ||
    pages.length > 0 && pages[0]!.totalPages !== pages.length) reasons.add("retrieval-incomplete");
  const retrievals = new Set<number>(pages.map((page) => page.retrievedAt));
  const sourceValid = (source: z.infer<typeof providerTimes>, path: string) => source.endpoint === path && retrievals.has(source.retrievedAt) &&
    source.retrievedAt <= now && (source.providerUpdatedAt === null || source.providerUpdatedAt <= source.retrievedAt);
  const rows: NormalizedFixtureOdds[] = [], catalog: { id: number; name: string }[] = [], seen = new Set<number>();
  let rejected = 0;
  for (const raw of observation.data) {
    if (request.kind === "prices") {
      const row = oddsRowSchema.safeParse(raw);
      if (!row.success || seen.has(row.data.fixtureId) || !sourceValid(row.data.source, "/odds") || row.data.kickoff === null ||
        getReportingDate(utcInstantFromEpochMilliseconds(row.data.kickoff)) !== request.date ||
        !row.data.bookmakers.every((bookmaker) => bookmaker.id === request.policy.bookmakerId) ||
        row.data.bookmakers.some((bookmaker) => new Set(bookmaker.bets.map((bet) => bet.id)).size !== bookmaker.bets.length ||
          bookmaker.bets.some((bet) => new Set(bet.values.map((value) => value.label)).size !== bet.values.length))) {
        rejected++; reasons.add("invalid-row-or-scope"); continue;
      }
      seen.add(row.data.fixtureId); rows.push(row.data as unknown as NormalizedFixtureOdds);
    } else {
      const row = catalogRowSchema.safeParse(raw);
      if (!row.success || seen.has(row.data.id) || !sourceValid(row.data.source, request.kind === "bets" ? "/odds/bets" : "/odds/bookmakers")) {
        rejected++; reasons.add("invalid-row-or-scope"); continue;
      }
      seen.add(row.data.id); catalog.push({ id: row.data.id, name: row.data.name });
    }
  }
  if (observation.completeness.invalidRows > 0 || rejected > 0) reasons.add("invalid-rows");
  if (!observation.completeness.complete || observation.status !== "complete" || observation.error !== null) reasons.add("retrieval-incomplete");
  const accepted = rows.length + catalog.length;
  const status = reasons.size === 0 ? "complete" : accepted === 0 ? "failed" : "partial";
  const receivedAt = pages.length > 0 ? utcInstantFromEpochMilliseconds(Math.max(...pages.map((page) => page.retrievedAt))) : now as UtcInstant;
  const missingCoverage = [...new Set(observation.completeness.missingCoverage.filter((item) => /^[a-z0-9.:_-]{1,128}$/u.test(item)))].sort();
  const value = freezeEvidence({ request, policyHash: oddsPolicyHash(request.policy), scopeKey: oddsScopeKey(request), status,
    reasons: [...reasons].sort(), requestsDispatched: observation.requestsDispatched, receivedAt, provenance: pages,
    rows: rows.sort((left, right) => left.fixtureId - right.fixtureId), catalog: catalog.sort((left, right) => left.id - right.id),
    missingCoverage }) as ValidatedOddsObservation;
  validated.add(value);
  return value;
}
/** Stores accept only observations produced by validateOddsObservation in this process. */
export function assertValidatedOdds(value: ValidatedOddsObservation): ValidatedOddsObservation {
  return validated.has(value) ? value : oddsFail("invalid-request");
}

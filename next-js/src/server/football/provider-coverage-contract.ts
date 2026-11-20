import "server-only";

import { z } from "zod";
import { parseReportingDate } from "../../domain/calendar.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballEndpoints, type ApiFootballEndpoint } from "./api-football-contract.ts";
import { encodeFootballSourcePage, footballSourceHash, maximumFootballSourcePageBytes } from "./source-page-payload.ts";

export const providerCoverageStates = [
  "not_requested", "queued", "fetching", "complete", "partial", "unavailable", "not_applicable",
  "retryable_failure", "blocked_by_quota", "blocked_by_access",
] as const;

const positive = z.number().int().min(1).max(4_294_967_295);
const counter = z.number().int().min(0).max(4_294_967_295);
const timestamp = z.number().int().min(0).max(Date.UTC(9999, 11, 31, 23, 59, 59, 999));
const token = z.string().regex(/^[a-z][a-zA-Z0-9-]{0,39}$/u);
const secretName = /^(?:authorization|cookie|set-cookie|password|secret|token|access[-_]?token|api[-_]?key|x-(?:rapidapi|apisports)-key)$/iu;
const selectorName = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/iu).refine(key => !secretName.test(key) &&
  key !== "page" && key !== "constructor" && key !== "prototype");
const selectorValue = z.string().min(1).max(1_024).refine(value => value.trim() === value && !/\p{Cc}/u.test(value));
const scope = z.strictObject({
  context: z.enum(["account", "current", "historical", "reference"]),
  accountKey: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  requestKey: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  competitionId: positive.optional(), season: z.number().int().min(1000).max(9999).optional(), teamId: positive.optional(),
  fixtureId: positive.optional(), playerId: positive.optional(), coachId: positive.optional(), venueId: positive.optional(),
  bookmakerId: positive.optional(),
  asOfDate: z.string().refine(value => {
    try { parseReportingDate(value); return true; } catch { return false; }
  }).optional(),
});
const target = z.strictObject({
  resource: token,
  endpoint: z.custom<ApiFootballEndpoint>(value => typeof value === "string" && Object.hasOwn(apiFootballEndpoints, value)),
  scope,
  parameters: z.record(selectorName, selectorValue),
  page: positive,
  section: token,
}).refine(value => Object.keys(value.parameters).length <= 24 &&
  (value.page === 1 || apiFootballEndpoints[value.endpoint]?.paginated));

/** Canonical identity for one resource, scope, endpoint, page and section. Send page to the provider separately. */
export function parseProviderCoverageTarget(value: unknown) {
  const parsed = target.parse(value);
  const parameters = Object.fromEntries(Object.entries(parsed.parameters).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  const { resource, endpoint, scope, page, section } = parsed;
  const key = footballSourceHash(JSON.stringify([resource, endpoint, scope, parameters, page, section]));
  return Object.freeze({ key, resource, endpoint, scope: Object.freeze(scope), parameters: Object.freeze(parameters), page, section });
}

const reasonRequired = new Set<string>(["partial", "unavailable", "not_applicable", "retryable_failure", "blocked_by_quota", "blocked_by_access"]);

export const providerCoverageProgress = z.strictObject({
  status: z.enum(providerCoverageStates),
  reason: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u).nullable(),
  attempts: counter,
  updatedAt: timestamp,
  lastAttemptAt: timestamp.nullable(),
  lastResponseId: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  lastCompleteAt: timestamp.nullable(),
  nextRetryAt: timestamp.nullable(),
  remaining: counter.nullable(),
}).refine(value =>
  (value.attempts === 0) === (value.lastAttemptAt === null) &&
  (value.lastAttemptAt === null || value.lastAttemptAt <= value.updatedAt) &&
  (value.lastCompleteAt === null || value.lastCompleteAt <= value.updatedAt && value.lastResponseId !== null) &&
  (value.nextRetryAt === null || value.nextRetryAt >= value.updatedAt) &&
  (!reasonRequired.has(value.status) || value.reason !== null) &&
  (value.status !== "complete" || value.remaining === 0 && value.lastCompleteAt !== null));

export type ProviderCoverageTarget = z.input<typeof target>;
export type ParsedProviderCoverageTarget = ReturnType<typeof parseProviderCoverageTarget>;
export type ProviderCoverageProgress = z.infer<typeof providerCoverageProgress>;
const envelope = z.looseObject({
  get: z.string(),
  parameters: z.union([z.record(z.string().refine(key => !secretName.test(key)), z.unknown()), z.tuple([])]),
  errors: z.union([z.record(z.string(), z.never()), z.tuple([])]),
  results: counter,
  paging: z.object({ current: positive, total: counter }).optional(),
  response: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
});

export function providerResponsePageLocator(target: ParsedProviderCoverageTarget) {
  const parameters = { ...target.parameters, resourceKey: target.key, page: String(target.page) };
  return { endpoint: `raw:${target.endpoint}`, parameters, selectorHash: footballSourceHash(JSON.stringify(parameters)) };
}

/** Retain the exact validated response bytes. The raw namespace is isolated from legacy row projections. */
export async function prepareProviderResponsePage(input: Readonly<{
  target: ParsedProviderCoverageTarget; observedAt: number; body: Uint8Array;
}>) {
  const { target, body, observedAt } = input;
  if (body.byteLength > maximumFootballSourcePageBytes) throw new RangeError("Provider response exceeds the archive limit.");
  const parsed = envelope.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)));
  const endpoint = apiFootballEndpoints[target.endpoint];
  const emptyPage = parsed.results === 0 && Array.isArray(parsed.response) && parsed.response.length === 0 &&
    parsed.paging?.current === 1 && parsed.paging.total === 0 && target.page === 1;
  const echoed = Array.isArray(parsed.parameters) ? {} : parsed.parameters;
  const selectorMatches = Object.entries(target.parameters).every(([key, value]) =>
    Object.hasOwn(echoed, key) ? String(echoed[key]) === value : key === "timezone") &&
    (!Object.hasOwn(echoed, "page") || String(echoed.page) === String(target.page));
  if (!selectorMatches || parsed.get !== endpoint.path.slice(1) || (parsed.paging === undefined && target.endpoint !== "accountStatus") ||
      (parsed.paging && !emptyPage &&
        (parsed.paging.current !== target.page || parsed.paging.total < target.page || !endpoint.paginated && parsed.paging.total !== 1))) {
    throw new Error("Provider response does not match the archive scope.");
  }
  return encodeFootballSourcePage({ ...providerResponsePageLocator(target), contract: API_FOOTBALL_CONTRACT_VERSION,
    observedAt, rowCount: Array.isArray(parsed.response) ? parsed.response.length : 1, body });
}

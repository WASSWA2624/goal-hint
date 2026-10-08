import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { marketRules, presentMarketProbabilities, validateMarketGroup, type MarketSnapshot, type MarketSource } from "../../domain/markets.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence, isSafeEvidenceLink, parseEvidenceContext } from "../evidence/evidence-input.ts";
import { parseModelPin } from "../predictor/predictor-input.ts";
import type { PredictorResult } from "../predictor/predictor-service.ts";
import type { FallbackContext, ForecastTimestamps, ProviderFallbackCandidate, ProviderFallbackResult } from "./fallback-contract.ts";

export class FallbackInputError extends Error {
  readonly reason = "invalid-request";
  constructor() { super("Forecast resolution input is invalid. Private source details are withheld."); this.name = "FallbackInputError"; }
}
export const fallbackProviderReasons = ["invalid-request", "not-authorized", "unconfigured", "invalid-response", "wrong-identity",
  "unsupported-markets", "stale", "unknown-source-time", "future-source-time", "timeout", "quota-denied", "request-budget-exhausted",
  "provider-unavailable", "clock-regression", "unverified-mapping", "stale-context", "ineligible-refresh"] as const;
export const fallbackAiReasons = ["not-authorized", "invalid-response", "unavailable", "invalid-request", "operation-not-authorized",
  "unverified-policy", "unconfigured", "unpriced", "service-unavailable", "unknown-account", "unknown-job", "unknown-attempt",
  "conflicting-policy", "clock-regression", "period-inactive", "budget-exhausted", "job-budget-exhausted", "request-limit", "token-limit",
  "billed-unit-limit", "time-limit", "fallback-time-reserved", "priority-wait", "already-attempted", "dispatch-expired", "invalid-permit",
  "timeout", "uncertain-usage", "unverified-usage", "conflicting-reconciliation", "invalid-output", "wrong-identity", "invalid-evidence",
  "insufficient-evidence", "invalid-timing", "invalid-citation", "unverified-explanation", "conflicting-pin", "conflicting-invocation",
  "capacity-exhausted", "invalid-candidate", "unverified-calibration", "unverified-evaluation"] as const;
const marketReasons = ["missing-group", "unsupported-family", "derived-only", "invalid-candidate", "invalid-source", "unsupported-period",
  "unsupported-line", "incomplete-group", "invalid-probability", "invalid-sum", "invalid-derived-probability", "cross-market-conflict"] as const;
const groups = ["match-result", "total-goals", "both-teams-to-score"] as const;
const identity = z.string().regex(/^[a-f0-9]{64}$/u);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1).max(512).refine((value) => value === value.trim() && !/[\r\n\0]/u.test(value));
const plain = z.string().min(1).max(4096).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f<>`]/u.test(value) &&
  !/(?:https?:\/\/|www\.|\]\s*\()/iu.test(value));
const instant = z.number().int().refine((value) => {
  try { utcInstantFromEpochMilliseconds(value); const year = new Date(value).getUTCFullYear(); return year >= 1000 && year <= 9999; }
  catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
const timestamps = z.object({ generatedAt: instant.nullable(), retrievedAt: instant, providerUpdatedAt: instant.nullable() }).strict()
  .refine((value) => (value.generatedAt === null || value.generatedAt <= value.retrievedAt) &&
    (value.providerUpdatedAt === null || value.providerUpdatedAt <= value.retrievedAt));
const flag = z.enum(["unknown-generation-time", "unknown-provider-update-time"]);
const flags = z.array(flag).max(2).refine((value) => new Set(value).size === value.length);
const link = z.string().max(2048).refine(isSafeEvidenceLink);
const reference = z.object({ sourceId: identity, factId: identity, claimId: identity, subjectTeamId: z.uuid().nullable() }).strict();
const explanation = z.object({ text: plain, references: z.array(reference).max(100) }).strict();
const evaluation = z.object({ status: z.enum(["provisional", "evaluated"]), version: text, evidenceRef: text,
  evaluationRef: text.nullable() }).strict().refine((value) => (value.status === "evaluated") === (value.evaluationRef !== null));
const calibration = z.object({ kind: z.enum(["none", "evaluated"]), version: text, method: text.nullable(),
  appliedFamilies: z.array(z.enum(groups)).max(3), evidenceRef: text, evaluationRef: text.nullable() }).strict()
  .refine((value) => new Set(value.appliedFamilies).size === value.appliedFamilies.length && (value.kind === "evaluated"
    ? value.method !== null && value.evaluationRef !== null : value.method === null && value.evaluationRef === null && value.appliedFamilies.length === 0));
const source = z.object({ sourceId: identity, publisher: text, title: z.string().min(1).max(2048), sourceUrl: link.nullable(), version: text,
  publishedAt: instant.nullable(), retrievedAt: instant, providerUpdatedAt: instant.nullable() }).strict().refine((value) =>
  (value.publishedAt === null || value.publishedAt <= value.retrievedAt) && (value.providerUpdatedAt === null || value.providerUpdatedAt <= value.retrievedAt));
const coverage = z.object({ sufficient: z.boolean(), independentNewsSources: count, limitedNews: z.boolean(),
  labels: z.array(z.literal("Limited news coverage")).max(1), reasons: z.array(text).max(100) }).strict();
const missing = z.object({ kind: z.enum(["history", "form", "rest", "venue", "statistic", "injury", "lineup", "xg", "news"]),
  subjectTeamId: z.uuid().nullable(), reason: z.enum(["unavailable", "conflicting"]) }).strict();
const aiOutput = z.object({ modelVersionId: identity, evidenceHash: identity, context: z.unknown(), schemaVersion: text,
  outputTiming: z.object({ maxAgeMs: count, basis: z.enum(["generated", "retrieved", "provider-updated"]),
    unknownGeneration: z.enum(["reject", "allow-flagged"]), unknownUpdate: z.enum(["reject", "allow-flagged"]) }).strict(),
  evidence: z.object({ policyVersion: text, coverage, missingness: z.array(missing).max(100_000) }).strict(), markets: z.unknown(),
  reasons: z.array(explanation).min(2).max(4), uncertainty: explanation, sources: z.array(source).max(10_000),
  timestamps: timestamps.extend({ evidenceRef: text }).strict(), flags, calibration, provisional: z.boolean(), evaluation }).strict()
  .refine((value) => value.provisional === (value.evaluation.status !== "evaluated"));
const available = z.discriminatedUnion("available", [z.object({ available: z.literal(true), market: z.unknown() }).strict(),
  z.object({ available: z.literal(false), reason: z.enum(marketReasons) }).strict()]);
const marketSnapshot = z.object({ ruleVersion: z.literal(marketRules.ruleVersion), policy: z.unknown(), markets: z.object({
  "match-result": available, "double-chance": available, "total-goals": available, "both-teams-to-score": available }).strict(),
  issues: z.array(z.object({ family: text, reason: z.enum(marketReasons), relatedGroups: z.array(z.enum(groups)).max(3).optional(),
    constraints: z.array(z.enum(["btts-under-requires-draw", "draw-over-requires-btts"])).max(2).optional() }).strict()).max(100) }).strict();
const providerCandidate = z.object({ context: z.unknown(), policyVersion: text, policyEvidenceRef: text, markets: z.unknown(), timestamps,
  provenance: z.object({ provider: z.literal("api-football"), endpoint: z.literal("predictions"), externalFixtureId: count.positive(),
    jobId: identity, contractVersion: text, observationHash: identity, sourceUrl: link.nullable(), sourceEvidenceRef: text,
    supportEvidenceRefs: z.object({ "match-result": text.optional(), "total-goals": text.optional(),
      "both-teams-to-score": text.optional() }).strict(), fromCache: z.boolean() }).strict(), flags }).strict();
function bounded(value: unknown) { if (Buffer.byteLength(evidenceSerialize(value), "utf8") > 67_108_864) throw new FallbackInputError(); }
function parse<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  try { bounded(value); return schema.parse(value); } catch { throw new FallbackInputError(); }
}
function checkFlags(value: ForecastTimestamps, supplied: readonly string[]) {
  const expected = [value.generatedAt === null ? "unknown-generation-time" : null,
    value.providerUpdatedAt === null ? "unknown-provider-update-time" : null].filter((entry) => entry !== null);
  if (evidenceFingerprint([...supplied].sort()) !== evidenceFingerprint(expected.sort())) throw new FallbackInputError();
}
/** Structural checks preserve the original immutable candidate for trusted seals. */
export function parseFallbackMarketSnapshot(value: unknown, sourceKind?: MarketSource): MarketSnapshot {
  const snapshot = parse(marketSnapshot, value);
  try {
    if (evidenceFingerprint(snapshot.policy) !== evidenceFingerprint(marketRules)) throw new Error();
    for (const [family, availability] of Object.entries(snapshot.markets)) {
      if (!availability.available) continue;
      const market = availability.market as Parameters<typeof presentMarketProbabilities>[0];
      if (market === null || typeof market !== "object" || market.family !== family || sourceKind !== undefined && market.source !== sourceKind ||
        Object.keys(market).some((key) => !["ruleVersion", "family", "period", "source", "probabilities", "selection", "selectedProbability",
          ...(family === "total-goals" ? ["line"] : []), ...(family === "double-chance" ? ["derivedFrom"] : [])].includes(key))) throw new Error();
      presentMarketProbabilities(market);
    }
    const result = snapshot.markets["match-result"], chance = snapshot.markets["double-chance"];
    if (result.available !== chance.available || result.available && chance.available &&
      (result.market as { source: unknown }).source !== (chance.market as { source: unknown }).source) throw new Error();
    if (result.available && chance.available) {
      const market = result.market as { source: string; period: string; probabilities: unknown };
      const checked = validateMarketGroup("match-result", { source: market.source, period: market.period, probabilities: market.probabilities });
      if (!checked.valid || evidenceFingerprint(checked.markets.find((entry) => entry.family === "double-chance")) !== evidenceFingerprint(chance.market)) throw new Error();
    } else if (!result.available && !chance.available && result.reason !== chance.reason) throw new Error();
    return value as MarketSnapshot;
  } catch { throw new FallbackInputError(); }
}
export function parseFallbackContext(value: unknown): FallbackContext {
  const result = parse(z.object({ context: z.unknown(), jobId: identity, pin: z.unknown().nullable(), evidenceHash: identity }).strict(), value);
  try {
    const context = parseEvidenceContext(result.context), pin = result.pin === null ? null : parseModelPin(result.pin);
    if (pin !== null && pin.jobId !== result.jobId) throw new Error();
    return freezeEvidence({ context, jobId: result.jobId, pin, evidenceHash: result.evidenceHash });
  } catch { throw new FallbackInputError(); }
}
export function parseForecastTimestamps(value: unknown): ForecastTimestamps { return freezeEvidence(parse(timestamps, value)); }
export function parseFallbackAiResult(value: unknown): PredictorResult {
  const denied = z.object({ status: z.literal("denied"), reason: z.enum(fallbackAiReasons), requestsDispatched: z.union([z.literal(0), z.literal(1)]),
    requestCountUnknown: z.boolean(), markets: z.unknown().optional() }).strict();
  const candidate = z.object({ status: z.literal("candidate"), pin: z.unknown(), output: aiOutput,
    requestsDispatched: z.literal(1), requestCountUnknown: z.literal(false) }).strict();
  const result = parse(z.discriminatedUnion("status", [denied, candidate]), value);
  try {
    if (result.status === "denied") { if (result.markets !== undefined) parseFallbackMarketSnapshot(result.markets, "ai"); }
    else { parseModelPin(result.pin); parseEvidenceContext(result.output.context); parseFallbackMarketSnapshot(result.output.markets, "ai");
      checkFlags(result.output.timestamps, result.output.flags); }
    return value as PredictorResult;
  } catch { throw new FallbackInputError(); }
}
export function parseProviderFallbackCandidate(value: unknown): ProviderFallbackCandidate {
  const result = parse(providerCandidate, value);
  try { const context = parseEvidenceContext(result.context); parseFallbackMarketSnapshot(result.markets, "api-football");
    if (result.provenance.externalFixtureId !== context.externalFixtureId) throw new Error(); checkFlags(result.timestamps, result.flags);
    return value as ProviderFallbackCandidate;
  } catch { throw new FallbackInputError(); }
}
export function parseProviderFallbackResult(value: unknown): ProviderFallbackResult {
  const result = parse(z.discriminatedUnion("status", [z.object({ status: z.literal("candidate"), candidate: z.unknown(), requestsDispatched: count,
    requestCountUnknown: z.literal(false) }).strict(),
    z.object({ status: z.literal("denied"), reason: z.enum(fallbackProviderReasons), requestsDispatched: count, requestCountUnknown: z.boolean() }).strict()]), value);
  if (result.status === "candidate") parseProviderFallbackCandidate(result.candidate);
  return value as ProviderFallbackResult;
}

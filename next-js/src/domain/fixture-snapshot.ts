import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "./calendar.ts";
import { isMarketFamily, validateMarketSnapshot, MARKET_RULE_VERSION, type AcceptedMarket } from "./markets.ts";
import { isPlayedFinalStatus, settlementStatuses, type SettlementOutcomeStatus } from "./market-settlement.ts";
import { publicPolicy } from "./public-policy.ts";
import { isSafeRemoteImageUrl } from "./remote-image.ts";
import { teamCodePattern } from "./team-name.ts";
import { publicRecommendationSchema } from "./recommendation-view.ts";

import { parseFixtureVersion } from "./fixture-version.ts";
export { maximumFixtureVersion, parseFixtureVersion, compareFixtureVersions } from "./fixture-version.ts";

const identity = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const text = z.string().max(2000);
const instant = z.number().int().transform((value, context) => {
  try { return utcInstantFromEpochMilliseconds(value); }
  catch { context.addIssue({ code: "custom", message: "Invalid UTC instant." }); return z.NEVER; }
});
const version = z.string().transform((value, context) => {
  try { return parseFixtureVersion(value); }
  catch { context.addIssue({ code: "custom", message: "Invalid fixture version." }); return z.NEVER; }
});
const score = z.strictObject({ home: z.number().int().min(0).max(1000), away: z.number().int().min(0).max(1000) });
const team = z.strictObject({
  id: identity, name: z.string().max(512).nullable(),
  /** Provider team code (2–5 capital letters or digits), already normalized by the server read; null when the team has
   * none or it is not a valid code. Optional, so payloads cached before codes were published still parse. */
  code: z.string().regex(teamCodePattern, "Invalid team code.").nullable().optional(),
  /** Only server-approved, credential-free catalog URLs may populate this field. */
  logoUrl: z.string().refine(isSafeRemoteImageUrl, "Unsafe logo URL.").nullable().optional(),
});
const statuses = settlementStatuses;
const outcomeStatuses = ["correct", "incorrect", "pending", "void", "unavailable"] as const satisfies readonly SettlementOutcomeStatus[];
const displayedOutcome = z.strictObject({
  cycleId: identity, revisionId: identity, selection: z.string(), status: z.enum(outcomeStatuses),
  /** Original public explanation, never a worker log or raw internal reason. */
  explanation: z.string().trim().min(1).max(2000).nullable(),
  correctedAt: instant.nullable().optional(),
}).refine((value) => value.status !== "void" || value.explanation !== null, "Void requires its public reason.");

export const publicVoidReasonSchema = z.strictObject({
  code: z.enum(["formal-postponement", "fixture-canceled", "fixture-abandoned", "fixture-awarded", "locked-cutoff-invalidated", "ineligible-cycle"]),
  explanation: z.string().min(1).max(512),
});
export const fixtureCycleSchema = z.strictObject({
  state: z.enum(["open", "closed", "void"]), mode: z.enum(["current", "locked", "void"]),
  ordinal: z.number().int().positive(), lockedAt: instant.nullable(), voidReason: publicVoidReasonSchema.nullable(),
}).refine((value) => value.mode === ({ open: "current", closed: "locked", void: "void" } as const)[value.state], "Cycle mode must match its state.");
/** The published market families, in policy order. */
export const marketFamilySchema = z.enum(publicPolicy.markets);
export const unavailableMarketSchema = z.strictObject({
  family: marketFamilySchema,
  reason: z.enum(["not-published", "no-locked-selection", "unsupported", "insufficient-data"]),
});
/** Market price for exactly one published pick (prompt 052). Information only, never a betting prompt.
 * An observation field: it changes without a fixture version bump and never fills another family's price. */
export const fixturePriceSchema = z.strictObject({
  family: marketFamilySchema,
  selection: z.string().min(1).max(64),
  /** Decimal price, two places, rounded half-up once when stored. */
  price: z.string().regex(/^[1-9]\d{0,3}\.\d{2}$/u),
  basis: z.enum(["bookmaker", "median"]),
  retrievedAt: instant,
  providerUpdatedAt: instant.nullable(),
});
export type FixturePrice = z.infer<typeof fixturePriceSchema>;
/** In-play phase and provider-reported minute, present only while the fixture is live. */
export const liveClockPhases = ["first-half", "half-time", "second-half", "extra-time", "break", "penalties", "interrupted", "suspended", "in-play"] as const;
export const liveClockSchema = z.strictObject({
  phase: z.enum(liveClockPhases), minute: z.number().int().min(0).max(200).nullable(),
  /** Additional minutes actually played, supplied separately by the provider. */
  stoppageMinutes: z.number().int().min(0).max(1000).nullable().optional(),
});
export const fixtureUpdateSchema = z.strictObject({
  prediction: z.enum(["updating", "delayed", "current", "unavailable", "outside-window", "locked"]),
  result: z.enum(["current", "delayed", "untracked"]),
});

function acceptedMarket(value: unknown): value is AcceptedMarket {
  if (!value || typeof value !== "object" || !("family" in value)) return false;
  const candidate = value as AcceptedMarket;
  if (!isMarketFamily(candidate.family) || !candidate.probabilities || typeof candidate.probabilities !== "object" ||
      Array.isArray(candidate.probabilities)) return false;
  if (candidate.family === "double-chance") {
    // Validated together with its source-owned match-result group below.
    return Object.keys(candidate).sort().join() === "derivedFrom,family,period,probabilities,ruleVersion,selectedProbability,selection,source" &&
      candidate.ruleVersion === MARKET_RULE_VERSION && candidate.derivedFrom === "match-result";
  }
  const expectedKeys = ["family", "period", "probabilities", "ruleVersion", "selectedProbability", "selection", "source",
    ...(candidate.family === "total-goals" ? ["line"] : [])].sort().join();
  return Object.keys(candidate).sort().join() === expectedKeys && candidate.ruleVersion === MARKET_RULE_VERSION;
}

export const publicForecastSchema = z.strictObject({
  runId: identity, revisionId: identity, publishedAt: instant,
  runSequence: z.string().regex(/^[1-9]\d*$/u).max(20).optional(),
  updateDelayed: z.boolean().optional(), provisional: z.boolean().optional(),
  recommendation: publicRecommendationSchema.optional(),
  markets: z.array(z.strictObject({
    market: z.custom<AcceptedMarket>(acceptedMarket).transform((market) =>
      ({ ...market, probabilities: { ...market.probabilities } }) as AcceptedMarket),
    reasons: z.array(text).max(4), uncertainty: text.nullable(),
    limitedNews: z.boolean().optional(), outcome: displayedOutcome.optional(),
  })).max(4),
}).superRefine((value, context) => {
  for (const item of value.markets) {
    if (item.outcome && (item.outcome.revisionId !== value.revisionId || item.outcome.selection !== item.market.selection)) {
      context.addIssue({ code: "custom", message: "Outcome must refer to this revision's selected market pick." });
    }
  }
  const inputs: Record<string, unknown> = {};
  const supplied = new Map(value.markets.map((item) => [item.market.family, item.market]));
  const recommendation = value.recommendation?.selected;
  if (recommendation) {
    const item = supplied.get(recommendation.family);
    if (!item || item.source !== recommendation.source ||
      (item.probabilities as Readonly<Record<string, number>>)[recommendation.selection] !== recommendation.probability)
      context.addIssue({ code: "custom", message: "Recommendation must belong to its complete published forecast group." });
  }
  if (supplied.size !== value.markets.length) { context.addIssue({ code: "custom", message: "Duplicate market." }); return; }
  for (const { market } of value.markets) if (market.family !== "double-chance") {
    inputs[market.family] = { source: market.source, period: market.period, probabilities: market.probabilities,
      ...(market.family === "total-goals" ? { line: market.line } : {}) };
  }
  const validated = validateMarketSnapshot(inputs);
  for (const [family, availability] of Object.entries(validated.markets)) {
    const actual = supplied.get(family as AcceptedMarket["family"]);
    if (!availability.available) {
      if (actual) context.addIssue({ code: "custom", message: "Invalid market group." });
      continue;
    }
    const expected = availability.market;
    if (!actual || actual.selection !== expected.selection || actual.selectedProbability !== expected.selectedProbability ||
        actual.source !== expected.source || actual.period !== expected.period ||
        Object.keys(actual.probabilities).length !== Object.keys(expected.probabilities).length ||
        Object.entries(expected.probabilities).some(([key, probability]) =>
          (actual.probabilities as Record<string, number>)[key] !== probability)) {
      context.addIssue({ code: "custom", message: "Market must preserve the validated complete source group." });
    }
  }
});

/** Visitor-facing projection only. Every field is replaced together at a new version. */
const fixtureSnapshotBaseSchema = z.strictObject({
  fixtureId: identity,
  dataVersion: version,
  homeTeam: team, awayTeam: team,
  competition: z.strictObject({ id: identity, name: z.string().max(512).nullable(), country: z.string().max(256).nullable(),
    logoUrl: z.string().refine(isSafeRemoteImageUrl, "Unsafe logo URL.").nullable().optional(),
    /** Flag of the competition's country, under the same server approval as logos; null when none is stored (international
     * competitions, or before the next date sync observes one). Optional, so payloads cached before flags still parse.
     * Decoration only: a flag change alone does not bump `dataVersion`. */
    countryFlagUrl: z.string().refine(isSafeRemoteImageUrl, "Unsafe flag URL.").nullable().optional() }),
  kickoffAt: instant.nullable(), syncedAt: instant.nullable(),
  status: z.enum(statuses), score: score.nullable(),
  partialCoverage: z.boolean().optional(),
  cycleId: identity.nullable(), forecast: publicForecastSchema.nullable(),
  cycle: fixtureCycleSchema.nullable().optional(),
  unavailableMarkets: z.array(unavailableMarketSchema).max(4).optional(),
  update: fixtureUpdateSchema.optional(),
  availabilityMessage: z.string().max(256).nullable().optional(),
  scorePeriod: z.enum(["regulation", "live"]).nullable().optional(),
  liveClock: liveClockSchema.nullable().optional(),
  prices: z.array(fixturePriceSchema).max(4).optional(),
});
export const publishedFamiliesSchema = z.array(marketFamilySchema).max(4).refine((families) => families.join() === publicPolicy.markets.filter((family) => families.includes(family)).join(), "Families must be unique and in policy order.");
/** Public chance only: neither a selection nor the complete group from which it could be reconstructed. */
export const publicChanceSchema = z.array(z.strictObject({ family: marketFamilySchema, probability: z.number().gt(0).lt(1) })).max(4);
export const gatedForecastSchema = z.strictObject({ gated: z.literal(true), runId: identity, revisionId: identity, publishedAt: instant,
  runSequence: publicForecastSchema.shape.runSequence, provisional: publicForecastSchema.shape.provisional,
  updateDelayed: publicForecastSchema.shape.updateDelayed, families: publishedFamiliesSchema, probabilities: publicChanceSchema,
});
const wireFixtureBaseSchema = fixtureSnapshotBaseSchema.extend({ forecast: z.union([publicForecastSchema, gatedForecastSchema]).nullable() });
function refineFixture(value: z.infer<typeof wireFixtureBaseSchema>, context: z.RefinementCtx) {
  const forecast = value.forecast && !("gated" in value.forecast) ? value.forecast : null;
  if (value.prices) {
    const picks = new Map(forecast?.markets.map((item) => [item.market.family, item.market.selection]) ?? []);
    if (forecast?.recommendation?.selected) picks.set(forecast.recommendation.selected.family,
      forecast.recommendation.selected.selection as AcceptedMarket["selection"]);
    if (new Set(value.prices.map((item) => item.family)).size !== value.prices.length ||
      value.prices.some((item) => picks.get(item.family) !== item.selection)) {
      context.addIssue({ code: "custom", message: "A price must belong to exactly one published pick of its own family." });
    }
  }
  if (value.liveClock && value.status !== "live") context.addIssue({ code: "custom", message: "A live clock requires a live fixture." });
  if (value.forecast !== null && value.cycleId === null) context.addIssue({ code: "custom", message: "A revision must belong to a cycle." });
  if (forecast?.markets.some((item) => item.outcome && item.outcome.cycleId !== value.cycleId)) {
    context.addIssue({ code: "custom", message: "Outcome must refer to this fixture cycle." });
  }
  if (!isPlayedFinalStatus(value.status) && forecast?.markets.some((item) =>
    item.outcome?.status === "correct" || item.outcome?.status === "incorrect")) {
    context.addIssue({ code: "custom", message: "Correctness requires a played final fixture." });
  }
  if (value.cycle && (value.cycleId === null || (value.cycle.state === "void") !== (value.cycle.voidReason !== null))) {
    context.addIssue({ code: "custom", message: "Cycle metadata must preserve identity and void reason." });
  }
  if (value.unavailableMarkets) {
    const unavailable = value.unavailableMarkets.map((item) => item.family);
    const available = value.forecast && "gated" in value.forecast ? value.forecast.families : forecast?.markets.map((item) => item.market.family) ?? [];
    if (new Set([...unavailable, ...available]).size !== 4 || unavailable.length + available.length !== 4) {
      context.addIssue({ code: "custom", message: "Exactly four available or unavailable market families are required." });
    }
  }
}
export const storedFixtureSnapshotSchema = fixtureSnapshotBaseSchema.superRefine(refineFixture);
export const fixtureSnapshotSchema = wireFixtureBaseSchema.superRefine(refineFixture);
export type StoredFixtureSnapshot = z.infer<typeof storedFixtureSnapshotSchema>;
export type FixtureSnapshot = z.infer<typeof fixtureSnapshotSchema>;

export function parseFixtureSnapshot(value: unknown): FixtureSnapshot {
  return fixtureSnapshotSchema.parse(value);
}

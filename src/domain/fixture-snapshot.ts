import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "./calendar.ts";
import { isMarketFamily, validateMarketSnapshot, MARKET_RULE_VERSION, type AcceptedMarket } from "./markets.ts";
import type { SettlementStatus } from "./market-settlement.ts";

/** MySQL UNSIGNED BIGINT travels as canonical decimal text, never a JS number. */
export const maximumFixtureVersion = "18446744073709551615";
export function parseFixtureVersion(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > BigInt(maximumFixtureVersion)) {
    throw new RangeError("Fixture version must be a positive unsigned 64-bit decimal string.");
  }
  return value;
}
export function compareFixtureVersions(left: string, right: string): -1 | 0 | 1 {
  const a = BigInt(parseFixtureVersion(left));
  const b = BigInt(parseFixtureVersion(right));
  return a < b ? -1 : a > b ? 1 : 0;
}

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
const team = z.strictObject({ id: identity, name: z.string().max(512).nullable() });
const statuses = ["scheduled", "live", "finished-regulation", "finished-extra-time", "finished-penalties", "postponed", "canceled", "abandoned", "awarded", "unknown"] as const satisfies readonly SettlementStatus[];

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

const forecast = z.strictObject({
  runId: identity, revisionId: identity, publishedAt: instant,
  markets: z.array(z.strictObject({
    market: z.custom<AcceptedMarket>(acceptedMarket).transform((market) =>
      ({ ...market, probabilities: { ...market.probabilities } }) as AcceptedMarket),
    reasons: z.array(text).max(4), uncertainty: text.nullable(),
  })).max(4),
}).superRefine((value, context) => {
  const inputs: Record<string, unknown> = {};
  const supplied = new Map(value.markets.map((item) => [item.market.family, item.market]));
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
export const fixtureSnapshotSchema = z.strictObject({
  fixtureId: identity,
  dataVersion: version,
  homeTeam: team, awayTeam: team,
  competition: z.strictObject({ id: identity, name: z.string().max(512).nullable(), country: z.string().max(256).nullable() }),
  kickoffAt: instant.nullable(), syncedAt: instant.nullable(),
  status: z.enum(statuses), score: score.nullable(),
  cycleId: identity.nullable(), forecast: forecast.nullable(),
}).refine((value) => value.forecast === null || value.cycleId !== null, "A revision must belong to a cycle.");
export type FixtureSnapshot = z.infer<typeof fixtureSnapshotSchema>;

export function parseFixtureSnapshot(value: unknown): FixtureSnapshot {
  return fixtureSnapshotSchema.parse(value);
}

import type { MarketFamily, MarketSource } from "./markets.ts";
import type { SettlementOutcomeStatus } from "./market-settlement.ts";
import { z } from "zod";
import { parseReportingDate } from "./calendar.ts";
import { performanceRules } from "./performance.ts";

/** The private AI against API-Football comparison the owner page renders; built on the server from sealed receipts. */
export type ForecastSourceMetrics = Readonly<{
  count: number; correct: number; incorrect: number; hitRate: number | null; brier: number | null; logLoss: number | null; calibrationError: number | null;
}>;
type Interval = Readonly<{ lower: number; upper: number }>;
export type ForecastSourceScores = Readonly<{
  count: number; ai: ForecastSourceMetrics; "api-football": ForecastSourceMetrics;
  /** AI minus API-Football on the same matched settled predictions; negative means AI scored better. */
  brierDifference: number | null; logLossDifference: number | null;
  hitRateIntervals: Readonly<{ ai: Interval | null; "api-football": Interval | null }>;
}>;
export type ForecastSourceCoverage = Readonly<{
  locked: number; void: number; notCaptured: number; captured: number; aiAvailable: number; providerAvailable: number;
  both: number; aiOnly: number; providerOnly: number; neither: number; pending: number; settled: number;
}>;
export type ForecastSourceFamily = Readonly<{
  family: MarketFamily; horizonId: string | null; derivedFrom: "match-result" | null;
  state: "available" | "unavailable"; reason: string | null; coverage: ForecastSourceCoverage;
  matched: ForecastSourceScores & Readonly<{ fixtureKeysHash: string }>;
  disagreements: ForecastSourceScores & Readonly<{ aiCorrect: number; providerCorrect: number }>;
  segments: Readonly<{ conflictingEvidence: ForecastSourceScores; limitedNews: ForecastSourceScores }>;
  gates: readonly Readonly<{ id: string; purpose: "candidate" | "public-claim"; diagnostic: "passed" | "failed" | "pending";
    reasons: readonly string[]; failures: readonly string[] }>[];
}>;
type PairSide = Readonly<{ selection: string; probability: number; outcome: SettlementOutcomeStatus }>;
export type ForecastSourcePair = Readonly<{
  fixtureId: string; matchLabel: string; href: string; kickoffAt: number; sourceOrder: "provider-first" | "ai-first";
  published: MarketSource | null; ai: PairSide; "api-football": PairSide;
}>;
export type ForecastSourcesReport = Readonly<{
  asOf: number; from: string; to: string; market: MarketFamily | "all"; fixtureCount: number; confidenceZ: number;
  orders: Readonly<{ "provider-first": number; "ai-first": number; none: number }>;
  comparisons: readonly ForecastSourceFamily[]; recent: readonly ForecastSourcePair[];
  diagnostic?: Readonly<{ kind: "synthetic-comparison-replay"; label: string; replayedFixtures: number }>;
}>;

const count = z.number().int().nonnegative().max(performanceRules.maximumCohortFixtures);
const date = z.string().refine((value) => { try { parseReportingDate(value); return true; } catch { return false; } });
const family = z.enum(["match-result", "double-chance", "total-goals", "both-teams-to-score"]);
const source = z.enum(["ai", "api-football"]);
const probability = z.number().min(0).max(1);
const interval = z.object({ lower: probability, upper: probability }).refine(value => value.lower <= value.upper).nullable();
const metrics = z.object({ count, correct: count, incorrect: count, hitRate: probability.nullable(),
  brier: z.number().min(0).max(2).nullable(), logLoss: z.number().nonnegative().nullable(), calibrationError: probability.nullable() })
  .refine(value => value.correct + value.incorrect === value.count);
const scores = z.object({ count, ai: metrics, "api-football": metrics,
  brierDifference: z.number().min(-2).max(2).nullable(), logLossDifference: z.number().nullable(),
  hitRateIntervals: z.object({ ai: interval, "api-football": interval }) })
  .refine(value => value.count === value.ai.count && value.count === value["api-football"].count);
const coverage = z.object({ locked: count, void: count, notCaptured: count, captured: count, aiAvailable: count, providerAvailable: count,
  both: count, aiOnly: count, providerOnly: count, neither: count, pending: count, settled: count }).refine(value =>
  value.locked === value.notCaptured + value.captured && value.captured === value.both + value.aiOnly + value.providerOnly + value.neither
  && value.both === value.pending + value.settled && value.aiAvailable === value.both + value.aiOnly
  && value.providerAvailable === value.both + value.providerOnly);
const side = z.object({ selection: z.string().min(1).max(128), probability,
  outcome: z.enum(["correct", "incorrect", "pending", "void", "unavailable"]) });

/** Disposable owner-cache values are revalidated before they reach the protected page. */
export const forecastSourcesReportSchema = z.object({ asOf: z.number().int(), from: date, to: date,
  market: z.enum(["all", "match-result", "double-chance", "total-goals", "both-teams-to-score"]), fixtureCount: count,
  confidenceZ: z.number().positive().max(10), orders: z.object({ "provider-first": count, "ai-first": count, none: count }),
  comparisons: z.array(z.object({ family, horizonId: z.string().max(128).nullable(), derivedFrom: z.literal("match-result").nullable(),
    state: z.enum(["available", "unavailable"]), reason: z.string().max(256).nullable(), coverage,
    matched: scores.safeExtend({ fixtureKeysHash: z.string().regex(/^[a-f0-9]{64}$/u) }),
    disagreements: scores.safeExtend({ aiCorrect: count, providerCorrect: count }),
    segments: z.object({ conflictingEvidence: scores, limitedNews: scores }),
    gates: z.array(z.object({ id: z.string().max(128), purpose: z.enum(["candidate", "public-claim"]),
      diagnostic: z.enum(["passed", "failed", "pending"]), reasons: z.array(z.string().max(256)).max(64), failures: z.array(z.string().max(256)).max(64) })).max(1000),
  }).refine(value => value.matched.count === value.coverage.settled && value.disagreements.count <= value.matched.count
    && value.disagreements.aiCorrect <= value.disagreements.count && value.disagreements.providerCorrect <= value.disagreements.count
    && value.segments.conflictingEvidence.count <= value.matched.count && value.segments.limitedNews.count <= value.matched.count)).max(128),
  recent: z.array(z.object({ fixtureId: z.string().min(1).max(128), matchLabel: z.string().max(1024),
    href: z.string().max(4096).startsWith("/").refine(value => !value.startsWith("//") && !/[\\\r\n\0]/u.test(value)),
    kickoffAt: z.number().int(), sourceOrder: z.enum(["provider-first", "ai-first"]), published: source.nullable(), ai: side, "api-football": side })).max(20),
  diagnostic: z.object({ kind: z.literal("synthetic-comparison-replay"), label: z.string().min(1).max(1024), replayedFixtures: count }).optional(),
}).refine(value => value.orders["provider-first"] + value.orders["ai-first"] + value.orders.none <= value.fixtureCount
  && new Set(value.recent.map(pair => pair.fixtureId)).size === value.recent.length);

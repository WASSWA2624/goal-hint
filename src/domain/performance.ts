import { z } from "zod";
import { parseReportingDate } from "./calendar.ts";
import { publicForecastSchema } from "./fixture-snapshot.ts";
import { marketSelections } from "./markets.ts";

export const performanceRules = Object.freeze({ maximumDays: 31, defaultDays: 30, maximumFixtures: 1000,
  maximumStoredBytes: 16_777_216, maximumEvidenceLinks: 20 });
export const performanceFamilies = Object.keys(marketSelections) as (keyof typeof marketSelections)[];
export const performanceSourceSchema = z.enum(["combined", "ai", "api-football"]);
const family = z.enum(["match-result", "double-chance", "total-goals", "both-teams-to-score"]);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = publicForecastSchema.shape.publishedAt;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const label = z.string().min(1).max(256);
const date = z.string().refine((v) => { try { parseReportingDate(v); return true; } catch { return false; } });
const probability = z.number().min(0).max(1);
export const performanceCoverageSchema = z.strictObject({ total: count, available: count, unavailable: count, void: count,
  filteredOut: count, pending: count, settled: count, sources: z.strictObject({ ai: count, "api-football": count }) }).refine((v) =>
  v.total === v.available + v.unavailable + v.void + v.filteredOut && v.available === v.pending + v.settled &&
  v.available === v.sources.ai + v.sources["api-football"]);
const metrics = z.strictObject({ state: z.enum(["available", "unavailable", "insufficient-sample", "quality-gate-failed"]),
  reasons: z.array(label).max(64), minimumSamples: count.min(1).nullable(), denominator: count, correct: count, incorrect: count,
  hitRate: probability.nullable(), brier: z.number().min(0).max(2).nullable(), logLoss: z.number().nonnegative().nullable(),
  calibrationError: probability.nullable(), confidenceZ: z.number().positive().max(10).nullable(),
  calibration: z.array(z.strictObject({ selection: label, lower: probability, upper: probability, count,
    meanProbability: probability.nullable(), observedFrequency: probability.nullable(),
    interval: z.strictObject({ lower: probability, upper: probability }).nullable() })).max(300),
}).refine((v) => v.denominator === v.correct + v.incorrect && (v.state === "available"
  ? v.denominator > 0 && v.hitRate !== null && v.brier !== null && v.logLoss !== null && v.calibrationError !== null && v.confidenceZ !== null
  : v.hitRate === null && v.brier === null && v.logLoss === null && v.calibrationError === null && v.confidenceZ === null && v.calibration.length === 0));
const version = z.strictObject({ source: z.enum(["ai", "api-football"]), modelVersionId: hash.nullable(),
  provider: label, model: label.nullable(), version: label, calibrationVersion: label.nullable() });
export const performanceCellSchema = z.strictObject({ family, source: performanceSourceSchema, label,
  horizon: z.strictObject({ id: label, minimumMs: count, maximumMs: count }).nullable(),
  coverage: performanceCoverageSchema, metrics, versions: z.array(version).max(performanceRules.maximumFixtures),
  evidence: z.strictObject({ total: count, truncated: z.boolean(), links: z.array(z.strictObject({ fixtureId: z.uuid(), cycleId: z.uuid(),
    revisionId: z.uuid(), source: z.enum(["ai", "api-football"]), evidenceCutoffAt: instant, forecastAt: instant, forecastHorizonMs: count,
    href: z.string().max(160).regex(/^\/api\/matches\/[a-f0-9-]{36}\?revision=[a-f0-9-]{36}$/u),
    matchLabel: z.string().min(1).max(1050),
    pageHref: z.string().max(512).regex(/^\/en\/matches\/[a-f0-9-]{36}\/[a-z0-9]+(?:-[a-z0-9]+)*\?revision=[a-f0-9-]{36}#revision-history$/u),
  })).max(performanceRules.maximumEvidenceLinks) }),
}).refine((v) => v.coverage.settled === v.metrics.denominator && v.evidence.total === v.coverage.available &&
  v.evidence.links.length === Math.min(v.evidence.total, performanceRules.maximumEvidenceLinks) &&
  v.evidence.truncated === (v.evidence.total > v.evidence.links.length));
export const performanceResponseSchema = z.strictObject({ asOf: instant,
  filters: z.strictObject({ market: z.union([z.literal("all"), family]), source: performanceSourceSchema, model: hash.nullable(), version: label.nullable() }),
  cohort: z.strictObject({ from: date, to: date, startInclusive: instant, endExclusive: instant, timezone: z.literal("Africa/Kampala"),
    basis: z.literal("current-fixture-kickoff-applicable-cycle-locked-selection"), fixtureCount: count.max(performanceRules.maximumFixtures),
    filterAccounting: z.literal("nonmatching-available-forecasts-are-filtered-out;unattributed-unavailable-and-void-remain"),
    horizonBasis: z.literal("scheduled-kickoff-minus-locked-publication;horizon-cells-only-known-locks") }),
  policy: z.strictObject({ id: hash.nullable(), state: z.enum(["unapproved", "verified"]), publicClaimAuthorized: z.literal(false), provisional: z.literal(true) }),
  cells: z.array(performanceCellSchema).max(396),
  comparisons: z.array(z.strictObject({ family, candidate: z.literal("ai"), reference: z.literal("api-football"),
    state: z.literal("unavailable"), reason: z.literal("no-matched-locked-forecasts"), count: z.literal(0), brierDifference: z.null(),
    matchBasis: z.literal("same-fixture-family-evidence-cutoff-and-horizon") })).max(4),
  historicalCycles: z.strictObject({ basis: z.literal("void-cycle-original-kickoff-in-period-excluding-applicable-cycle"), void: count, postponed: count }),
  operations: z.strictObject({ basis: z.literal("refresh-jobs-for-current-cohort-fixtures-across-runs"), total: count, failed: count, pending: count,
    failedFixtures: count, delayedRefreshes: count, delayedFixtures: count }),
  freshness: z.strictObject({ snapshotKey: hash, lastSettledAt: instant.nullable(), lastCorrectedAt: instant.nullable(),
    invalidatedBy: z.tuple([z.literal("fixture-or-cycle-change"), z.literal("locked-revision-change"), z.literal("result-or-settlement-correction"),
      z.literal("refresh-job-or-receipt-change"), z.literal("evaluation-policy-change")]) }),
});
export type PerformanceResponse = z.infer<typeof performanceResponseSchema>;
export type PerformanceCell = z.infer<typeof performanceCellSchema>;
export type PerformanceCoverage = z.infer<typeof performanceCoverageSchema>;
export type PerformanceSource = z.infer<typeof performanceSourceSchema>;

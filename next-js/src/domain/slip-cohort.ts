import { z } from "zod";
import { parseReportingDate } from "./calendar.ts";
import { storedMatchFeedRecordSchema } from "./match-feed.ts";
import { refineSlipPricePools, slipSelectionPricesSchema } from "./slip-price-page.ts";
import { matchesSlipForecast, type SlipTotal15Forecast } from "./slip-markets.ts";
import { slipForecastReferenceSchema } from "./slip-forecast-reference.ts";

export const slipCohortRules = Object.freeze({ maximumRecords: 500, hydrationBatchSize: 10 });
const date = z.string().refine((value) => { try { parseReportingDate(value); return true; } catch { return false; } });
const instant = z.number().int();
const probability = z.number().finite().min(0).max(1);
export const slipTotal15ForecastSchema = z.strictObject({
  reference: slipForecastReferenceSchema,
  source: z.enum(["ai-score-distribution", "local-poisson"]),
  probabilities: z.strictObject({ "over-1.5": probability, "under-1.5": probability }),
}).refine(({ probabilities }) => Math.abs(probabilities["over-1.5"] + probabilities["under-1.5"] - 1) <= 1e-9) satisfies z.ZodType<SlipTotal15Forecast>;

/** A bounded decision cohort, not a paginated public-feed response or an estimated total. */
export const slipCohortSchema = z.strictObject({
  records: z.array(storedMatchFeedRecordSchema).max(slipCohortRules.maximumRecords),
  selectionPrices: slipSelectionPricesSchema,
  total15Forecasts: z.record(z.uuid(), slipTotal15ForecastSchema).optional(),
  asOf: instant, today: date,
  range: z.strictObject({ from: date, to: date, startInclusive: instant, endExclusive: instant }),
  searchLimited: z.boolean(), partialCoverage: z.boolean(),
}).superRefine((value, context) => {
  if (new Set(value.records.map((record) => record.fixtureId)).size !== value.records.length
    || value.searchLimited && value.records.length !== slipCohortRules.maximumRecords) {
    context.addIssue({ code: "custom", message: "Incoherent bounded slip cohort." });
  }
  const byFixture = new Map(value.records.map((record) => [record.fixtureId, record]));
  for (const [fixtureId, total15] of Object.entries(value.total15Forecasts ?? {})) {
    const record = byFixture.get(fixtureId);
    if (!record?.forecast || !record.cycleId || !matchesSlipForecast(total15.reference, {
      cycleId: record.cycleId, revisionId: record.forecast.revisionId, publishedAt: record.forecast.publishedAt,
    })) context.addIssue({ code: "custom", path: ["total15Forecasts", fixtureId], message: "Total goals forecast must match this publication." });
  }
  refineSlipPricePools(value.records, value.selectionPrices, value.asOf, context, value.total15Forecasts);
});

export type SlipCohort = z.infer<typeof slipCohortSchema>;

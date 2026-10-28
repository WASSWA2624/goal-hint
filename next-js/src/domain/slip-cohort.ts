import { z } from "zod";
import { parseReportingDate } from "./calendar.ts";
import { storedMatchFeedRecordSchema } from "./match-feed.ts";
import { refineSlipPricePools, slipSelectionPricesSchema } from "./slip-price-page.ts";

export const slipCohortRules = Object.freeze({ maximumRecords: 500, hydrationBatchSize: 10 });
const date = z.string().refine((value) => { try { parseReportingDate(value); return true; } catch { return false; } });
const instant = z.number().int();

/** A bounded decision cohort, not a paginated public-feed response or an estimated total. */
export const slipCohortSchema = z.strictObject({
  records: z.array(storedMatchFeedRecordSchema).max(slipCohortRules.maximumRecords),
  selectionPrices: slipSelectionPricesSchema,
  asOf: instant, today: date,
  range: z.strictObject({ from: date, to: date, startInclusive: instant, endExclusive: instant }),
  searchLimited: z.boolean(), partialCoverage: z.boolean(),
}).superRefine((value, context) => {
  if (new Set(value.records.map((record) => record.fixtureId)).size !== value.records.length
    || value.searchLimited && value.records.length !== slipCohortRules.maximumRecords) {
    context.addIssue({ code: "custom", message: "Incoherent bounded slip cohort." });
  }
  refineSlipPricePools(value.records, value.selectionPrices, value.asOf, context);
});

export type SlipCohort = z.infer<typeof slipCohortSchema>;

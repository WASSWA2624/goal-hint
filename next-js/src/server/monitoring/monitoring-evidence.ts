import "server-only";

import { z } from "zod";
import { jobInstant } from "../jobs/job-input.ts";
import { costSummaryRecord } from "../cost-control/cost-observability.ts";
import { costUsdDecimal, costUsdPicosFromDecimal } from "../cost-control/cost-input.ts";
import type { CostSummary } from "../cost-control/cost-service.ts";
import { monitoringCostSchema, monitoringFail, monitoringRef, parseMonitoring } from "./monitoring-contract.ts";

/** Canonical AI/research liability is not an invoice or an infrastructure budget. */
export function monitoringCostFromSummary(summary: CostSummary, period: Readonly<{ startsAt: number; endsAt: number; measuredAt: number; evidenceRef: string }>) {
  const safe = costSummaryRecord(summary);
  return parseMonitoring(monitoringCostSchema, { ...period, category: safe.category, capUsd: safe.cap,
    committedUsd: costUsdDecimal(summary.openingChargedUsdPicos + summary.liabilityUsdPicos),
    invoicedUsd: costUsdDecimal(summary.openingChargedUsdPicos + summary.invoicedUsdPicos), coverage: "estimated" });
}

/** For approved billing exports: exact integer units and decimal USD rates; round liability upward. */
export function monitoringCostFromUsage(input: unknown) {
  const value = parseMonitoring(z.strictObject({ ...monitoringCostSchema.shape,
    committedUsd: z.undefined().optional(), invoicedUsd: z.undefined().optional(),
    usage: z.array(z.strictObject({ units: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      perUnits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), rateUsd: monitoringCostSchema.shape.capUsd })).max(32),
    fixedChargesUsd: monitoringCostSchema.shape.capUsd, invoiceUsd: monitoringCostSchema.shape.capUsd.nullable(),
  }), input);
  const charged = value.usage.reduce((total, line) => {
    const numerator = BigInt(line.units) * costUsdPicosFromDecimal(line.rateUsd), denominator = BigInt(line.perUnits);
    return total + (numerator + denominator - 1n) / denominator;
  }, costUsdPicosFromDecimal(value.fixedChargesUsd));
  return parseMonitoring(monitoringCostSchema, { category: value.category, startsAt: value.startsAt, endsAt: value.endsAt,
    measuredAt: value.measuredAt, capUsd: value.capUsd, committedUsd: costUsdDecimal(charged), invoicedUsd: value.invoiceUsd,
    coverage: value.coverage, evidenceRef: value.evidenceRef });
}

export const discoveryMeasurementStatus = Object.freeze({ searchImpressions: "pending-authorized-search-source",
  indexedPages: "pending-authorized-search-source", clickThroughRate: "pending-authorized-search-source",
  returningVisits: "disabled-pending-analytics-decision", matchDetailUse: "disabled-pending-analytics-decision",
  fieldWebVitals: "pending-approved-field-source-and-traffic" });
const vitalsSchema = z.strictObject({ evidenceRef: monitoringRef, source: z.enum(["laboratory", "field"]),
  environment: z.enum(["local", "staging", "production"]), device: z.literal("mobile"),
  measuredAt: jobInstant, metric: z.enum(["LCP", "INP", "CLS"]),
  values: z.array(z.number().finite().nonnegative()).min(1).max(10_000),
});
/** Private aggregate import only. No beacon, URL, IP, cookie, navigation or visitor identity. */
export function summarizeMobileVitals(input: unknown, verifyEvidence: (value: Readonly<z.infer<typeof vitalsSchema>>) => boolean) {
  const value = parseMonitoring(vitalsSchema, input);
  let verified = false;
  try { verified = verifyEvidence(value) === true; } catch { /* Private source failures are withheld. */ }
  if (!verified) monitoringFail("unauthorized");
  const samples = [...value.values].sort((a, b) => a - b), p75 = samples[Math.ceil(samples.length * 0.75) - 1]!;
  const target = { LCP: 2500, INP: 200, CLS: 0.1 }[value.metric];
  return Object.freeze({ source: value.source, environment: value.environment, device: value.device, metric: value.metric,
    measuredAt: value.measuredAt, samples: samples.length, p75, target, unit: value.metric === "CLS" ? "score" : "ms",
    withinTarget: p75 <= target, evidenceRef: value.evidenceRef,
    productionFieldEvidence: value.source === "field" && value.environment === "production" });
}

import "server-only";

import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { marketRules } from "../../domain/markets.ts";
import { performanceFamilies } from "../../domain/performance.ts";
import { EVALUATION_VERSION, type EvaluationProtocol } from "../evaluation/evaluation-contract.ts";
import { createEvaluationProtocol } from "../evaluation/evaluation-input.ts";
import type { PerformancePolicyBinding } from "../performance/performance-service.ts";
import type { PerformanceQuoteBinding } from "../performance/performance-quotes.ts";
import { demoFootballCatalog } from "./api-football.ts";
import { demoId, demoModel } from "./forecast.ts";
import { assertDemoDatabase } from "./member.ts";
import { demoPublicationQuoteRules } from "./publication-quotes.ts";

const dayMs = 86_400_000;
const protocol = createEvaluationProtocol({
  version: EVALUATION_VERSION, name: "synthetic-development-performance-v1", ruleVersion: marketRules.ruleVersion,
  frozenAt: Date.parse("2025-04-01T00:00:00Z"), approvalRef: "synthetic-development-only-not-production-qualification",
  selectionVersion: "development-demo-v1",
  windows: {
    training: { startsAt: Date.parse("2025-01-01T00:00:00Z"), endsAt: Date.parse("2025-02-01T00:00:00Z") },
    validation: { startsAt: Date.parse("2025-02-01T00:00:00Z"), endsAt: Date.parse("2025-03-01T00:00:00Z") },
    calibration: { startsAt: Date.parse("2025-03-01T00:00:00Z"), endsAt: Date.parse("2025-04-01T00:00:00Z") },
    finalTest: { startsAt: Date.parse("2025-04-01T00:00:00Z"), endsAt: Date.parse("2036-01-01T00:00:00Z") },
  },
  competitionIds: demoFootballCatalog.leagues.map((league) => demoId("competition", league.id)),
  horizons: [{ id: "synthetic-known-lock", minimumMs: 0, maximumMs: 366 * dayMs }],
  candidateModel: demoModel, previousApprovedModel: null, providerContractVersion: null,
  calibrationBands: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1], confidenceZ: 1.96,
  baselines: { version: "synthetic-development-baselines-v1", lookbackMs: 120 * dayMs, minimumMatches: 2,
    leagueFrequency: { alpha: 1 },
    teamStrength: { initialRating: 1500, kFactor: 20, scale: 400, homeAdvantage: 40, drawWeight: .5 } },
  // Permissive diagnostic bounds show calculated synthetic values. They are not a model qualification.
  gates: performanceFamilies.flatMap((family) => (["combined", "ai"] as const).map((system) => ({
    id: `synthetic-development-${system}-${family}`, purpose: "public-claim", system, family,
    horizonId: "synthetic-known-lock", minimumSamples: 2, minimumCoverage: 0,
    maximumBrier: 2, maximumLogLoss: 1000, maximumCalibrationError: 1, baseline: null, maximumBrierDifference: null,
  }))),
});

/** Reuses the production diagnostics and approval checks only for the isolated synthetic database.
 * Public claim authorization remains false; original quotes require immutable simulated sidecars. */
export function demoPerformancePolicy(): PerformancePolicyBinding | null {
  try { assertDemoDatabase(); } catch { return null; }
  return Object.freeze({ protocol, verifyProtocol(candidate: EvaluationProtocol) {
    if (!isDevelopmentDemo() || candidate.id !== protocol.id || candidate.hash !== protocol.hash) return false;
    try { assertDemoDatabase(); return true; } catch { return false; }
  } });
}

/** Grants only the exact synthetic bookmaker and age policy used by the original-publication writer. */
export function demoPerformanceQuotes(): PerformanceQuoteBinding | null {
  try { assertDemoDatabase(); } catch { return null; }
  return Object.freeze({ bookmakerId: demoPublicationQuoteRules.bookmakerId, maximumAgeMs: demoPublicationQuoteRules.maximumAgeMs,
    verifyPublicDisplay() {
      if (!isDevelopmentDemo()) return false;
      try { assertDemoDatabase(); return true; } catch { return false; }
    } });
}

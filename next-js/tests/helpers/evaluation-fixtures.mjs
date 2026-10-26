import { marketRules, validateMarketSnapshot } from "../../src/domain/markets.ts";
import { createEvaluationDataset, createEvaluationProtocol } from "../../src/server/evaluation/evaluation-input.ts";
import { EVALUATION_VERSION } from "../../src/server/evaluation/evaluation-contract.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../../src/server/football/api-football-contract.ts";
import { evidenceContext, evidenceHash } from "./evidence-fixtures.mjs";
import { modelVersion } from "./predictor-fixtures.mjs";

// Every forecast, provenance receipt, approval, result and threshold is synthetic.
// These fixtures cannot select a real model, prove accuracy or authorize a public claim.
export const EVALUATION_COMPETITION_ID = "20000000-0000-4000-8000-000000000001";
export const EVALUATION_FIXTURE_ID = "20000000-0000-4000-8000-000000000002";
export const EVALUATION_CYCLE_ID = "20000000-0000-4000-8000-000000000003";
export const EVALUATION_RUN_ID = "20000000-0000-4000-8000-000000000004";
export const evaluationHash = evidenceHash;
export const EVALUATION_FORECAST_AT = Date.parse("2025-04-09T12:00:00.000Z");
export function evaluationProtocolConfiguration(overrides = {}) {
  const windows = { training: { startsAt: Date.parse("2025-01-01T00:00:00Z"), endsAt: Date.parse("2025-02-01T00:00:00Z") },
    validation: { startsAt: Date.parse("2025-02-01T00:00:00Z"), endsAt: Date.parse("2025-03-01T00:00:00Z") },
    calibration: { startsAt: Date.parse("2025-03-01T00:00:00Z"), endsAt: Date.parse("2025-04-01T00:00:00Z") },
    finalTest: { startsAt: Date.parse("2025-04-01T00:00:00Z"), endsAt: Date.parse("2025-05-01T00:00:00Z") }, ...overrides.windows };
  const base = { version: EVALUATION_VERSION, name: "synthetic-evaluation-protocol-v1", ruleVersion: marketRules.ruleVersion,
    frozenAt: Date.parse("2025-04-01T00:00:00Z"), approvalRef: "synthetic-frozen-threshold-approval", selectionVersion: "synthetic-fixture-selection-v1",
    windows, competitionIds: [EVALUATION_COMPETITION_ID], horizons: [{ id: "day-ahead", minimumMs: 12 * 60 * 60 * 1000, maximumMs: 48 * 60 * 60 * 1000 }],
    candidateModel: modelVersion({ windows: { training: windows.training, validation: windows.validation,
      calibration: windows.calibration, finalTest: null } }), previousApprovedModel: null, providerContractVersion: API_FOOTBALL_CONTRACT_VERSION,
    calibrationBands: [0, 0.5, 1], confidenceZ: 1.96,
    baselines: { version: "synthetic-baselines-v1", lookbackMs: 120 * 24 * 60 * 60 * 1000, minimumMatches: 2,
      leagueFrequency: { alpha: 1 }, teamStrength: { initialRating: 1500, kFactor: 20, scale: 400, homeAdvantage: 40, drawWeight: 0.5 } },
    gates: ["match-result", "double-chance", "total-goals", "both-teams-to-score"].flatMap((family) =>
      [["candidate", "ai"], ["candidate", "combined"], ["public-claim", "combined"]].map(([purpose, system]) => ({
        id: `synthetic-${purpose}-${system}-${family}`, purpose, system, family, horizonId: "day-ahead", minimumSamples: 2, minimumCoverage: 0.5,
        maximumBrier: 2, maximumLogLoss: 1000, maximumCalibrationError: 1, baseline: null, maximumBrierDifference: null }))),
  };
  return { ...base, ...overrides, windows, baselines: { ...base.baselines, ...overrides.baselines,
    leagueFrequency: { ...base.baselines.leagueFrequency, ...overrides.baselines?.leagueFrequency },
    teamStrength: { ...base.baselines.teamStrength, ...overrides.baselines?.teamStrength } } };
}
export function evaluationProtocol(overrides = {}) { return createEvaluationProtocol(evaluationProtocolConfiguration(overrides)); }
export function evaluationFixture(overrides = {}) {
  const forecastAt = overrides.forecastAt ?? EVALUATION_FORECAST_AT, cutoffAt = overrides.context?.cutoffAt ?? forecastAt - 60 * 60 * 1000;
  const context = evidenceContext(undefined, { fixtureId: EVALUATION_FIXTURE_ID, fixtureVersion: 1n, cycleId: EVALUATION_CYCLE_ID, runId: EVALUATION_RUN_ID,
    kickoffAt: Date.parse("2025-04-10T12:00:00Z"), cutoffAt, analysisAt: cutoffAt + 1000, ...overrides.context });
  const model = evaluationProtocol().candidateModel;
  const football = { id: evaluationHash("synthetic-evaluation-football-proof"), version: "synthetic-football-availability-v1", kind: "football",
    availableAt: cutoffAt - 600_000, retrievedAt: cutoffAt - 300_000, publishedAt: null, providerUpdatedAt: cutoffAt - 900_000,
    evidenceRef: "synthetic-evaluation-football-proof" };
  const news = { id: evaluationHash("synthetic-evaluation-news-proof"), version: "synthetic-news-availability-v1", kind: "news",
    availableAt: cutoffAt - 600_000, retrievedAt: cutoffAt - 300_000, publishedAt: cutoffAt - 900_000, providerUpdatedAt: null,
    evidenceRef: "synthetic-evaluation-news-proof" };
  const providerProof = { id: evaluationHash("synthetic-evaluation-provider-forecast-proof"), version: "synthetic-provider-availability-v1", kind: "provider-forecast",
    availableAt: cutoffAt + 600_000, retrievedAt: cutoffAt + 900_000, publishedAt: null, providerUpdatedAt: null,
    evidenceRef: "synthetic-evaluation-provider-forecast-proof" };
  const groups = { "match-result": { source: "ai", period: marketRules.period, probabilities: { "home-win": 0.4, draw: 0.3, "away-win": 0.3 } },
    "total-goals": { source: "ai", period: marketRules.period, line: 2.5, probabilities: { "over-2.5": 0.6, "under-2.5": 0.4 } },
    "both-teams-to-score": { source: "ai", period: marketRules.period, probabilities: { yes: 0.6, no: 0.4 } } };
  const ai = { version: model.providerModelVersion, modelVersionId: model.id, calibrationVersion: model.calibration.version,
    receiptHash: evaluationHash("synthetic-evaluation-ai-receipt"), evidenceRef: "synthetic-evaluation-ai-receipt-proof", capture: "historical-snapshot",
    capturedAt: cutoffAt + 1_800_000, generatedAt: cutoffAt + 900_000, providerUpdatedAt: null,
    evidence: [football, news], markets: validateMarketSnapshot(groups) };
  const provider = { version: API_FOOTBALL_CONTRACT_VERSION, modelVersionId: null, calibrationVersion: null,
    receiptHash: evaluationHash("synthetic-evaluation-provider-receipt"), evidenceRef: "synthetic-evaluation-provider-receipt-proof", capture: "historical-snapshot",
    capturedAt: cutoffAt + 1_800_000, generatedAt: null, providerUpdatedAt: null,
    evidence: [providerProof], markets: validateMarketSnapshot({ "match-result": { ...groups["match-result"], source: "api-football",
      probabilities: { "home-win": 0.5, draw: 0.3, "away-win": 0.2 } } }) };
  const combined = { ...ai, receiptHash: evaluationHash("synthetic-evaluation-combined-receipt"), evidenceRef: "synthetic-evaluation-combined-receipt-proof" };
  const forecasts = { ai, "api-football": provider, combined };
  for (const system of Object.keys(forecasts)) if (Object.hasOwn(overrides.forecasts ?? {}, system)) {
    forecasts[system] = overrides.forecasts[system] === null ? null : { ...forecasts[system], ...overrides.forecasts[system] };
  }
  const baseResult = { context: { status: "finished-regulation", cycleEligibility: { eligible: true },
    regulationScore: { verified: true, period: marketRules.period, home: 2, away: 1 } },
    availableAt: Date.parse("2025-04-10T15:00:00Z"), observationHash: evaluationHash("synthetic-evaluation-regulation-result"), evidenceRef: "synthetic-evaluation-result-proof" };
  return { competitionId: EVALUATION_COMPETITION_ID, forecastAt, manifestAt: cutoffAt - 24 * 60 * 60 * 1000,
    ...overrides, context, forecasts, unavailableReasons: { ai: null, "api-football": null, combined: null, ...overrides.unavailableReasons },
    result: { ...baseResult, ...overrides.result, context: { ...baseResult.context, ...overrides.result?.context } } };
}
export function evaluationHistory(overrides = {}) {
  return { fixtureId: "20000000-0000-4000-8000-000000000010", cycleId: "20000000-0000-4000-8000-000000000011",
    competitionId: EVALUATION_COMPETITION_ID, homeTeamId: "10000000-0000-4000-8000-000000000002", awayTeamId: "10000000-0000-4000-8000-000000000003",
    kickoffAt: Date.parse("2025-03-10T12:00:00Z"), availableAt: Date.parse("2025-03-10T15:00:00Z"), homeGoals: 2, awayGoals: 0,
    period: marketRules.period, observationHash: evaluationHash("synthetic-evaluation-history-one"), evidenceRef: "synthetic-baseline-history-proof", ...overrides };
}
export function evaluationDataset(overrides = {}) {
  return createEvaluationDataset({ version: 1, selectionVersion: "synthetic-fixture-selection-v1", evidenceRef: "synthetic-evaluation-dataset-proof", mode: "synthetic",
    fixtures: [evaluationFixture()], history: [evaluationHistory(), evaluationHistory({ fixtureId: "20000000-0000-4000-8000-000000000012",
      cycleId: "20000000-0000-4000-8000-000000000013", kickoffAt: Date.parse("2025-03-20T12:00:00Z"), availableAt: Date.parse("2025-03-20T15:00:00Z"),
      homeGoals: 1, awayGoals: 1, observationHash: evaluationHash("synthetic-evaluation-history-two") })], ...overrides });
}
export function evaluationAuthority(overrides = {}) {
  return { authorize() {}, verifyProtocol: () => true, verifyDataset: () => true, verifyForecast: () => true, verifyEvidence: () => true,
    verifyResult: () => true, verifyHistory: () => true, verifyModel: () => true, verifyUntouchedFinalTest: () => true, ...overrides };
}

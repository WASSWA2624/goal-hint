import assert from "node:assert/strict";
import test from "node:test";
import { createEvaluationHarness } from "../src/server/evaluation/evaluation-service.ts";
import { evaluationFixtureKey } from "../src/server/evaluation/evaluation-input.ts";
import { marketRules, validateMarketSnapshot } from "../src/domain/markets.ts";
import { buildPredictorPrompt } from "../src/server/predictor/predictor-prompt.ts";
import { applyPredictorCalibration } from "../src/server/predictor/predictor-calibration.ts";
import { evaluationAuthority, evaluationDataset, evaluationFixture, evaluationHash, evaluationProtocol,
  evaluationProtocolConfiguration, EVALUATION_COMPETITION_ID, EVALUATION_FORECAST_AT } from "./helpers/evaluation-fixtures.mjs";
import { modelAuthority, modelVersion } from "./helpers/predictor-fixtures.mjs";
import { predictorAcceptedOutput, predictorSnapshot } from "./helpers/predictor-output-fixtures.mjs";
import { evidenceAuthority, evidencePolicy } from "./helpers/evidence-fixtures.mjs";

// Every approval, forecast and result is synthetic. Tests labeled prospective or
// historical exercise rejection/gate contracts and establish no real model quality.
const HOUR = 3_600_000, DAY = 24 * HOUR;
const id = (number) => `30000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const harness = (authority = evaluationAuthority(), limits = {}) => createEvaluationHarness({ authority, maxRows: 1000, maxBytes: 2_000_000, ...limits });
const evaluate = (dataset = evaluationDataset(), protocol = evaluationProtocol(), authority) =>
  harness(authority).evaluate({ dataset, protocol, split: "finalTest" });
function row(number, overrides = {}) {
  return evaluationFixture({ ...overrides, context: { fixtureId: id(number), cycleId: id(number + 1000), ...overrides.context } });
}
function cell(report, system, family = "match-result", horizonId = "day-ahead") {
  const result = report.cells.find((entry) => entry.system === system && entry.family === family && entry.horizonId === horizonId);
  assert.ok(result); return result;
}
function comparison(report, system, referenceSystem, family = "match-result", horizonId = "day-ahead") {
  const result = report.comparisons.find((entry) => entry.system === system && entry.referenceSystem === referenceSystem &&
    entry.family === family && entry.horizonId === horizonId);
  assert.ok(result); return result;
}
const approximate = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-12, `${actual} != ${expected}`);
function toyGates(overrides = {}) {
  return evaluationProtocolConfiguration().gates.map((gate) => ({ ...gate, minimumSamples: 1, ...overrides }));
}

test("frozen evaluation reproduces the same artifact hash independent of fixture and history input order", () => {
  const base = evaluationDataset(), fixtures = [row(1), row(2)];
  const ordered = evaluationDataset({ fixtures, history: [...base.history] });
  const reversed = evaluationDataset({ fixtures: [...fixtures].reverse(), history: [...base.history].reverse() });
  assert.equal(ordered.id, reversed.id);
  const first = evaluate(ordered), rerun = evaluate(ordered), reordered = evaluate(reversed);
  assert.deepEqual(first, rerun);
  assert.deepEqual(first, reordered);
  assert.equal(first.hash, first.id);
  assert.equal(Object.isFrozen(first.cells), true);
  assert.equal(first.promotionPerformed, false);
  assert.equal(first.publicClaimAuthorized, false);
});

test("source and combined metrics use full distributions while double chance contributes one headline pick", () => {
  const report = evaluate();
  const ai = cell(report, "ai"), provider = cell(report, "api-football"), combined = cell(report, "combined"), doubleChance = cell(report, "ai", "double-chance");
  assert.equal(ai.metrics.count, 1);
  assert.equal(ai.metrics.correct, 1);
  approximate(ai.metrics.brier, 0.54);
  approximate(ai.metrics.logLoss, -Math.log(0.4));
  approximate(provider.metrics.brier, 0.38);
  assert.deepEqual(combined.metrics, ai.metrics);
  assert.equal(doubleChance.coverage.total, 1);
  assert.equal(doubleChance.metrics.count, 1);
  assert.equal(doubleChance.metrics.correct, 1);
  assert.equal(doubleChance.metrics.calibration.reduce((sum, bin) => sum + bin.count, 0), 3);
  const pair = comparison(report, "ai", "api-football");
  assert.equal(pair.kind, "source-comparison");
  assert.equal(pair.count, 1);
  approximate(pair.brierDifference, 0.16);
});

test("unavailable, pending and void fixtures reconcile without entering settled metric denominators", () => {
  const settled = row(1), unavailable = row(2, { forecasts: { ai: null, "api-football": null, combined: null },
    unavailableReasons: { ai: "synthetic-missing", "api-football": "synthetic-missing", combined: "synthetic-missing" } });
  const voided = row(3, { result: { context: { status: "canceled", regulationScore: null } } });
  const pending = row(4, { result: { context: { status: "live", regulationScore: null }, availableAt: null } });
  const report = evaluate(evaluationDataset({ fixtures: [settled, unavailable, voided, pending] }));
  const ai = cell(report, "ai");
  assert.deepEqual(ai.coverage, { total: 4, available: 2, unavailable: 1, void: 1, pending: 1, settled: 1, sources: { ai: 2, "api-football": 0 } });
  assert.equal(ai.coverage.total, ai.coverage.available + ai.coverage.unavailable + ai.coverage.void);
  assert.equal(ai.coverage.available, ai.coverage.pending + ai.coverage.settled);
  assert.equal(ai.metrics.count, 1);
  const baseline = cell(report, "league-frequency");
  assert.equal(baseline.coverage.available, 3);
  assert.equal(baseline.metrics.count, 2);
  assert.deepEqual(baseline.coverage.sources, { ai: 0, "api-football": 0 });
});

test("matched comparisons use only identical captured fixture, cutoff and horizon keys", () => {
  const both = row(1), aiOnly = row(2, { forecasts: { "api-football": null }, unavailableReasons: { "api-football": "synthetic-no-original-provider-snapshot" } });
  const providerOnly = row(3, { forecasts: { ai: null, combined: null },
    unavailableReasons: { ai: "synthetic-no-original-ai-snapshot", combined: "synthetic-no-combined-snapshot" } });
  const report = evaluate(evaluationDataset({ fixtures: [both, aiOnly, providerOnly] }));
  assert.equal(cell(report, "ai").metrics.count, 2);
  assert.equal(cell(report, "api-football").metrics.count, 2);
  const sourcePair = comparison(report, "ai", "api-football");
  assert.equal(sourcePair.count, 1);
  assert.equal(sourcePair.candidate.count, 1);
  assert.equal(sourcePair.reference.count, 1);
  assert.equal(sourcePair.fixtureKeysHash, evaluationHash(JSON.stringify([evaluationFixtureKey(both)])));
  assert.equal(comparison(report, "ai", "api-football", "total-goals").count, 0);
  assert.equal(comparison(report, "ai", "team-strength", "both-teams-to-score").count, 0);
  assert.equal(comparison(report, "ai", "league-frequency").count, 2);
});

test("combined forecasts expose AI/fallback source counts without counting alternatives as extra forecasts", () => {
  const groups = {
    "match-result": { source: "api-football", period: marketRules.period, probabilities: { "home-win": 0.5, draw: 0.3, "away-win": 0.2 } },
    "total-goals": { source: "ai", period: marketRules.period, line: 2.5, probabilities: { "over-2.5": 0.6, "under-2.5": 0.4 } },
    "both-teams-to-score": { source: "ai", period: marketRules.period, probabilities: { yes: 0.6, no: 0.4 } },
  };
  const mixed = row(1, { forecasts: { combined: { markets: validateMarketSnapshot(groups) } } }), ai = row(2);
  const report = evaluate(evaluationDataset({ fixtures: [mixed, ai] }));
  const combined = cell(report, "combined");
  assert.equal(combined.metrics.count, 2);
  assert.deepEqual(combined.coverage.sources, { ai: 1, "api-football": 1 });
  assert.equal(combined.sourceMetrics.ai.count, 1);
  assert.equal(combined.sourceMetrics["api-football"].count, 1);
  assert.equal(cell(report, "combined", "double-chance").metrics.count, 2);
  assert.deepEqual(cell(report, "combined", "total-goals").coverage.sources, { ai: 2, "api-football": 0 });
});

test("missing original historical AI/provider snapshots remain unavailable while baselines are reconstructable", () => {
  const missing = row(1, { forecasts: { ai: null, "api-football": null, combined: null }, unavailableReasons: {
    ai: "synthetic-no-original-ai-snapshot", "api-football": "synthetic-no-original-provider-snapshot", combined: "synthetic-no-original-combined-snapshot",
  } });
  const report = evaluate(evaluationDataset({ mode: "historical", fixtures: [missing] }));
  assert.equal(cell(report, "ai").coverage.unavailable, 1);
  assert.equal(cell(report, "ai").metrics.count, 0);
  assert.equal(cell(report, "api-football").metrics.count, 0);
  assert.equal(cell(report, "league-frequency").metrics.count, 1);
  assert.equal(cell(report, "team-strength").metrics.count, 1);
  assert.equal(cell(report, "team-strength", "total-goals").coverage.unavailable, 1);
  assert.ok(report.prospectiveRequirements.some((entry) => entry.includes("original source/evidence snapshots")));
  assert.equal(report.publicClaimAuthorized, false);
});

test("horizon lower bounds are inclusive and upper bounds exclude later alternatives", () => {
  const lower = row(1, { context: { kickoffAt: EVALUATION_FORECAST_AT + 12 * HOUR }, result: { availableAt: EVALUATION_FORECAST_AT + 15 * HOUR } });
  const upper = row(2, { context: { kickoffAt: EVALUATION_FORECAST_AT + 48 * HOUR }, result: { availableAt: EVALUATION_FORECAST_AT + 51 * HOUR } });
  const inside = row(3), otherCompetition = row(4, { competitionId: id(9999) });
  const report = evaluate(evaluationDataset({ fixtures: [lower, upper, inside, otherCompetition] }));
  assert.equal(report.selectedRows, 2);
  assert.equal(cell(report, "ai").coverage.total, 2);
  assert.ok(report.excludedRows.some((entry) => entry.key === evaluationFixtureKey(upper) && entry.reason === "outside-horizon-cohort"));
  assert.ok(report.excludedRows.some((entry) => entry.key === evaluationFixtureKey(otherCompetition) && entry.reason === "outside-competition-cohort"));
});

test("split windows use a half-open kickoff cohort without silently extending final test dates", () => {
  const completed = evaluationProtocol().candidateModel;
  const model = modelVersion({ windows: { training: completed.windows.training, validation: completed.windows.validation, calibration: null, finalTest: null } });
  const make = (number, kickoffAt) => {
    const forecastAt = kickoffAt - DAY, cutoffAt = forecastAt - HOUR;
    return row(number, { forecastAt, manifestAt: cutoffAt - DAY, context: { kickoffAt, cutoffAt, analysisAt: cutoffAt + 1000 },
      result: { availableAt: kickoffAt + 3 * HOUR }, forecasts: { ai: { modelVersionId: model.id }, combined: { modelVersionId: model.id } } });
  };
  const lower = make(1, Date.parse("2025-04-01T00:00:00Z")), upper = make(2, Date.parse("2025-05-01T00:00:00Z"));
  const report = evaluate(evaluationDataset({ fixtures: [lower, upper] }), evaluationProtocol({ candidateModel: model }));
  assert.equal(report.selectedRows, 1);
  assert.equal(report.fixtureDatePeriod.first, "2025-04-01");
  assert.ok(report.excludedRows.some((entry) => entry.key === evaluationFixtureKey(upper) && entry.reason === "outside-split-window"));
});

test("multiple captures for the same fixture/cycle in one horizon are rejected instead of selecting favorable alternatives", () => {
  const first = row(1), duplicate = row(1, { forecastAt: EVALUATION_FORECAST_AT + 60_000,
    context: { cutoffAt: first.context.cutoffAt + 60_000, analysisAt: first.context.analysisAt + 60_000 } });
  const dataset = evaluationDataset({ fixtures: [first, duplicate] });
  assert.throws(() => evaluate(dataset), (error) => error.reason === "invalid-dataset");
});

test("the same fixture at distinct predeclared horizons remains separately labeled", () => {
  const first = row(1), second = row(1, { forecastAt: EVALUATION_FORECAST_AT + 18 * HOUR });
  const gates = evaluationProtocolConfiguration().gates.flatMap((gate) => [
    { ...gate, id: `${gate.id}-early`, horizonId: "early" }, { ...gate, id: `${gate.id}-late`, horizonId: "late" },
  ]);
  const protocol = evaluationProtocol({ horizons: [{ id: "late", minimumMs: 5 * HOUR, maximumMs: 12 * HOUR },
    { id: "early", minimumMs: 12 * HOUR, maximumMs: 48 * HOUR }], gates });
  const report = evaluate(evaluationDataset({ fixtures: [first, second] }), protocol);
  assert.equal(cell(report, "ai", "match-result", "early").metrics.count, 1);
  assert.equal(cell(report, "ai", "match-result", "late").metrics.count, 1);
  assert.equal(report.selectedRows, 2);
});

test("synthetic passing diagnostics never qualify a model or public claim", () => {
  const report = evaluate(evaluationDataset(), evaluationProtocol({ gates: toyGates() }));
  assert.ok(report.gates.every((gate) => gate.diagnostic === "passed"));
  assert.ok(report.gates.every((gate) => gate.status === "pending" && gate.reasons.includes("synthetic-data")));
  assert.equal(report.decision, "remain-provisional");
  assert.equal(report.publicClaimStatus, "pending");
  assert.equal(report.promotionPerformed, false);
  assert.equal(report.publicClaimAuthorized, false);
});

test("synthetic failed diagnostics remain pending and cannot establish real failure of a model", () => {
  const report = evaluate(evaluationDataset(), evaluationProtocol({ gates: toyGates({ maximumBrier: 0.01 }) }));
  assert.ok(report.gates.some((gate) => gate.diagnostic === "failed"));
  assert.ok(report.gates.every((gate) => gate.status === "pending"));
  assert.equal(report.decision, "remain-provisional");
});

test("a failure-only prospective contract retains an existing approved model without promoting a replacement", () => {
  const previous = modelVersion({ providerModelVersion: "synthetic-prior-model-v1", evaluation: {
    version: "synthetic-prior-evaluation-v1", evidenceRef: "synthetic-prior-policy-proof", status: "evaluated", evaluationRef: "synthetic-prior-evaluation-proof",
  } });
  const report = evaluate(evaluationDataset({ mode: "prospective" }), evaluationProtocol({ previousApprovedModel: previous,
    gates: toyGates({ maximumBrier: 0.01 }) }));
  assert.ok(report.gates.some((gate) => gate.status === "failed"));
  assert.equal(report.decision, "retain-previous-approved");
  assert.equal(report.previousApprovedModelId, previous.id);
  assert.equal(report.publicClaimStatus, "blocked");
  assert.equal(report.promotionPerformed, false);
  assert.equal(report.publicClaimAuthorized, false);
});

test("a failure-only prospective contract without an approved predecessor stays provisional", () => {
  const report = evaluate(evaluationDataset({ mode: "prospective" }), evaluationProtocol({ gates: toyGates({ maximumBrier: 0.01 }) }));
  assert.equal(report.decision, "remain-provisional");
  assert.equal(report.previousApprovedModelId, null);
});

test("insufficient settled samples remain pending even when losses satisfy the configured gate", () => {
  const report = evaluate(evaluationDataset({ mode: "prospective" }));
  assert.ok(report.gates.every((gate) => gate.status === "pending" && gate.diagnostic === "pending" && gate.reasons.includes("insufficient-settled-samples")));
  assert.equal(report.decision, "remain-provisional");
});

test("relative baseline gates use only matched observed fixtures and fail a configured loss difference", () => {
  const gates = toyGates().map((gate) => gate.system === "ai" && gate.family === "match-result"
    ? { ...gate, baseline: "league-frequency", maximumBrierDifference: -1 } : gate);
  const report = evaluate(evaluationDataset({ mode: "prospective" }), evaluationProtocol({ gates }));
  const gate = report.gates.find((entry) => entry.id === "synthetic-candidate-ai-match-result");
  assert.equal(gate.status, "failed");
  assert.ok(gate.reasons.includes("matched-brier-difference-above-gate"));
  assert.equal(comparison(report, "ai", "league-frequency").count, 1);
});

test("unsupported baseline binaries cannot manufacture matched samples for quality gates", () => {
  const gates = toyGates().map((gate) => gate.system === "ai" && gate.family === "total-goals"
    ? { ...gate, baseline: "team-strength", maximumBrierDifference: 0 } : gate);
  const report = evaluate(evaluationDataset({ mode: "prospective" }), evaluationProtocol({ gates }));
  const gate = report.gates.find((entry) => entry.id === "synthetic-candidate-ai-total-goals");
  assert.equal(gate.status, "pending");
  assert.ok(gate.reasons.includes("insufficient-matched-baseline-samples"));
});

test("unapproved protocols or missing independent final proof keep all gates pending", () => {
  for (const authority of [evaluationAuthority({ verifyProtocol: () => false }), evaluationAuthority({ verifyUntouchedFinalTest: () => false }),
    evaluationAuthority({ verifyProtocol: async () => true })]) {
    const report = evaluate(evaluationDataset({ mode: "prospective" }), evaluationProtocol({ gates: toyGates() }), authority);
    assert.ok(report.gates.every((gate) => gate.status === "pending"));
    assert.equal(report.decision, "remain-provisional");
    assert.equal(report.publicClaimAuthorized, false);
  }
});

test("unresolved windows and thresholds produce a concrete empty report and prospective requirements", () => {
  const protocol = evaluationProtocol({ frozenAt: null, approvalRef: null, candidateModel: null, gates: null,
    windows: { training: null, validation: null, calibration: null, finalTest: null } });
  const missing = row(1, { forecasts: { ai: null, "api-football": null, combined: null }, unavailableReasons: {
    ai: "synthetic-unselected-model", "api-football": "synthetic-no-provider-snapshot", combined: "synthetic-no-forecast",
  } });
  const report = evaluate(evaluationDataset({ fixtures: [missing] }), protocol);
  assert.equal(report.selectedRows, 0);
  assert.ok(report.excludedRows.every((entry) => entry.reason === "unresolved-split-window"));
  assert.ok(report.prospectiveRequirements.length >= 4);
  assert.equal(report.decision, "remain-provisional");
});

test("async and revoked authorization, source, result, history and model proofs fail closed", () => {
  for (const overrides of [{ authorize: async () => { throw new Error("Synthetic private authorization"); } },
    { verifyDataset: async () => true }, { verifyForecast: () => false }, { verifyEvidence: () => false },
    { verifyEvidence: async () => { throw new Error("Synthetic private async source proof"); } },
    { verifyResult: () => false }, { verifyHistory: () => false }, { verifyHistory: async () => true },
    { verifyModel: () => false }, { verifyModel: async () => true }])
    assert.throws(() => evaluate(evaluationDataset(), evaluationProtocol(), evaluationAuthority(overrides)), (error) => error.reason === "not-authorized");
});

test("late rights or history/model revocation is caught after synchronous evaluation work", () => {
  for (const revoked of ["evidence", "history", "model"]) {
    let datasetChecks = 0, permitted = true;
    const authority = evaluationAuthority({ verifyDataset() { if (++datasetChecks === 2) permitted = false; return true; },
      verifyEvidence: () => revoked !== "evidence" || permitted, verifyHistory: () => revoked !== "history" || permitted,
      verifyModel: () => revoked !== "model" || permitted });
    assert.throws(() => evaluate(evaluationDataset(), evaluationProtocol(), authority), (error) => error.reason === "not-authorized");
  }
});

test("a model fitted after the evidence cutoff cannot score earlier snapshots even with synthetic approval", () => {
  const cutoffAt = Date.parse("2025-01-15T11:00:00Z"), forecastAt = cutoffAt + HOUR, kickoffAt = forecastAt + DAY;
  const early = row(1, { forecastAt, manifestAt: cutoffAt - DAY, context: { cutoffAt, analysisAt: cutoffAt + 1000, kickoffAt },
    result: { availableAt: kickoffAt + 3 * HOUR } });
  const dataset = evaluationDataset({ fixtures: [early] });
  assert.throws(() => evaluate(dataset), (error) => error.reason === "leakage");
});

test("calibration artifacts ending after capture cannot score earlier forecasts", () => {
  const windows = evaluationProtocol().candidateModel.windows;
  const model = modelVersion({ windows, calibration: { kind: "evaluated", version: "synthetic-evaluated-calibration-v1", method: "synthetic-transform",
    parameters: {}, sourceFamilies: ["match-result"], evidenceRef: "synthetic-calibration-artifact", evaluationRef: "synthetic-calibration-evaluation-proof" } });
  const cutoffAt = Date.parse("2025-03-15T11:00:00Z"), forecastAt = cutoffAt + HOUR, kickoffAt = forecastAt + DAY;
  const early = row(1, { forecastAt, manifestAt: cutoffAt - DAY, context: { cutoffAt, analysisAt: cutoffAt + 1000, kickoffAt },
    result: { availableAt: kickoffAt + 3 * HOUR }, forecasts: { ai: { modelVersionId: model.id, calibrationVersion: model.calibration.version },
      combined: { modelVersionId: model.id, calibrationVersion: model.calibration.version } } });
  assert.throws(() => evaluate(evaluationDataset({ fixtures: [early] }), evaluationProtocol({ candidateModel: model })), (error) => error.reason === "leakage");
});

test("planned future assessment windows accept genuinely prior fitted models through the 012 prompt and output contracts", () => {
  const protocol = evaluationProtocol(), model = protocol.candidateModel, target = row(1);
  const snapshot = predictorSnapshot(undefined, evidencePolicy(), target.context);
  assert.equal(model.windows.finalTest, null);
  assert.ok(protocol.windows.finalTest.endsAt > snapshot.context.cutoffAt);
  assert.ok(Object.values(model.windows).every((window) => window === null || window.endsAt <= snapshot.context.cutoffAt));
  const prompt = buildPredictorPrompt({ snapshot, model, authority: {
    evidence: evidenceAuthority(), verifyModel: () => true, verifyTransmission: () => true,
  } });
  assert.equal(prompt.schemaVersion, model.schemaVersion);
  const raw = predictorAcceptedOutput(snapshot, model), calibrated = applyPredictorCalibration(raw, { model, authority: modelAuthority() });
  assert.equal(calibrated.valid, true);
  const output = calibrated.output;
  const captured = { ...target.forecasts.ai, modelVersionId: model.id, calibrationVersion: output.calibration.version,
    receiptHash: evaluationHash("synthetic-genuine-012-validator-receipt"), capturedAt: output.timestamps.retrievedAt,
    generatedAt: output.timestamps.generatedAt, providerUpdatedAt: output.timestamps.providerUpdatedAt, markets: output.markets,
    evidence: snapshot.sources.map((source) => ({ id: source.id, version: source.version, kind: "football", availableAt: source.retrievedAt,
      retrievedAt: source.retrievedAt, publishedAt: source.publishedAt, providerUpdatedAt: source.providerUpdatedAt, evidenceRef: source.evidenceRef })) };
  const fixture = { ...target, forecasts: { ai: captured, "api-football": null, combined: null },
    unavailableReasons: { ai: null, "api-football": "synthetic-no-provider-capture", combined: "synthetic-no-combined-capture" } };
  const report = evaluate(evaluationDataset({ fixtures: [fixture] }), protocol);
  assert.equal(cell(report, "ai").metrics.count, 1);
  assert.equal(report.candidateModelId, model.id);
  assert.equal(report.publicClaimAuthorized, false);
});

test("unknown actual model fitting windows cannot qualify even with synthetic approval callbacks", () => {
  const model = modelVersion({ windows: { training: null, validation: null, calibration: null, finalTest: null } });
  const target = row(1, { forecasts: { ai: { modelVersionId: model.id }, combined: { modelVersionId: model.id } } });
  const report = evaluate(evaluationDataset({ mode: "prospective", fixtures: [target] }), evaluationProtocol({ candidateModel: model, gates: toyGates() }));
  assert.ok(report.gates.every((gate) => gate.status === "pending" && gate.reasons.includes("unknown-model-fit-provenance")));
  assert.equal(report.decision, "remain-provisional");
  assert.equal(report.publicClaimAuthorized, false);
});

test("selection/version mismatches and explicit harness bounds cannot silently replace a dataset", () => {
  const dataset = evaluationDataset({ selectionVersion: "synthetic-different-selection-v1" });
  assert.throws(() => evaluate(dataset));
  assert.throws(() => harness(evaluationAuthority(), { maxRows: 1 }).evaluate({ protocol: evaluationProtocol(), dataset: evaluationDataset(), split: "finalTest" }));
  assert.throws(() => harness(evaluationAuthority(), { maxBytes: 100 }).evaluate({ protocol: evaluationProtocol(), dataset: evaluationDataset(), split: "finalTest" }));
});

test("exact model, calibration and provider versions cannot be silently substituted", () => {
  for (const forecasts of [{ ai: { version: "synthetic-different-ai-version" } },
    { ai: { modelVersionId: evaluationHash("synthetic-other-model") } },
    { ai: { calibrationVersion: "synthetic-other-calibration" } },
    { "api-football": { version: "synthetic-different-provider-contract" } }])
    assert.throws(() => evaluate(evaluationDataset({ fixtures: [row(1, { forecasts })] })), (error) => error.reason === "invalid-dataset");
  assert.throws(() => evaluate(evaluationDataset(), evaluationProtocol({ providerContractVersion: null })),
    (error) => error.reason === "invalid-dataset");
});

test("gate results retain exact frozen criteria and report sample limits", () => {
  const protocol = evaluationProtocol(), report = evaluate(evaluationDataset(), protocol);
  for (const gate of report.gates) assert.deepEqual(gate.criteria, protocol.gates.find((entry) => entry.id === gate.id));
  assert.ok(report.gates.some((gate) => gate.reasons.includes("insufficient-settled-samples")));
  assert.equal(report.candidateModelId, protocol.candidateModel.id);
  assert.equal(report.calibrationVersion, protocol.candidateModel.calibration.version);
  assert.equal(report.providerContractVersion, protocol.providerContractVersion);
});

test("calibration bins expose outcome counts and uncertainty without converting them into guarantees", () => {
  const report = evaluate(evaluationDataset({ fixtures: [row(1), row(2, { result: { context: { regulationScore: { verified: true, period: marketRules.period, home: 0, away: 1 } } } })] }));
  const metrics = cell(report, "ai").metrics;
  assert.equal(metrics.count, 2);
  assert.equal(metrics.correct, 1);
  assert.equal(metrics.incorrect, 1);
  assert.equal(metrics.hitRate, 0.5);
  const home = metrics.calibration.find((bin) => bin.selection === "home-win" && bin.count > 0);
  assert.equal(home.count, 2);
  approximate(home.observedFrequency, 0.5);
  assert.ok(home.interval.lower < home.observedFrequency && home.interval.upper > home.observedFrequency);
  assert.ok(report.limitations.some((entry) => entry.includes("No automatic model promotion")));
  assert.equal(report.publicClaimAuthorized, false);
  assert.equal(report.cells.some((entry) => entry.family === "exact-score"), false);
  assert.equal(report.cells.some((entry) => entry.system === EVALUATION_COMPETITION_ID), false);
});

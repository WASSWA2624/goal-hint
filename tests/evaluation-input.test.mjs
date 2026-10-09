import assert from "node:assert/strict";
import test from "node:test";
import { createEvaluationDataset, createEvaluationProtocol, EvaluationInputError, parseEvaluationDataset,
  parseEvaluationProtocol } from "../src/server/evaluation/evaluation-input.ts";
import { modelVersion } from "./helpers/predictor-fixtures.mjs";
import { evaluationDataset, evaluationFixture, evaluationHash, evaluationHistory, evaluationProtocol,
  evaluationProtocolConfiguration } from "./helpers/evaluation-fixtures.mjs";

const error = (run, reason) => assert.throws(run, (value) => value instanceof EvaluationInputError && value.reason === reason);
const configuration = (dataset = evaluationDataset()) => { const { id, hash, ...body } = dataset; void id; void hash; return body; };
const copy = (value) => structuredClone(value);
const replaceProof = (row, system, index, changes) => ({ ...row, forecasts: { ...row.forecasts, [system]: {
  ...row.forecasts[system], evidence: row.forecasts[system].evidence.map((proof, offset) => offset === index ? { ...proof, ...changes } : proof) } } });

test("frozen protocol hashes reproduce canonical cohort selections and thresholds", () => {
  const configuration = evaluationProtocolConfiguration(), first = createEvaluationProtocol(configuration);
  const second = createEvaluationProtocol({ ...configuration, gates: [...configuration.gates].reverse() });
  assert.equal(first.id, second.id); assert.deepEqual(parseEvaluationProtocol(first), first);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.gates)); assert.ok(Object.isFrozen(first.windows));
  assert.ok(Object.isFrozen(first.candidateModel.calibration));
  assert.throws(() => { first.gates[0].minimumSamples = 1; }, TypeError);
  assert.equal(first.candidateModel.evaluation.status, "provisional");
  assert.notEqual(first.windows.finalTest, null); assert.equal(first.candidateModel.windows.finalTest, null);
});

test("changing a frozen threshold or selection cannot retain its original approval hash", () => {
  const original = evaluationProtocol(), changed = copy(original); changed.gates[0].minimumSamples++;
  error(() => parseEvaluationProtocol(changed), "invalid-protocol");
  error(() => parseEvaluationProtocol({ ...original, selectionVersion: "synthetic-alternate-selection" }), "invalid-protocol");
  const revised = evaluationProtocol({ gates: changed.gates }); assert.notEqual(revised.id, original.id);
});

test("assessment periods, completed model windows and pre-test freezes remain chronological", () => {
  const base = evaluationProtocolConfiguration();
  for (const changed of [{ ...base, windows: { ...base.windows, validation: { ...base.windows.validation, startsAt: base.windows.training.endsAt - 1 } } },
    { ...base, frozenAt: base.windows.calibration.endsAt - 1 }, { ...base, frozenAt: base.windows.finalTest.startsAt + 1 },
    { ...base, windows: { ...base.windows, calibration: null } }, { ...base, approvalRef: null },
    { ...base, previousApprovedModel: base.candidateModel }]) {
    error(() => createEvaluationProtocol(changed), "invalid-protocol");
  }
});

test("future assessment windows do not invent completed model evaluation or fitting history", () => {
  const protocol = evaluationProtocol();
  assert.equal(protocol.candidateModel.windows.finalTest, null);
  assert.ok(protocol.windows.finalTest.endsAt > evaluationFixture().context.cutoffAt);
  const unknown = evaluationProtocol({ candidateModel: modelVersion() });
  assert.equal(unknown.candidateModel.windows.training, null); assert.equal(unknown.candidateModel.evaluation.status, "provisional");
  const malformedModel = copy(protocol.candidateModel);
  malformedModel.windows.validation.startsAt = malformedModel.windows.training.endsAt - 1;
  error(() => createEvaluationProtocol({ ...evaluationProtocolConfiguration(), candidateModel: malformedModel }), "invalid-protocol");
});

test("unresolved planning protocols remain explicitly unfrozen without manufactured periods or gates", () => {
  const plan = evaluationProtocol({ frozenAt: null, approvalRef: null, candidateModel: null, windows: { training: null, validation: null, calibration: null, finalTest: null },
    competitionIds: [], horizons: [], gates: null });
  assert.equal(plan.frozenAt, null); assert.equal(plan.candidateModel, null); assert.equal(plan.gates, null); assert.deepEqual(plan.horizons, []);
});

test("overlapping horizons, invalid bands and unbound gate criteria cannot enter a frozen protocol", () => {
  const base = evaluationProtocolConfiguration();
  for (const changed of [{ ...base, horizons: [{ id: "one", minimumMs: 0, maximumMs: 1000 }, { id: "two", minimumMs: 999, maximumMs: 2000 }] },
    { ...base, horizons: [{ ...base.horizons[0] }, { ...base.horizons[0] }] }, { ...base, calibrationBands: [0, 0.5, 0.5, 1] },
    { ...base, calibrationBands: [0.1, 1] }, { ...base, confidenceZ: 0 },
    { ...base, gates: [{ ...base.gates[0], horizonId: "unknown" }] },
    { ...base, gates: [{ ...base.gates[0], maximumBrier: null, maximumLogLoss: null, maximumCalibrationError: null }] },
    { ...base, gates: [{ ...base.gates[0], baseline: "league-frequency", maximumBrierDifference: null }] },
    { ...base, baselines: { ...base.baselines, minimumMatches: 0 } }, { ...base, competitionIds: [base.competitionIds[0], base.competitionIds[0]] }]) {
    error(() => createEvaluationProtocol(changed), "invalid-protocol");
  }
});

test("dataset reruns reproduce hashes and preserve immutable original forecasts and results", () => {
  const first = evaluationDataset(), body = configuration(first);
  const second = createEvaluationDataset({ ...body, history: [...body.history].reverse() });
  assert.equal(first.id, second.id); assert.deepEqual(parseEvaluationDataset(first), first);
  assert.ok(Object.isFrozen(first.fixtures)); assert.ok(Object.isFrozen(first.fixtures[0].forecasts.ai.evidence));
  assert.ok(Object.isFrozen(first.fixtures[0].forecasts.ai.markets));
  const changed = copy(first); changed.fixtures[0].result.context.regulationScore.home++;
  error(() => parseEvaluationDataset(changed), "invalid-dataset");
  error(() => parseEvaluationDataset({ ...first, selectionVersion: "synthetic-changed-selection" }), "invalid-dataset");
  assert.notEqual(createEvaluationDataset({ ...body, evidenceRef: "synthetic-another-dataset-proof" }).id, first.id);
});

test("rows from one history batch reproduce their dataset hash regardless of input order", () => {
  const sharedHash = evaluationHash("synthetic-shared-history-batch"), first = evaluationHistory({ observationHash: sharedHash });
  const second = evaluationHistory({ fixtureId: "20000000-0000-4000-8000-000000000012", cycleId: "20000000-0000-4000-8000-000000000013",
    observationHash: sharedHash, homeGoals: 0, awayGoals: 1 });
  const ordered = evaluationDataset({ history: [first, second] }), reversed = evaluationDataset({ history: [second, first] });
  assert.equal(ordered.id, reversed.id); assert.deepEqual(ordered.history, reversed.history);
  assert.equal(ordered.history.length, 2); assert.equal(ordered.history[0].observationHash, ordered.history[1].observationHash);
});

test("duplicate refresh identities and contradictory versions of one cycle are rejected", () => {
  const row = evaluationFixture(), body = configuration();
  error(() => createEvaluationDataset({ ...body, fixtures: [row, row] }), "invalid-dataset");
  for (const context of [{ ...row.context, fixtureVersion: 2n }, { ...row.context, kickoffAt: row.context.kickoffAt + 1000 },
    { ...row.context, home: { ...row.context.home, externalId: 77 } }]) {
    const second = { ...row, forecastAt: row.forecastAt - 1000, context };
    error(() => createEvaluationDataset({ ...body, fixtures: [row, second] }), "invalid-dataset");
  }
  error(() => createEvaluationDataset({ ...body, history: [evaluationHistory(), evaluationHistory()] }), "invalid-dataset");
});

test("future evidence and later publication cannot leak into earlier football/news cutoffs", () => {
  const row = evaluationFixture(), body = configuration();
  for (const [system, index] of [["ai", 0], ["ai", 1], ["combined", 0], ["combined", 1]]) {
    const proof = row.forecasts[system].evidence[index];
    for (const changes of [{ availableAt: row.context.cutoffAt + 1 }, { retrievedAt: row.context.cutoffAt + 1 },
      { publishedAt: proof.availableAt + 1 }, { providerUpdatedAt: proof.retrievedAt + 1 }, { availableAt: proof.retrievedAt + 1 }]) {
      error(() => createEvaluationDataset({ ...body, fixtures: [replaceProof(row, system, index, changes)] }), "leakage");
    }
  }
});

test("provider forecast proof uses forecast time without becoming a primary AI forecast vote", () => {
  const row = evaluationFixture(), body = configuration(), proof = row.forecasts["api-football"].evidence[0];
  assert.ok(proof.availableAt > row.context.cutoffAt); assert.ok(proof.retrievedAt <= row.forecastAt);
  assert.equal(createEvaluationDataset({ ...body, fixtures: [row] }).fixtures.length, 1);
  error(() => createEvaluationDataset({ ...body, fixtures: [replaceProof(row, "api-football", 0, { retrievedAt: row.forecastAt + 1 })] }), "leakage");
  error(() => createEvaluationDataset({ ...body, fixtures: [{ ...row, forecasts: { ...row.forecasts,
    ai: { ...row.forecasts.ai, evidence: [...row.forecasts.ai.evidence, proof] } } }] }), "leakage");
});

test("revised or hindsight captures and future generation/update clocks are rejected", () => {
  const row = evaluationFixture(), body = configuration();
  for (const changed of [{ capturedAt: row.forecastAt + 1 }, { capturedAt: row.context.analysisAt - 1 },
    { generatedAt: row.forecasts.ai.capturedAt + 1 }, { providerUpdatedAt: row.forecasts.ai.capturedAt + 1 },
    { evidence: [] }, { evidence: [row.forecasts.ai.evidence[0], row.forecasts.ai.evidence[0]] }]) {
    error(() => createEvaluationDataset({ ...body, fixtures: [{ ...row, forecasts: { ...row.forecasts, ai: { ...row.forecasts.ai, ...changed } } }] }), "leakage");
  }
  error(() => createEvaluationDataset({ ...body, mode: "historical", fixtures: [{ ...row, forecasts: { ...row.forecasts,
    ai: { ...row.forecasts.ai, capture: "prospective" } } }] }), "leakage");
});

test("manifest, cycle, publication cutoff and regulation-result availability constrain each row", () => {
  const row = evaluationFixture(), body = configuration();
  for (const changed of [{ ...row, manifestAt: row.context.cutoffAt + 1 }, { ...row, context: { ...row.context, cycleId: null } },
    { ...row, forecastAt: row.context.kickoffAt - 300_000 }, { ...row, forecastAt: row.context.analysisAt - 1 },
    { ...row, result: { ...row.result, availableAt: row.context.kickoffAt - 1 } }, { ...row, result: { ...row.result, availableAt: null } }]) {
    error(() => createEvaluationDataset({ ...body, fixtures: [changed] }), "leakage");
  }
});

test("missing forecasts need explicit reasons and genuine source/model distributions", () => {
  const row = evaluationFixture(), body = configuration();
  error(() => createEvaluationDataset({ ...body, fixtures: [{ ...row, forecasts: { ...row.forecasts, ai: null } }] }), "invalid-dataset");
  const missing = evaluationFixture({ forecasts: { ai: null, combined: null }, unavailableReasons: { ai: "synthetic-historical-snapshots-missing", combined: "synthetic-historical-snapshots-missing" } });
  const accepted = createEvaluationDataset({ ...body, fixtures: [missing] }); assert.equal(accepted.fixtures[0].forecasts.ai, null);
  error(() => createEvaluationDataset({ ...body, fixtures: [{ ...row, forecasts: { ...row.forecasts, ai: { ...row.forecasts.ai, modelVersionId: null } } }] }), "invalid-dataset");
  error(() => createEvaluationDataset({ ...body, fixtures: [{ ...row, forecasts: { ...row.forecasts, "api-football": { ...row.forecasts["api-football"], markets: row.forecasts.ai.markets } } }] }), "invalid-dataset");
  error(() => createEvaluationDataset({ ...body, fixtures: [{ ...row, unavailableReasons: { ...row.unavailableReasons, ai: "missing-despite-present-forecast" } }] }), "leakage");
});

test("unknown revisions, unverified period claims and invented extra fields fail structural validation", () => {
  const body = configuration(), row = evaluationFixture(), history = evaluationHistory();
  for (const changed of [{ ...body, version: 2 }, { ...body, mode: "real-live-without-proof" }, { ...body, privateKey: "secret" },
    { ...body, fixtures: [{ ...row, result: { ...row.result, context: { ...row.result.context, regulationScore: { verified: true, period: "including-extra-time", home: 2, away: 1 } } } }] },
    { ...body, history: [{ ...history, homeTeamId: history.awayTeamId }] }, { ...body, history: [{ ...history, availableAt: history.kickoffAt - 1 }] },
    { ...body, history: [{ ...history, observationHash: evaluationHash("x").toUpperCase() }] }]) {
    error(() => createEvaluationDataset(changed), "invalid-dataset");
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { evaluateIntelligenceWalkForward } from "../src/server/intelligence/walk-forward-evaluation.ts";
import { intelligenceFixture, intelligenceHistory, intelligenceResult, INTELLIGENCE_DAY } from "./helpers/intelligence-fixtures.mjs";

function entries() {
  return Array.from({ length: 3 }, (_, i) => {
    const first = intelligenceFixture(), fixture = intelligenceFixture({ fixtureId: `synthetic-test-${i}`,
      forecastAt: first.forecastAt + i * 3 * INTELLIGENCE_DAY, kickoffAt: first.kickoffAt + i * 3 * INTELLIGENCE_DAY });
    return { fixture, status: "settled", result: intelligenceResult(fixture) };
  });
}
const run = (overrides = {}) => evaluateIntelligenceWalkForward({ mode: "synthetic", fixtures: entries(), history: intelligenceHistory(), verifyHistory: () => true, ...overrides });

test("walk-forward reconstructs local forecasts and reports absent provider comparison as unavailable", () => {
  const report = run();
  assert.equal(report.fixtures, 3); assert.equal(report.predictiveAccuracyEstablished, false); assert.equal(report.publicationAuthorized, false);
  assert.ok(report.limitations.some((line) => line.includes("Synthetic")));
  const local = report.cells.find((cell) => cell.system === "local" && cell.family === "match-result");
  assert.equal(local.available, 3); assert.equal(local.metrics.count, 3); assert.ok(Number.isFinite(local.metrics.brier));
  const provider = report.cells.find((cell) => cell.system === "provider" && cell.family === "match-result");
  assert.equal(provider.available, 0); assert.equal(provider.metrics.brier, null);
  const ensemble = report.cells.find((cell) => cell.system === "ensemble" && cell.family === "match-result");
  assert.equal(ensemble.available, 0); assert.equal(ensemble.metrics.brier, null);
  assert.ok(report.forecasts.every((forecast) => forecast.publish === false));
});

test("future results never alter earlier forecasts and row input order is irrelevant", () => {
  const fixtureRows = entries(), history = intelligenceHistory(), baseline = run({ fixtures: fixtureRows, history });
  const futureResult = intelligenceResult(intelligenceFixture({ fixtureId: "future", kickoffAt: fixtureRows[2].fixture.kickoffAt + INTELLIGENCE_DAY }), { homeGoals: 20 });
  const changed = run({ fixtures: [...fixtureRows].reverse(), history: [...history, futureResult] });
  assert.deepEqual(changed.forecasts, baseline.forecasts);
  assert.deepEqual(changed.cells, baseline.cells);
  assert.ok(baseline.forecasts[1].components.local.historyIds.includes(fixtureRows[0].result.observationHash));
  assert.ok(!baseline.forecasts[0].components.local.historyIds.includes(fixtureRows[0].result.observationHash));
});

test("pending, cancelled and void remain distinct and do not become losses", () => {
  const statuses = ["pending", "cancelled", "void"];
  const report = run({ fixtures: entries().map((entry, i) => ({ ...entry, status: statuses[i], result: null })) });
  const cell = report.cells.find((value) => value.system === "local" && value.family === "match-result");
  assert.equal(cell.pending, 1); assert.equal(cell.cancelled, 1); assert.equal(cell.void, 1); assert.equal(cell.metrics.count, 0);
});

test("evaluation rejects unknown result provenance, duplicate targets and forecasts beyond lock", () => {
  assert.throws(() => run({ verifyHistory: () => false }), /Unverified/);
  const rows = entries();
  assert.throws(() => run({ fixtures: [...rows, rows[0]] }), /Duplicate/);
  assert.throws(() => run({ fixtures: [{ ...rows[0], fixture: { ...rows[0].fixture, forecastAt: rows[0].fixture.kickoffAt } }] }), /post-lock/);
  assert.throws(() => run({ fixtures: [{ ...rows[0], status: "unknown-status" }] }), /Unknown evaluation status/);
});

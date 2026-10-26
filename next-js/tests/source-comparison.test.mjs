import assert from "node:assert/strict";
import test from "node:test";
import { compareSources } from "../src/server/comparison/source-comparison.ts";
import { COMPARISON_KICKOFF, comparisonOptions, comparisonReceipts, comparisonRecord, finished, scheduled } from "./helpers/source-comparison-fixtures.mjs";

// Synthetic receipts only. These pairs check arithmetic and accounting, not the quality of any real source.
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-12, `${actual} != ${expected}`);
function cohort() {
  const records = [
    comparisonRecord(1), // A: both home win; the result is a home win.
    comparisonRecord(2, { settlement: finished(1, 1) }), // B: AI away, provider home; a draw.
    comparisonRecord(3, { settlement: scheduled() }), // C: both available, not played yet.
    comparisonRecord(4, { state: "void" }), comparisonRecord(5, { order: null }), comparisonRecord(6), // void, legacy, denied stage
    comparisonRecord(7), comparisonRecord(8), // G: provider unavailable; H: AI unavailable.
    comparisonRecord(9, { state: "open" }),
  ];
  const job = (index) => records[index].locked?.jobId;
  const receipts = new Map([
    [job(0), comparisonReceipts({ ai: { "home-win": 0.5, draw: 0.3, "away-win": 0.2 }, provider: { "home-win": 0.4, draw: 0.3, "away-win": 0.3 },
      evidence: { conflicting: true, limitedNews: false } })],
    [job(1), comparisonReceipts({ ai: { "home-win": 0.2, draw: 0.3, "away-win": 0.5 }, provider: { "home-win": 0.5, draw: 0.3, "away-win": 0.2 },
      evidence: { conflicting: false, limitedNews: true } })],
    [job(2), comparisonReceipts({ ai: { "home-win": 0.5, draw: 0.3, "away-win": 0.2 }, provider: { "home-win": 0.4, draw: 0.3, "away-win": 0.3 } })],
    [job(5), "not-captured"],
    [job(6), comparisonReceipts({ ai: { "home-win": 0.5, draw: 0.3, "away-win": 0.2 }, provider: null })],
    [job(7), comparisonReceipts({ ai: null, provider: { "home-win": 0.4, draw: 0.3, "away-win": 0.3 } })],
  ]);
  return { records, receipts };
}

test("only pairs with both sources available and settled are matched, and coverage reconciles every locked cycle", () => {
  const { records, receipts } = cohort(), value = compareSources(records, receipts, comparisonOptions());
  assert.deepEqual(value.orders, { "provider-first": 6, "ai-first": 0, none: 1 });
  const result = value.comparisons.find((entry) => entry.family === "match-result");
  assert.deepEqual(result.coverage, { locked: 7, void: 1, notCaptured: 2, captured: 5, aiAvailable: 4, providerAvailable: 4,
    both: 3, aiOnly: 1, providerOnly: 1, neither: 0, pending: 1, settled: 2 });
  const coverage = result.coverage;
  assert.equal(coverage.locked, coverage.notCaptured + coverage.captured);
  assert.equal(coverage.captured, coverage.both + coverage.aiOnly + coverage.providerOnly + coverage.neither);
  assert.equal(coverage.both, coverage.pending + coverage.settled);
  assert.equal(result.state, "available"); assert.equal(result.reason, null); assert.equal(result.matched.count, 2);
});

test("hand-computed Brier and log loss per source, with differences as AI minus API-Football", () => {
  const { records, receipts } = cohort(), result = compareSources(records, receipts, comparisonOptions()).comparisons[0];
  // A (home win): AI 0.25+0.09+0.04, provider 0.36+0.09+0.09. B (draw): both 0.78.
  approximately(result.matched.ai.brier, (0.38 + 0.78) / 2); approximately(result.matched["api-football"].brier, (0.54 + 0.78) / 2);
  approximately(result.matched.brierDifference, -0.08);
  approximately(result.matched.ai.logLoss, (-Math.log(0.5) - Math.log(0.3)) / 2);
  approximately(result.matched.logLossDifference, Math.log(0.8) / 2);
  assert.equal(result.matched.ai.hitRate, 0.5); assert.equal(result.matched["api-football"].hitRate, 0.5);
  assert.ok(result.matched.hitRateIntervals.ai.lower < 0.5 && result.matched.hitRateIntervals.ai.upper > 0.5);
  // Disagreement subset: only B, where neither prediction was correct.
  assert.equal(result.disagreements.count, 1); assert.equal(result.disagreements.aiCorrect, 0); assert.equal(result.disagreements.providerCorrect, 0);
  approximately(result.disagreements.brierDifference, 0);
  // Evidence segments from the AI receipt flags.
  assert.equal(result.segments.conflictingEvidence.count, 1); approximately(result.segments.conflictingEvidence.brierDifference, -0.16);
  assert.equal(result.segments.limitedNews.count, 1); approximately(result.segments.limitedNews.brierDifference, 0);
});

test("goal markets have no provider counterpart and double chance is labelled derived, not a separate sample", () => {
  const { records, receipts } = cohort(), value = compareSources(records, receipts, comparisonOptions());
  for (const family of ["total-goals", "both-teams-to-score"]) {
    const entry = value.comparisons.find((item) => item.family === family);
    assert.deepEqual([entry.state, entry.reason], ["unavailable", "no-provider-counterpart"]);
    assert.equal(entry.coverage.providerAvailable, 0); assert.equal(entry.coverage.aiAvailable, 4); assert.equal(entry.matched.count, 0);
    assert.equal(entry.matched.brierDifference, null);
  }
  const chance = value.comparisons.find((item) => item.family === "double-chance");
  assert.equal(chance.derivedFrom, "match-result"); assert.equal(chance.matched.count, value.comparisons[0].matched.count);
  assert.equal(value.comparisons[0].derivedFrom, null);
});

test("matched keys hash and metrics do not depend on record order; nothing is matched without receipts", () => {
  const { records, receipts } = cohort();
  const forward = compareSources(records, receipts, comparisonOptions()), reverse = compareSources([...records].reverse(), receipts, comparisonOptions());
  assert.equal(forward.comparisons[0].matched.fixtureKeysHash, reverse.comparisons[0].matched.fixtureKeysHash);
  assert.deepEqual(forward.comparisons, reverse.comparisons); assert.deepEqual(forward.recent, reverse.recent);
  const empty = compareSources(records, new Map(), comparisonOptions()).comparisons[0];
  assert.deepEqual([empty.state, empty.reason, empty.matched.count, empty.coverage.notCaptured], ["unavailable", "no-matched-settled-pairs", 0, 7]);
  assert.equal(empty.matched.ai.brier, null);
});

test("horizons use kickoff minus the shared stage clock, and only AI gates on the API-Football baseline apply", () => {
  const { records, receipts } = cohort();
  const late = records.map((record, index) => index === 1 ? { ...record, locked: { ...record.locked, forecastAt: record.kickoffAt - 30 * 3_600_000 } } : record);
  const horizons = [{ id: "same-day", minimumMs: 0, maximumMs: 12 * 3_600_000 }, { id: "day-ahead", minimumMs: 12 * 3_600_000, maximumMs: 48 * 3_600_000 }];
  const gate = { id: "synthetic-ai-against-provider", purpose: "candidate", system: "ai", family: "match-result", horizonId: "same-day",
    minimumSamples: 1, minimumCoverage: 0, maximumBrier: null, maximumLogLoss: null, maximumCalibrationError: null,
    baseline: "api-football", maximumBrierDifference: 0 };
  const value = compareSources(late, receipts, comparisonOptions({ families: ["match-result"], horizons,
    gates: [gate, { ...gate, id: "synthetic-other-baseline", baseline: "team-strength" }, { ...gate, id: "synthetic-strict", minimumSamples: 2 }] }));
  const [sameDay, dayAhead] = value.comparisons;
  assert.deepEqual([sameDay.horizonId, sameDay.matched.count, dayAhead.horizonId, dayAhead.matched.count], ["same-day", 1, "day-ahead", 1]);
  assert.deepEqual(sameDay.gates.map((entry) => [entry.id, entry.diagnostic]), [["synthetic-ai-against-provider", "passed"], ["synthetic-strict", "pending"]]);
  assert.deepEqual(dayAhead.gates, []);
});

test("recent matched predictions are the newest twenty with both match results, each with its own settled outcome", () => {
  const { records, receipts } = cohort(), recent = compareSources(records, receipts, comparisonOptions()).recent;
  assert.deepEqual(recent.map((pair) => pair.matchLabel), ["Home 1 v Away 1", "Home 2 v Away 2", "Home 3 v Away 3"]);
  assert.deepEqual([recent[1].ai.selection, recent[1].ai.outcome, recent[1]["api-football"].selection, recent[1]["api-football"].outcome],
    ["away-win", "incorrect", "home-win", "incorrect"]);
  assert.equal(recent[2].ai.outcome, "pending"); assert.equal(recent[0].published, "api-football"); assert.equal(recent[0].kickoffAt, COMPARISON_KICKOFF - 86_400_000);
  const many = Array.from({ length: 25 }, (_, index) => comparisonRecord(20 + index));
  const all = new Map(many.map((record) => [record.locked.jobId, comparisonReceipts({ ai: { "home-win": 0.5, draw: 0.3, "away-win": 0.2 },
    provider: { "home-win": 0.4, draw: 0.3, "away-win": 0.3 } })]));
  assert.equal(compareSources(many, all, comparisonOptions()).recent.length, 20);
});

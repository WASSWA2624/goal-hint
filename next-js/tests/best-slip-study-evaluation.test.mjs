import test from "node:test";
import assert from "node:assert/strict";
import { bestSlipCombinationIdentity } from "../src/domain/best-slips.ts";
import { sealBestSlipStudyCapture, sealBestSlipStudyReceipt } from "../src/server/slips/best-slip-study-contract.ts";
import { evaluateBestSlipStudy } from "../src/server/slips/best-slip-study-evaluation.ts";
import { editorialFixtureId, pricedEditorialSelection } from "./helpers/best-slip-publication-fixtures.mjs";

const dayMs = 86_400_000;
const scopeHash = "a".repeat(64);
const first = Date.parse("2026-08-01T07:00:00Z");
const windows = { fitFrom: "2026-08-01", fitUntil: "2026-08-28", holdoutFrom: "2026-09-01", holdoutUntil: "2026-09-27" };
const assessedAt = Date.parse("2026-09-27T09:00:00Z");

function editorialLeg(index, at) {
  const selection = pricedEditorialSelection(index, { odds: "1.70", probability: 0.75, at, kickoffAt: at + 3 * 3_600_000 });
  return { ...selection, homeTeam: { ...selection.homeTeam, id: editorialFixtureId(10000 + index * 2) },
    awayTeam: { ...selection.awayTeam, id: editorialFixtureId(10001 + index * 2) } };
}

function capture(at, index, count = 3, props = {}) {
  const slates = Array.from({ length: count }, (_, offset) => {
    const selections = [editorialLeg(index * 10 + offset * 2, at), editorialLeg(index * 10 + offset * 2 + 1, at)];
    return { band: "1.5-5", slip: { id: bestSlipCombinationIdentity(selections), totalOdds: "2.89", oddsBasis: "bookmaker",
      averageProbability: 0.75, selections } };
  });
  return sealBestSlipStudyCapture({ observedAt: at, capturedAt: at + 1, scopeHash, examined: 20, eligible: count * 2,
    searchLimited: false, partialCoverage: false, slates, ...props });
}

function receipt(value, outcomes, observedAt = value.capturedAt + 6 * 3_600_000) {
  return sealBestSlipStudyReceipt({ captureHash: value.hash, observedAt, outcomes: value.slates.map(({ slip }, index) =>
    ({ slipId: slip.id, outcome: outcomes[index] })) });
}

function evaluate(captures, receipts, options = {}) {
  return evaluateBestSlipStudy({ captures, receipts, windows, scopeHash, assessedAt, ...options });
}

test("study fits only on earlier whole-slip outcomes and reports independent clustered holdout scores", () => {
  const fit = Array.from({ length: 20 }, (_, i) => capture(first + i * dayMs, i + 1));
  const holdout = Array.from({ length: 20 }, (_, i) => capture(first + (31 + i) * dayMs, 50 + i));
  const mature = (group) => group.map((value, i) => receipt(value, ["won", "won", i % 3 === 0 ? "won" : "lost"]));
  const result = evaluate([...holdout, ...fit], [...mature(holdout), ...mature(fit)]);
  assert.equal(result.status, "evaluated");
  assert.equal(result.approvedForPublication, false);
  assert.equal(result.fit.decisiveDays, 20);
  assert.equal(result.holdout.decisive, 60);
  const [stratum] = result.strata;
  assert.ok(stratum.offset > 0);
  assert.equal(stratum.metrics.product.average, 0.5625);
  assert.ok(stratum.metrics.candidate.average >= 0.5 && stratum.metrics.candidate.average <= 0.75);
  assert.ok(stratum.metrics.candidate.brier < stratum.metrics.product.brier);
  assert.ok(stratum.metrics.candidate.logLoss < stratum.metrics.product.logLoss);
  assert.equal(stratum.metrics.candidateMinusProductBrier.days, 20);
  assert.ok(stratum.metrics.candidateMinusProductBrier.lower <= stratum.metrics.candidateMinusProductBrier.mean);
  const allLoss = holdout.map((value) => receipt(value, ["lost", "lost", "lost"]));
  const changedHoldout = evaluate([...fit, ...holdout], [...mature(fit), ...allLoss]);
  assert.equal(changedHoldout.status, "insufficient");
  assert.equal(changedHoldout.strata[0].offset, stratum.offset);
  assert.equal(changedHoldout.fit.artifactHash, result.fit.artifactHash);
  assert.notEqual(changedHoldout.holdout.evidenceHash, result.holdout.evidenceHash);
});

test("latest complete evidence before each closed Kampala boundary wins; late results and replacements supply no labels", () => {
  const original = capture(first, 4, 1);
  const repeatedFixture = capture(first + 31 * dayMs, 4, 1);
  const missing = capture(first + 32 * dayMs, 55, 1);
  const fitBoundary = Date.parse("2026-08-27T21:00:00Z");
  const holdoutBoundary = Date.parse("2026-09-26T21:00:00Z");
  const results = [
    receipt(original, ["won"], original.capturedAt + 8 * 3_600_000),
    receipt(original, ["pending"], fitBoundary - 1),
    receipt(original, ["lost"], fitBoundary),
    receipt(missing, ["won"], holdoutBoundary + 1),
    receipt(repeatedFixture, ["lost"]),
  ];
  const report = evaluate([original, repeatedFixture, missing], results);
  assert.equal(report.status, "insufficient");
  assert.equal(report.fit.pending, 1);
  assert.equal(report.fit.won + report.fit.lost, 0);
  assert.equal(report.holdout.duplicateFixtures, 1);
  assert.equal(report.holdout.missingReceipt, 1);
  assert.equal(report.holdout.won + report.holdout.lost, 0);
});

test("first daily slate and incomplete-cohort counts are fixed before labels", () => {
  const earlier = capture(first, 1, 0);
  const later = capture(first + 3_600_000, 2, 1);
  const incomplete = capture(first + dayMs, 3, 1, { partialCoverage: true });
  const truncated = capture(first + 2 * dayMs, 4, 1, { searchLimited: true });
  const report = evaluate([later, incomplete, truncated, earlier],
    [receipt(later, ["won"]), receipt(incomplete, ["won"]), receipt(truncated, ["lost"])]);
  assert.equal(report.fit.capturedDays, 3);
  assert.equal(report.fit.daysWithSlate, 2);
  assert.equal(report.fit.extraCaptures, 1);
  assert.equal(report.fit.partialCoverageDays, 1);
  assert.equal(report.fit.truncatedDays, 1);
  assert.equal(report.fit.slates, 2);
  assert.equal(report.fit.unscannedSlates, 2);
  assert.equal(report.fit.decisive, 0);
});

test("scope changes, incomplete or conflicting receipt memberships, tampering and overlapping windows fail closed", () => {
  const original = capture(first, 1, 2);
  const label = receipt(original, ["lost", "won"]);
  const incomplete = sealBestSlipStudyReceipt({ captureHash: original.hash, observedAt: label.observedAt,
    outcomes: [label.outcomes[0]] });
  const conflicting = receipt(original, ["won", "won"], label.observedAt);
  const wrongScope = capture(first, 2, 1, { scopeHash: "b".repeat(64) });
  assert.throws(() => evaluate([wrongScope], []), /identity/u);
  assert.throws(() => evaluate([], [label]), /identity/u);
  assert.throws(() => evaluate([original], [incomplete]), /membership/u);
  assert.throws(() => evaluate([original], [label, conflicting]), /identity/u);
  assert.throws(() => evaluate([original], [{ ...label, observedAt: label.observedAt + 1 }]), /seal/u);
  assert.throws(() => evaluate([], [], { windows: { ...windows, holdoutFrom: "2026-08-27" } }), /window/u);
  assert.throws(() => evaluate([], [], { assessedAt: Date.parse("2026-09-26T20:59:59.999Z") }), /window/u);
});

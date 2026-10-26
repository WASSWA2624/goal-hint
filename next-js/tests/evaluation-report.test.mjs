import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { createEvaluationHarness } from "../src/server/evaluation/evaluation-service.ts";
import { createEvaluationReadinessReport, parseEvaluationReport, renderEvaluationReadinessReport, renderEvaluationReport } from "../src/server/evaluation/evaluation-report.ts";
import { evaluationAuthority, evaluationDataset, evaluationFixture, evaluationProtocol } from "./helpers/evaluation-fixtures.mjs";

// Only synthetic fixtures and approvals exercise this report format.
function fixture(dataset = evaluationDataset(), protocol = evaluationProtocol()) {
  return { protocol, dataset, report: createEvaluationHarness({ authority: evaluationAuthority(), maxRows: 1000, maxBytes: 67_108_864 }).evaluate({ protocol, dataset, split: "finalTest" }) };
}
test("a deterministic synthetic report exposes cohorts, gate criteria and pending quality qualification", () => {
  const { protocol, report } = fixture(), markdown = renderEvaluationReport(report, protocol);
  assert.equal(parseEvaluationReport(report).id, report.id);
  assert.equal(renderEvaluationReport(report, protocol), markdown);
  for (const phrase of ["Synthetic observations verify software contracts only", "Selected rows: 1", "Public claim authorized: false", "## Matched comparisons", "source-comparison", "Minimum N / coverage", "## Reliability bands", "Wilson", "day-ahead", "api-football", "team-strength"]) assert.ok(markdown.includes(phrase), phrase);
  assert.match(markdown, /candidate \/ ai \/ match-result \/ day-ahead/u);
  assert.ok(report.gates.every((gate) => gate.status === "pending"));
  assert.equal(markdown.includes("synthetic-evaluation-football-proof"), false);
  assert.equal(markdown.includes("synthetic-evaluation-provider-receipt-proof"), false);
});
test("empty metrics are pending and free-form private unavailable reasons are withheld from Markdown", () => {
  const dataset = evaluationDataset({ fixtures: [evaluationFixture({ forecasts: { ai: null }, unavailableReasons: { ai: "synthetic-private-source-detail-token" } })] });
  const { protocol, report } = fixture(dataset), markdown = renderEvaluationReport(report, protocol);
  assert.equal(markdown.includes("synthetic-private-source-detail-token"), false);
  assert.match(markdown, /ai: forecast unavailable; the private dataset retains the reason/u);
  assert.match(markdown, /\| ai \| match-result \| day-ahead \| none \| 1 \| 0 \| 1 \| 0 \| 0 \| 0/u);
  assert.match(markdown, /pending/u);
});
test("report parsing rejects changed hashes, unknown fields and altered frozen gate identity", () => {
  const { report } = fixture();
  for (const changed of [{ ...report, selectedRows: 2 }, { ...report, hash: "0".repeat(64) }, { ...report, privateContents: "synthetic-secret" },
    { ...report, gates: report.gates.map((gate, index) => index === 0 ? { ...gate, id: "changed-gate" } : gate) }]) assert.throws(() => parseEvaluationReport(changed));
  assert.throws(() => renderEvaluationReport(report, evaluationProtocol({ name: "synthetic-other-protocol" })));
});
test("readiness is reproducible factual zero evidence and cannot become an accuracy claim", () => {
  const first = createEvaluationReadinessReport(), second = createEvaluationReadinessReport();
  assert.deepEqual(first, second); assert.equal(first.actualForecastObservations, 0); assert.equal(first.dispatchedLiveRequests, 0);
  assert.equal(first.measuredAccuracy, null); assert.equal(first.calibrationQualified, false); assert.equal(first.publicClaimAuthorized, false);
  assert.equal(first.promotionPerformed, false); assert.equal(first.historicalAiComparison, "unavailable");
  const { id, hash, ...body } = first; assert.equal(id, hash); assert.equal(evidenceFingerprint(body), id);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.pending));
  const markdown = renderEvaluationReadinessReport(first);
  assert.match(markdown, /Actual forecast observations in this report: 0/u);
  assert.match(markdown, /OP-16/u); assert.match(markdown, /prospective shadow/u);
  assert.throws(() => renderEvaluationReadinessReport({ ...first, actualForecastObservations: 10 }));
});

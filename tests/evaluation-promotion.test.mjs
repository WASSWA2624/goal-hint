import assert from "node:assert/strict";
import test from "node:test";
import { marketRules, validateMarketSnapshot } from "../src/domain/markets.ts";
import { createEvaluationHarness } from "../src/server/evaluation/evaluation-service.ts";
import { aiPromotionReference } from "../src/server/evaluation/evaluation-promotion.ts";
import { parseEvaluationReport, renderEvaluationReport } from "../src/server/evaluation/evaluation-report.ts";
import { evaluationAuthority, evaluationDataset, evaluationFixture, evaluationProtocol,
  evaluationProtocolConfiguration } from "./helpers/evaluation-fixtures.mjs";

// Synthetic reports only: a printed reference is never an approval and the harness never promotes.
const stronger = validateMarketSnapshot({
  "match-result": { source: "ai", period: marketRules.period, probabilities: { "home-win": 0.7, draw: 0.2, "away-win": 0.1 } },
  "total-goals": { source: "ai", period: marketRules.period, line: 2.5, probabilities: { "over-2.5": 0.6, "under-2.5": 0.4 } },
  "both-teams-to-score": { source: "ai", period: marketRules.period, probabilities: { yes: 0.6, no: 0.4 } } });
function gates(maximumBrierDifference) {
  return evaluationProtocolConfiguration().gates.map((gate) => ({ ...gate, minimumSamples: 1,
    ...(gate.purpose === "candidate" && gate.system === "ai" && gate.family === "match-result" ? { baseline: "api-football", maximumBrierDifference } : {}) }));
}
function report({ mode = "prospective", split = "finalTest", maximumBrierDifference = -0.1, markets = stronger, protocolOverrides = {} } = {}) {
  const protocol = evaluationProtocol({ gates: gates(maximumBrierDifference), ...protocolOverrides });
  const dataset = evaluationDataset({ mode, fixtures: [evaluationFixture({ forecasts: { ai: { markets } } })] });
  const value = createEvaluationHarness({ authority: evaluationAuthority(), maxRows: 1000, maxBytes: 2_000_000 }).evaluate({ protocol, dataset, split });
  return { protocol, value };
}

test("a prospective final test whose AI match result beats the matched provider prints a model-bound reference", () => {
  const { protocol, value } = report();
  assert.equal(value.decision, "eligible-for-independent-review");
  const gate = value.gates.find((entry) => entry.criteria.baseline === "api-football");
  assert.equal(gate.status, "passed");
  assert.equal(aiPromotionReference(value, protocol), `forecast-evaluation:${value.hash}:${value.candidateModelId}`);
  assert.equal(value.promotionPerformed, false); assert.equal(value.publicClaimAuthorized, false);
  // The archived report keeps the provider baseline criteria it was gated on.
  assert.equal(parseEvaluationReport(value).id, value.id);
  assert.match(renderEvaluationReport(value, protocol), /api-football/u);
});

test("no reference without prospective final-test evidence that strictly beats the current provider contract at every horizon", () => {
  const { protocol, value } = report();
  assert.equal(aiPromotionReference({ ...value, mode: "synthetic" }, protocol), null);
  assert.equal(aiPromotionReference({ ...value, split: "validation" }, protocol), null);
  assert.equal(aiPromotionReference({ ...value, decision: "remain-provisional" }, protocol), null);
  assert.equal(aiPromotionReference({ ...value, providerContractVersion: "synthetic-older-contract" }, protocol), null);
  assert.equal(aiPromotionReference({ ...value, candidateModelId: null }, protocol), null);
  assert.equal(aiPromotionReference(value, { ...protocol, id: "0".repeat(64) }), null);
  assert.equal(aiPromotionReference(value, { ...protocol, horizons: [...protocol.horizons, { id: "week-ahead", minimumMs: 48 * 3_600_000, maximumMs: 168 * 3_600_000 }] }), null);
  // A gate that tolerates a tie or a loss against the provider never promotes, even when it passes.
  const tolerant = report({ maximumBrierDifference: 0 });
  assert.equal(tolerant.value.decision, "eligible-for-independent-review");
  assert.equal(aiPromotionReference(tolerant.value, tolerant.protocol), null);
  // The fixture's default AI match result loses to the provider, so the strict gate fails.
  const weaker = report({ markets: evaluationFixture().forecasts.ai.markets });
  assert.equal(weaker.value.gates.find((entry) => entry.criteria.baseline === "api-football").status, "failed");
  assert.equal(aiPromotionReference(weaker.value, weaker.protocol), null);
  const synthetic = report({ mode: "synthetic" });
  assert.equal(aiPromotionReference(synthetic.value, synthetic.protocol), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { liveAiAccountingWindow, liveAiAccountId, liveAiModel, liveAiRate } from "../src/server/live/live-ai-model.ts";
import { parseCostRate } from "../src/server/cost-control/cost-input.ts";
import { priceCost } from "../src/server/cost-control/cost-pricing.ts";

const policy = (overrides = {}) => parseRuntimePolicy({ GOAL_HINT_AI_PROVIDER: "openai", GOAL_HINT_AI_MODEL: "gpt-6.1-sol",
  GOAL_HINT_CALIBRATION_REF: "synthetic-provisional-ai", GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-ai-account", ...overrides });
const now = Date.parse("2026-10-13T08:00:00Z");

test("live model pins the reviewed contract and remains explicitly provisional", () => {
  const model = liveAiModel(policy());
  assert.equal(model.id, liveAiModel(policy()).id);
  assert.equal(model.providerModelVersion, "gpt-6.1-sol");
  assert.equal(model.calibration.kind, "none"); assert.equal(model.evaluation.status, "provisional");
  assert.equal(model.outputTiming.basis, "retrieved"); assert.equal(model.outputTiming.unknownGeneration, "allow-flagged");
  assert.notEqual(model.id, liveAiModel(policy({ GOAL_HINT_CALIBRATION_REF: "synthetic-new-config" })).id);
  assert.throws(() => liveAiModel(policy({ GOAL_HINT_AI_MODEL: "unreviewed-model" })), /not reviewed/);
});

test("reviewed Standard rates reserve cache-write surcharge and exclude long contexts", () => {
  const rate = parseCostRate(liveAiRate(liveAiModel(policy()), now));
  assert.equal(priceCost(rate, { requests: 1, inputTokens: 1000, outputTokens: 1000, billedUnits: 1000 }), 12_500_000_000n);
  assert.equal(rate.model, "gpt-6.1-sol"); assert.equal(rate.billingRule, "measured-usage");
  assert.equal(liveAiModel(policy()).bounds.maxInputBytes < 272_000, true);
});

test("ledger months handle rollover and account identity survives credential rotation", () => {
  assert.deepEqual(liveAiAccountingWindow(now), { startsAt: Date.parse("2026-10-01T00:00:00Z"),
    endsAt: Date.parse("2026-11-01T00:00:00Z"), name: "2026-10" });
  assert.equal(liveAiAccountingWindow(Date.parse("2026-12-31T23:59:59Z")).endsAt, Date.parse("2027-01-01T00:00:00Z"));
  assert.equal(liveAiAccountId(policy({ AI_API_KEY: "synthetic-key-one" })), liveAiAccountId(policy({ AI_API_KEY: "synthetic-key-two" })));
});

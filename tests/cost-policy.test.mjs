import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createPolicyCostService } from "../src/server/cost-control/cost-policy.ts";
import { memoryCostStore } from "./helpers/cost-memory-store.mjs";
import { COST_NOW, USD, costPeriod, costJob, costRate, costRequest, syntheticCostAuthority } from "./helpers/cost-fixtures.mjs";

// Synthetic references/rates exercise local policy binding and authorize no live account.
const syntheticSettings = {
  NODE_ENV: "development", GOAL_HINT_OPERATION_SCOPE: "trial",
  GOAL_HINT_AI_ENABLED: "true", AI_API_KEY: "synthetic-ai-key",
  GOAL_HINT_AI_PROVIDER: "synthetic-provider", GOAL_HINT_AI_MODEL: "synthetic-model",
  GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS: "1000",
  GOAL_HINT_RESEARCH_ENABLED: "true", RESEARCH_API_KEY: "synthetic-research-key",
  GOAL_HINT_RESEARCH_PROVIDER: "synthetic-provider", GOAL_HINT_RESEARCH_LICENSE_REF: "synthetic-research-license",
  GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS: "500", GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget-approval",
  GOAL_HINT_JOB_REQUEST_LIMIT: "4", GOAL_HINT_JOB_TOKEN_LIMIT: "1000", GOAL_HINT_JOB_TIMEOUT_SECONDS: "60",
};
function allocation() {
  return { ai: { costCapUsdPicos: 2n * USD, requestLimit: 2, inputTokenLimit: 400, outputTokenLimit: 200,
    billedUnitLimit: 10, primaryTimeLimitMs: 30_000 }, research: { costCapUsdPicos: USD, requestLimit: 2,
    inputTokenLimit: 0, outputTokenLimit: 0, billedUnitLimit: 10, primaryTimeLimitMs: 25_000 },
  fallbackReserveMs: 5000, evidenceRef: "synthetic-joint-job-allocation" };
}
function scenario(label, options = {}) {
  const category = options.category ?? "ai", clock = { value: COST_NOW }, store = memoryCostStore(clock);
  const policy = options.policy ?? parseRuntimePolicy({ ...syntheticSettings, ...options.settings });
  const assigned = options.allocation === undefined ? allocation() : options.allocation;
  const period = costPeriod(label, category, { capUsdPicos: (category === "ai" ? 10n : 5n) * USD });
  const rate = costRate(category);
  const service = createPolicyCostService({ accountId: period.accountId, category, store,
    authority: syntheticCostAuthority(options.authority), rateFor: options.rateFor ?? (() => rate),
    runtimePolicy: policy, verifyEvidence: options.verifyEvidence ?? (() => true),
    allocation: assigned, verifyAllocation: options.verifyAllocation ?? (() => true) });
  function job(label = "default", overrides = {}) {
    const assignedCategory = assigned?.[category] ?? allocation()[category];
    return costJob(period, `${label}:${category}`, { costCapUsdPicos: assignedCategory.costCapUsdPicos,
      requestLimit: assignedCategory.requestLimit, inputTokenLimit: assignedCategory.inputTokenLimit,
      outputTokenLimit: assignedCategory.outputTokenLimit, billedUnitLimit: assignedCategory.billedUnitLimit,
      timeLimitMs: assignedCategory.primaryTimeLimitMs + (assigned?.fallbackReserveMs ?? 5000),
      fallbackReserveMs: assigned?.fallbackReserveMs ?? 5000, ...overrides });
  }
  return { clock, store, policy, assigned, period, rate, service, job };
}
const denied = (reason) => ({ status: "denied", reason });

test("verified joint allocation binds both categories to their selected budgets and bounded calls", async () => {
  for (const category of ["ai", "research"]) {
    const s = scenario(`allowed-${category}`, { category });
    assert.deepEqual(await s.service.initialize(s.period), { status: "initialized" });
    const job = s.job();
    const decision = await s.service.reserve(job, costRequest(job, `allowed-${category}`));
    assert.equal(decision.status, "reserved");
    assert.deepEqual(await s.service.markDispatched(decision.permit), { status: "claimed", timeoutMs: 1000 });
  }
});

test("missing, malformed and unverified joint allocations authorize no paid ledger", async () => {
  for (const assigned of [null, {}, { ...allocation(), fallbackReserveMs: 0 }, { ...allocation(), prompts: "private prompt" }]) {
    const s = scenario("missing-allocation", { allocation: assigned });
    assert.deepEqual(await s.service.initialize(s.period), denied("unverified-policy"));
  }
  const unverified = scenario("unverified-allocation", { verifyAllocation: () => false });
  assert.deepEqual(await unverified.service.initialize(unverified.period), denied("unverified-policy"));
});

test("joint request/token/primary-time allocations cannot independently consume the whole global ceiling", async () => {
  const overallocated = [
    { ...allocation(), ai: { ...allocation().ai, requestLimit: 4 } },
    { ...allocation(), ai: { ...allocation().ai, inputTokenLimit: 900 } },
    { ...allocation(), research: { ...allocation().research, primaryTimeLimitMs: 30_000 } },
  ];
  for (const assigned of overallocated) {
    const s = scenario("overallocated", { allocation: assigned });
    assert.deepEqual(await s.service.initialize(s.period), denied("unverified-policy"));
  }
});

test("each job must fit its category allocation and reserve the exact approved fallback time", async () => {
  const s = scenario("job-allocation");
  assert.equal((await s.service.initialize(s.period)).status, "initialized");
  const violations = [
    { costCapUsdPicos: 3n * USD }, { requestLimit: 3 }, { inputTokenLimit: 401 }, { outputTokenLimit: 201 },
    { billedUnitLimit: 11 }, { fallbackReserveMs: 1 }, { timeLimitMs: 36_000 },
  ];
  for (const [index, override] of violations.entries()) {
    const job = s.job(`violation-${index}`, override);
    assert.deepEqual(await s.service.reserve(job, costRequest(job, `violation-${index}`)), denied("unverified-policy"));
  }
});

test("monthly ledger caps must exactly match runtime cents and retain independent category allowances", async () => {
  const s = scenario("monthly-cap");
  assert.deepEqual(await s.service.initialize({ ...s.period, capUsdPicos: s.period.capUsdPicos + 1n }), denied("unverified-policy"));
  assert.deepEqual(await s.service.initialize({ ...s.period, capUsdPicos: s.period.capUsdPicos - 1n }), denied("unverified-policy"));
  assert.equal((await s.service.initialize(s.period)).status, "initialized");
  const research = scenario("research-cap", { category: "research" });
  assert.deepEqual(await research.service.initialize({ ...research.period, capUsdPicos: s.period.capUsdPicos }), denied("unverified-policy"));
});

test("provider and AI model must match the existing runtime selection", async () => {
  for (const [label, changed] of [["provider", { provider: "another-provider" }], ["model", { model: "another-model" }]]) {
    const s = scenario(label, { rateFor: () => costRate("ai", changed) });
    assert.equal((await s.service.initialize(s.period)).status, "initialized");
    const job = s.job();
    assert.deepEqual(await s.service.reserve(job, costRequest(job, label, changed)), denied("unpriced"));
  }
  const research = scenario("research-model", { category: "research", rateFor: () => costRate("research", { model: "unselected-model" }) });
  assert.equal((await research.service.initialize(research.period)).status, "initialized");
  const job = research.job();
  assert.deepEqual(await research.service.reserve(job, costRequest(job, "research-model", { model: "unselected-model" })), denied("unpriced"));
});

test("paid operation checks enforce test mode, evidence approvals and research licensing on each boundary", async () => {
  const valid = parseRuntimePolicy(syntheticSettings);
  const testMode = scenario("test-mode", { policy: { ...valid, mode: "test" } });
  assert.deepEqual(await testMode.service.initialize(testMode.period), denied("operation-not-authorized"));
  const budget = scenario("budget-evidence", { verifyEvidence: (_reference, requirement) => requirement !== "budget-approval" });
  assert.deepEqual(await budget.service.initialize(budget.period), denied("operation-not-authorized"));
  const license = scenario("license-evidence", { category: "research", verifyEvidence: (_reference, requirement) => requirement !== "research-license" });
  assert.deepEqual(await license.service.initialize(license.period), denied("operation-not-authorized"));
});

test("allocation and runtime evidence revocation invalidate a previously reserved dispatch permit", async () => {
  for (const revoked of ["allocation", "budget"]) {
    let allowed = true;
    const s = scenario(`revocation-${revoked}`, { verifyAllocation: () => revoked === "allocation" ? allowed : true,
      verifyEvidence: () => revoked === "budget" ? allowed : true });
    assert.equal((await s.service.initialize(s.period)).status, "initialized");
    const job = s.job(), decision = await s.service.reserve(job, costRequest(job, `revocation-${revoked}`));
    assert.equal(decision.status, "reserved");
    allowed = false;
    assert.deepEqual(await s.service.markDispatched(decision.permit), denied("operation-not-authorized"));
    allowed = true;
    assert.deepEqual(await s.service.cancelBeforeDispatch(decision.permit), { status: "canceled" });
  }
});

test("allocation snapshots are immutable and research-only zero-token work needs no invented token allowance", async () => {
  const assigned = allocation(), s = scenario("snapshot", { allocation: assigned });
  assigned.ai.requestLimit = 100;
  assigned.fallbackReserveMs = 1;
  assert.equal((await s.service.initialize(s.period)).status, "initialized");
  const researchAllocation = { ai: null, research: { ...allocation().research, primaryTimeLimitMs: 55_000 },
    fallbackReserveMs: 5000, evidenceRef: "synthetic-research-only-allocation" };
  const research = scenario("research-zero-tokens", { category: "research", allocation: researchAllocation,
    settings: { GOAL_HINT_AI_ENABLED: "false", GOAL_HINT_JOB_TOKEN_LIMIT: undefined } });
  assert.equal((await research.service.initialize(research.period)).status, "initialized");
  const job = research.job();
  assert.equal((await research.service.reserve(job, costRequest(job, "research-zero-tokens"))).status, "reserved");
});

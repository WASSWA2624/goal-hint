import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { costIdentity } from "../src/server/cost-control/cost-input.ts";
import { createCostGateway, reuseCostEvidence } from "../src/server/cost-control/cost-gateway.ts";
import { createCostService } from "../src/server/cost-control/cost-service.ts";
import { memoryCostStore } from "./helpers/cost-memory-store.mjs";
import { COST_NOW, USD, costPeriod, costJob, costRate, costRequest, costUsage, syntheticCostAuthority } from "./helpers/cost-fixtures.mjs";

// All accounting receipts and transports are synthetic; there are no network requests.
const NOW = parseUtcInstant("2026-10-09T08:00:00Z");
const id = (value) => costIdentity("synthetic-gateway", value);
function inputs(timeoutMs = 1000) {
  const shared = { accountId: id("account"), category: "research", jobId: id("job"), evidenceRef: "synthetic-policy-evidence" };
  return { job: { ...shared, workKey: id("work"), costCapUsdPicos: 1000n, requestLimit: 3, inputTokenLimit: 100,
    outputTokenLimit: 100, billedUnitLimit: 10, startsAt: NOW, deadlineAt: NOW + 60_000, timeLimitMs: 50_000, fallbackReserveMs: 10_000 },
  request: { ...shared, attemptId: id("attempt"), rateVersion: "synthetic-v1", provider: "synthetic-provider", model: null,
    maximum: { requests: 1, inputTokens: 10, outputTokens: 10, billedUnits: 1 }, timeoutMs,
    priority: { kind: "fixture", kickoffAt: NOW + 3_600_000 } } };
}
function receipt(request, changes = {}) {
  return { attemptId: request.attemptId, reconciliationId: id("receipt"), kind: "complete", observedQuantities: { ...request.maximum },
    elapsedMs: 1, observedUsdPicos: null, invoicedUsdPicos: null, observedAt: NOW, evidenceRef: "synthetic-usage-evidence", ...changes };
}
function harness(input = inputs(), changes = {}) {
  const calls = [], clock = { current: NOW, now() { return this.current; } };
  let state = "initial";
  const permit = { attemptId: input.request.attemptId, jobId: input.request.jobId, periodId: id("period"), ownerToken: id("owner"),
    reservedAt: NOW, launchBefore: NOW + 1000, maximumCostUsdPicos: 100n };
  const service = {
    async reserve() { calls.push("reserve"); state = "reserved"; return { status: "reserved", permit }; },
    async markDispatched() { calls.push("claim"); state = "dispatched"; return { status: "claimed", timeoutMs: input.request.timeoutMs }; },
    async cancelBeforeDispatch() { calls.push("cancel"); if (state === "reserved") state = "canceled"; return { status: "canceled" }; },
    async reconcile(_permit, usage) { calls.push(["reconcile", usage]); state = usage.kind === "complete" ? "completed" : "uncertain";
      return { status: "recorded", state, liabilityUsdPicos: usage.kind === "complete" ? 10n : 100n }; }, ...changes.service,
  };
  const gateway = createCostGateway({ service, clock, authorize() { calls.push("authorize"); changes.authorize?.(); } });
  return { ...input, calls, clock, service, gateway, state: () => state };
}

test("a single provider attempt follows committed reservation and claim, then verified reconciliation", async () => {
  const h = harness(); let invoked = 0;
  const original = receipt(h.request);
  const result = await h.gateway.execute(h.job, h.request, async (context) => {
    invoked++; h.calls.push("transport"); assert.equal(h.state(), "dispatched");
    assert.equal(context.timeoutMs, 1000); assert.equal(context.maximum.requests, 1); assert.equal(context.signal.aborted, false);
    return { value: "synthetic-evidence", usage: original };
  });
  assert.equal(result.status, "completed"); assert.equal(result.value, "synthetic-evidence"); assert.equal(invoked, 1);
  assert.equal(result.usage.observedAt, original.observedAt);
  const order = h.calls.filter((value) => typeof value === "string" && value !== "authorize");
  assert.deepEqual(order, ["reserve", "claim", "transport"]); assert.equal(h.state(), "completed");
});

test("missing authorization, exhausted budgets and storage failures prevent transport", async () => {
  for (const changes of [
    { authorize() { throw new Error("synthetic-private-key"); }, reason: "operation-not-authorized" },
    { service: { async reserve() { return { status: "denied", reason: "budget-exhausted" }; } }, reason: "budget-exhausted" },
    { service: { async reserve() { throw new Error("synthetic-private-key"); } }, reason: "service-unavailable" },
    { service: { async reserve() { return { status: "joined", attemptId: id("attempt"), state: "dispatched" }; } }, reason: "already-attempted" },
  ]) {
    const h = harness(inputs(), changes); let calls = 0;
    const result = await h.gateway.execute(h.job, h.request, async () => { calls++; return { value: "private", usage: receipt(h.request) }; });
    assert.deepEqual(result, { status: "denied", reason: changes.reason }); assert.equal(calls, 0);
    assert.equal(JSON.stringify(result).includes("synthetic-private-key"), false);
  }
});

test("authorization revoked after reservation confirms cancellation before dispatch", async () => {
  let checks = 0;
  const h = harness(inputs(), { authorize() { if (++checks === 2) throw new Error("synthetic-private-key"); } });
  const result = await h.gateway.execute(h.job, h.request, async () => { throw new Error("Transport must not run."); });
  assert.equal(result.reason, "operation-not-authorized"); assert.equal(h.state(), "canceled");
  assert.equal(h.calls.includes("claim"), false); assert.equal(h.calls.includes("cancel"), true);
});

test("absolute job and fallback deadlines remain distinct before dispatch", async () => {
  const cases = [
    [NOW + 60_000, "timeout"], [NOW + 49_500, "time-limit"], [NOW + 39_500, "fallback-time-reserved"],
    [NOW - 1, "period-inactive"],
  ];
  for (const [now, reason] of cases) {
    const h = harness(); h.clock.current = now;
    const result = await h.gateway.execute(h.job, h.request, async () => { throw new Error("Transport must not run."); });
    assert.equal(result.reason, reason); assert.equal(h.calls.includes("reserve"), false);
  }
});

test("expired permits and a failed durable claim cannot initiate the callback", async () => {
  const h = harness();
  const reserve = h.service.reserve;
  h.service.reserve = async (...args) => { const result = await reserve(...args); h.clock.current = NOW + 1000; return result; };
  let called = 0;
  assert.equal((await h.gateway.execute(h.job, h.request, async () => { called++; })).reason, "dispatch-expired");
  assert.equal(called, 0); assert.equal(h.state(), "canceled");
  const broken = harness(inputs(), { service: { async markDispatched() { throw new Error("synthetic-private-key"); } } });
  assert.equal((await broken.gateway.execute(broken.job, broken.request, async () => { called++; })).reason, "service-unavailable");
  assert.equal(called, 0);
});

test("ambiguous exceptions and timeouts retain the dispatched liability without invented receipts", async () => {
  const thrown = harness();
  assert.equal((await thrown.gateway.execute(thrown.job, thrown.request, async () => { throw new Error("synthetic-private-key"); })).reason, "uncertain-usage");
  assert.equal(thrown.state(), "dispatched"); assert.equal(thrown.calls.some(Array.isArray), false);
  const timed = harness(inputs(20)); let signal, rejectLate;
  const result = await timed.gateway.execute(timed.job, timed.request, async (context) => {
    signal = context.signal; return new Promise((_resolve, reject) => { rejectLate = reject; });
  });
  assert.equal(result.reason, "timeout"); assert.equal(signal.aborted, true); assert.equal(timed.state(), "dispatched");
  assert.equal(timed.calls.includes("cancel"), false); assert.equal(timed.calls.some(Array.isArray), false);
  rejectLate(new Error("synthetic-private-key")); await new Promise((resolve) => setImmediate(resolve));
});

test("partial, malformed and untrusted observations never expose a provider value", async () => {
  const partial = harness();
  const result = await partial.gateway.execute(partial.job, partial.request, async () => ({ value: "unverified-payload", usage: receipt(partial.request, { kind: "partial" }) }));
  assert.deepEqual(result, { status: "denied", reason: "uncertain-usage" }); assert.equal(partial.state(), "uncertain");
  const malformed = harness();
  assert.equal((await malformed.gateway.execute(malformed.job, malformed.request, async () => ({ value: "private", usage: { raw: "synthetic-private-key" } }))).reason, "unverified-usage");
  assert.equal(malformed.state(), "dispatched");
  const untrusted = harness(inputs(), { service: { async reconcile() { return { status: "denied", reason: "unverified-usage" }; } } });
  assert.equal((await untrusted.gateway.execute(untrusted.job, untrusted.request, async () => ({ value: "private", usage: receipt(untrusted.request) }))).reason, "unverified-usage");
});

test("settlement failure and elapsed deadline fail closed after potentially billable completion", async () => {
  const unavailable = harness(inputs(), { service: { async reconcile() { throw new Error("synthetic-private-key"); } } });
  assert.equal((await unavailable.gateway.execute(unavailable.job, unavailable.request, async () => ({ value: "private", usage: receipt(unavailable.request) }))).reason, "service-unavailable");
  assert.equal(unavailable.state(), "dispatched");
  const late = harness();
  const result = await late.gateway.execute(late.job, late.request, async () => {
    late.clock.current = NOW + 40_000; return { value: "late-evidence", usage: receipt(late.request) };
  });
  assert.equal(result.reason, "timeout"); await new Promise((resolve) => setImmediate(resolve)); assert.equal(late.state(), "completed");
  assert.equal(late.calls.some(Array.isArray), true); // Known billing is reconciled even when its value arrived too late.
});

test("evidence reuse retains source timestamps and makes no accounting or provider call", () => {
  const entry = { value: "synthetic-evidence", retrievedAt: NOW - 5000, providerUpdatedAt: NOW - 6000,
    sourceRef: "synthetic-source-evidence", expiresAt: NOW + 5000 };
  let checks = 0;
  const first = reuseCostEvidence(entry, { now: NOW, authorize() {}, verifyReuse(candidate, now) {
    checks++; assert.equal(candidate.retrievedAt, entry.retrievedAt); assert.equal(now, NOW); return true;
  } });
  const second = reuseCostEvidence(entry, { now: NOW + 1000, authorize() {}, verifyReuse: () => true });
  assert.equal(first.status, "reused"); assert.equal(second.status, "reused"); assert.equal(checks, 1);
  assert.equal(first.requestsDispatched, 0); assert.equal(second.entry.retrievedAt, NOW - 5000);
  assert.equal(second.entry.providerUpdatedAt, NOW - 6000); assert.ok(Object.isFrozen(second.entry));
  assert.equal(reuseCostEvidence(entry, { now: NOW + 5000, authorize() {}, verifyReuse: () => true }).reason, "expired-evidence");
  assert.equal(reuseCostEvidence(entry, { now: NOW, authorize() {}, verifyReuse: () => false }).reason, "unverified-evidence");
  assert.equal(reuseCostEvidence({ ...entry, sourceRef: "https://source.example.test/?key=synthetic-private-key" },
    { now: NOW, authorize() {}, verifyReuse: () => true }).reason, "invalid-evidence");
});

test("slow reservation, claim and settlement cannot consume reserved fallback time", async () => {
  for (const stage of ["reserve", "claim", "reconcile"]) {
    const input = inputs(20);
    input.job.deadlineAt = NOW + 150; input.job.timeLimitMs = 150; input.job.fallbackReserveMs = 50;
    const h = harness(input);
    let finish, transports = 0;
    const original = h.service[stage === "claim" ? "markDispatched" : stage];
    h.service[stage === "claim" ? "markDispatched" : stage] = async (...args) => {
      const value = await original(...args); return new Promise((resolve) => { finish = () => resolve(value); });
    };
    const result = await h.gateway.execute(h.job, h.request, async () => { transports++; return { value: "private", usage: receipt(h.request) }; });
    assert.deepEqual(result, { status: "denied", reason: "timeout" });
    assert.equal(transports, stage === "reconcile" ? 1 : 0);
    assert.equal(typeof finish, "function"); finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.state(), stage === "reserve" ? "canceled" : stage === "claim" ? "dispatched" : "completed");
  }
});

test("provider timeout ends at its response while accounting uses the explicit paid job deadline", async () => {
  const h = harness(inputs(20));
  const original = h.service.reconcile;
  h.service.reconcile = async (...args) => { await new Promise((resolve) => setTimeout(resolve, 40)); return original(...args); };
  const result = await h.gateway.execute(h.job, h.request, async () => ({ value: "valid-evidence", usage: receipt(h.request) }));
  assert.equal(result.status, "completed"); assert.equal(result.value, "valid-evidence");
});

test("a revoked final dispatch authorization cannot invoke the provider callback", async () => {
  let checks = 0;
  const h = harness(inputs(), { authorize() { if (++checks === 4) throw new Error("synthetic-private-key"); } });
  let transports = 0;
  const result = await h.gateway.execute(h.job, h.request, async () => { transports++; return { value: "private", usage: receipt(h.request) }; });
  assert.equal(result.reason, "operation-not-authorized"); assert.equal(transports, 0); assert.equal(h.state(), "dispatched");
});

test("genuine late usage is verified and reconciled after a transport timeout without exposing its value", async () => {
  const h = harness(inputs(20)); let finish;
  const original = receipt(h.request, { observedQuantities: { ...h.request.maximum, billedUnits: 2 } });
  const result = await h.gateway.execute(h.job, h.request, async () => new Promise((resolve) => {
    finish = () => resolve({ value: "late-private-evidence", usage: original });
  }));
  assert.deepEqual(result, { status: "denied", reason: "timeout" }); assert.equal(h.state(), "dispatched");
  finish(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.state(), "completed");
  const stored = h.calls.filter(Array.isArray);
  assert.equal(stored.length, 1); assert.equal(stored[0][1].observedAt, original.observedAt);
  assert.equal(stored[0][1].observedQuantities.billedUnits, 2);
});

test("a late verified overage becomes durable debt and blocks subsequent paid dispatch", async () => {
  const clock = { value: COST_NOW, now() { return this.value; } }, store = memoryCostStore(clock);
  const period = costPeriod("late-overage-gateway"), job = costJob(period, "late-overage-gateway"), rate = costRate();
  const service = createCostService({ accountId: period.accountId, category: "ai", store,
    authority: syntheticCostAuthority(), rateFor: () => rate });
  assert.equal((await service.initialize(period)).status, "initialized");
  const request = costRequest(job, "late-overage-gateway:first", { timeoutMs: 20 });
  const gateway = createCostGateway({ service, authorize() {}, clock });
  let finish;
  const result = await gateway.execute(job, request, async ({ permit }) => new Promise((resolve) => {
    finish = () => {
      clock.value += 100;
      resolve({ value: "late-private-evidence", usage: costUsage(permit, "late-overage-gateway:receipt", {
        observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 1 }, invoicedUsdPicos: 2n * USD,
      }) });
    };
  }));
  assert.equal(result.reason, "timeout"); assert.equal((await service.summary()).liabilityUsdPicos, USD);
  finish(); await new Promise((resolve) => setImmediate(resolve));
  const summary = await service.summary(); assert.equal(summary.liabilityUsdPicos, 2n * USD); assert.equal(summary.overageBlocked, true);
  assert.deepEqual(await service.reserve(job, costRequest(job, "late-overage-gateway:next")), { status: "denied", reason: "budget-exhausted" });
});

import assert from "node:assert/strict";
import test from "node:test";
import { createCostService } from "../src/server/cost-control/cost-service.ts";
import { memoryCostStore as memoryStore } from "./helpers/cost-memory-store.mjs";
import { COST_NOW, USD, costId, costPeriod, costJob, costRate, costRequest, costUsage,
  syntheticCostAuthority } from "./helpers/cost-fixtures.mjs";

async function scenario(label, options = {}) {
  const clock = { value: COST_NOW }, store = options.store ?? memoryStore(clock);
  const period = costPeriod(label, options.category ?? "ai", options.period);
  const rate = costRate(period.category, options.rate);
  const authority = syntheticCostAuthority(options.authority);
  const service = createCostService({ accountId: period.accountId, category: period.category,
    store, authority, rateFor: options.rateFor ?? (() => rate) });
  if (options.initialize !== false) assert.equal((await service.initialize(period)).status, "initialized");
  return { clock, store, period, rate, authority, service };
}
async function dispatched(s, job, label, requestOverrides = {}) {
  const decision = await s.service.reserve(job, costRequest(job, label, requestOverrides));
  assert.equal(decision.status, "reserved", decision.status === "denied" ? decision.reason : decision.status);
  assert.equal((await s.service.markDispatched(decision.permit)).status, "claimed");
  return decision.permit;
}
const deny = (reason) => ({ status: "denied", reason });

test("cost service fails closed for missing configuration, pricing and authority", async () => {
  const missing = await scenario("unconfigured", { initialize: false });
  const job = costJob(missing.period, "unconfigured");
  assert.deepEqual(await missing.service.reserve(job, costRequest(job, "unconfigured")), deny("unconfigured"));
  const unpriced = await scenario("unpriced", { rateFor: () => null });
  const unpricedJob = costJob(unpriced.period, "unpriced");
  assert.deepEqual(await unpriced.service.reserve(unpricedJob, costRequest(unpricedJob, "unpriced")), deny("unpriced"));
  const refused = await scenario("refused", { initialize: false, authority: { authorize() { throw new Error("private credential"); } } });
  assert.deepEqual(await refused.service.initialize(refused.period), deny("operation-not-authorized"));
});

test("explicit periods cannot reset spent capacity, overlap or change their approved cap", async () => {
  const s = await scenario("periods", { period: { openingChargedUsdPicos: USD } });
  const job = costJob(s.period, "periods");
  await dispatched(s, job, "periods");
  assert.equal((await s.service.summary()).liabilityUsdPicos, 2n * USD);
  assert.deepEqual(await s.service.initialize(s.period), { status: "initialized" });
  assert.deepEqual(await s.service.initialize({ ...s.period, capUsdPicos: 20n * USD }), deny("conflicting-policy"));
  assert.deepEqual(await s.service.initialize({ ...s.period, periodId: costId("overlapping") }), deny("conflicting-policy"));
  s.clock.value = s.period.endsAt;
  const next = { ...s.period, periodId: costId("next-period"), startsAt: s.period.endsAt,
    endsAt: s.period.endsAt + 86_400_000, openingChargedUsdPicos: 0n };
  assert.deepEqual(await s.service.initialize(next), { status: "initialized" });
  assert.equal((await s.service.summary(s.period.periodId)).liabilityUsdPicos, 2n * USD);
  assert.equal((await s.service.summary()).liabilityUsdPicos, 0n);
});

test("account and per-job ceilings remain atomic under simultaneous reservations", async () => {
  const s = await scenario("parallel", { period: { capUsdPicos: 3n * USD } });
  const job = costJob(s.period, "parallel", { costCapUsdPicos: 2n * USD });
  const decisions = await Promise.all(Array.from({ length: 8 }, (_, i) => s.service.reserve(job, costRequest(job, `parallel-${i}`))));
  assert.equal(decisions.filter((result) => result.status === "reserved").length, 2);
  assert.ok(decisions.filter((result) => result.status === "denied").every((result) => result.reason === "job-budget-exhausted"));
  const another = costJob(s.period, "parallel-another");
  // The queued jobs retain their explicit priority until their window expires.
  s.clock.value += 49_000;
  const fresh = { ...another, startsAt: s.clock.value, deadlineAt: s.clock.value + 60_000 };
  assert.equal((await s.service.reserve(fresh, costRequest(fresh, "third"))).status, "reserved");
  assert.deepEqual(await s.service.reserve(fresh, costRequest(fresh, "fourth")), deny("budget-exhausted"));
  assert.equal((await s.service.summary()).liabilityUsdPicos, 3n * USD);
});

test("changing a job ID cannot reset an existing work key or its operating ceilings", async () => {
  const s = await scenario("work-key"), job = costJob(s.period, "work-key");
  await dispatched(s, job, "original");
  const reset = { ...job, jobId: costId("another-job-id") };
  assert.deepEqual(await s.service.reserve(reset, costRequest(reset, "reset")), deny("conflicting-policy"));
  assert.deepEqual(await s.service.reserve({ ...job, requestLimit: 30 }, costRequest(job, "changed-limit")), deny("conflicting-policy"));
});

test("owner-fenced permits have a single dispatch claim and only predispatch cancellation releases capacity", async () => {
  const s = await scenario("permits"), job = costJob(s.period, "permits");
  const reserved = await s.service.reserve(job, costRequest(job, "cancel"));
  assert.equal(reserved.status, "reserved");
  assert.deepEqual(await s.service.markDispatched({ ...reserved.permit, ownerToken: costId("wrong-owner") }), deny("invalid-permit"));
  assert.deepEqual(await s.service.cancelBeforeDispatch(reserved.permit), { status: "canceled" });
  assert.deepEqual(await s.service.cancelBeforeDispatch(reserved.permit), { status: "canceled" });
  assert.equal((await s.service.summary()).liabilityUsdPicos, 0n);
  assert.equal((await s.service.jobSummary(job.jobId)).requests, 0n);
  const permit = await dispatched(s, job, "dispatch");
  assert.deepEqual(await s.service.markDispatched(permit), deny("already-attempted"));
  assert.deepEqual(await s.service.cancelBeforeDispatch(permit), deny("already-attempted"));
  const repeat = await s.service.reserve(job, costRequest(job, "dispatch"));
  assert.deepEqual(repeat, { status: "joined", attemptId: permit.attemptId, state: "dispatched" });
});

test("unknown and partial usage retain conservative maxima across restart and duplicate reconciliation", async () => {
  const s = await scenario("uncertain"), job = costJob(s.period, "uncertain");
  const permit = await dispatched(s, job, "uncertain", { maximum: { requests: 1, inputTokens: 20, outputTokens: 0, billedUnits: 0 } });
  s.clock.value += 200;
  const partial = costUsage(permit, "partial", { kind: "partial", observedQuantities: { requests: 1, inputTokens: 2, outputTokens: 0, billedUnits: 0 } });
  assert.equal((await s.service.reconcile(permit, partial)).liabilityUsdPicos, USD + USD / 5n);
  assert.equal((await s.service.jobSummary(job.jobId)).inputTokens, 20n);
  assert.deepEqual(await s.service.reconcile(permit, partial), { status: "recorded", state: "uncertain", liabilityUsdPicos: USD + USD / 5n });
  assert.deepEqual(await s.service.reconcile(permit, { ...partial, elapsedMs: 20 }), deny("conflicting-reconciliation"));
  const restarted = createCostService({ accountId: s.period.accountId, category: "ai", store: s.store,
    authority: s.authority, rateFor: () => s.rate });
  assert.equal((await restarted.summary()).liabilityUsdPicos, USD + USD / 5n);
  assert.equal((await restarted.jobSummary(job.jobId)).elapsedMs, 1000n);
});

test("verified measured completion releases unused reserves and retains separately labeled observed costs", async () => {
  const s = await scenario("complete"), job = costJob(s.period, "complete");
  const permit = await dispatched(s, job, "complete", { maximum: { requests: 1, inputTokens: 20, outputTokens: 10, billedUnits: 0 } });
  s.clock.value += 200;
  const usage = costUsage(permit, "complete", { observedQuantities: { requests: 1, inputTokens: 2, outputTokens: 1, billedUnits: 0 }, observedUsdPicos: USD + USD / 25n });
  assert.equal((await s.service.reconcile(permit, usage)).liabilityUsdPicos, USD + USD / 25n);
  const summary = await s.service.summary();
  assert.equal(summary.estimatedUsdPicos, USD + USD / 25n);
  assert.equal(summary.observedUsdPicos, USD + USD / 25n);
  assert.equal(summary.invoicedUsdPicos, 0n);
  assert.equal(summary.inputTokens, 2n);
  assert.equal(summary.outputTokens, 1n);
  assert.equal(summary.elapsedMs, 100n);
});

test("invoice-required billing retains maximum money until a verified final invoice", async () => {
  const s = await scenario("invoice", { rate: { billingRule: "invoice-required" } }), job = costJob(s.period, "invoice");
  const permit = await dispatched(s, job, "invoice", { maximum: { requests: 1, inputTokens: 20, outputTokens: 0, billedUnits: 0 } });
  s.clock.value += 200;
  assert.equal((await s.service.reconcile(permit, costUsage(permit, "measured"))).liabilityUsdPicos, USD + USD / 5n);
  const invoiced = costUsage(permit, "invoice", { observedQuantities: null, invoicedUsdPicos: USD / 2n });
  assert.equal((await s.service.reconcile(permit, invoiced)).liabilityUsdPicos, USD / 2n);
  assert.equal((await s.service.jobSummary(job.jobId)).inputTokens, 20n, "unknown final quantities keep token reserve");
  assert.equal((await s.service.summary()).invoicedUsdPicos, USD / 2n);
});

test("provider overages are recorded without clamping and block both pending and subsequent dispatch", async () => {
  const s = await scenario("overage"), job = costJob(s.period, "overage");
  const permit = await dispatched(s, job, "overage");
  const pending = await s.service.reserve(job, costRequest(job, "pending"));
  assert.equal(pending.status, "reserved");
  s.clock.value += 200;
  assert.equal((await s.service.reconcile(permit, costUsage(permit, "overage", { invoicedUsdPicos: 3n * USD }))).liabilityUsdPicos, 3n * USD);
  assert.deepEqual(await s.service.markDispatched(pending.permit), deny("budget-exhausted"));
  assert.deepEqual(await s.service.reserve(job, costRequest(job, "after-overage")), deny("budget-exhausted"));
  const summary = await s.service.summary();
  assert.equal(summary.overageBlocked, true);
  assert.equal(summary.invoicedUsdPicos, 3n * USD);
  assert.equal(summary.liabilityUsdPicos, 4n * USD);
});

test("retries consume additional requests and token/unit bounds yield distinct outcomes", async () => {
  const s = await scenario("limits");
  const requestJob = costJob(s.period, "request-limit", { requestLimit: 1 });
  const permit = await dispatched(s, requestJob, "first");
  s.clock.value += 200;
  await s.service.reconcile(permit, costUsage(permit, "first", { observedQuantities: { requests: 0, inputTokens: 0, outputTokens: 0, billedUnits: 0 } }));
  assert.deepEqual(await s.service.reserve(requestJob, costRequest(requestJob, "retry")), deny("request-limit"));
  const tokenJob = costJob(s.period, "token-limit", { inputTokenLimit: 1 });
  assert.deepEqual(await s.service.reserve(tokenJob, costRequest(tokenJob, "tokens", { maximum: { requests: 1, inputTokens: 2, outputTokens: 0, billedUnits: 0 } })), deny("token-limit"));
  const unitJob = costJob(s.period, "unit-limit", { billedUnitLimit: 1 });
  assert.deepEqual(await s.service.reserve(unitJob, costRequest(unitJob, "units", { maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 2 } })), deny("billed-unit-limit"));
});

test("deadline, fallback reserve and cumulative elapsed ceilings stay distinct", async () => {
  const s = await scenario("time");
  const elapsedJob = costJob(s.period, "elapsed", { timeLimitMs: 1500, fallbackReserveMs: 100 });
  await dispatched(s, elapsedJob, "elapsed-first");
  assert.deepEqual(await s.service.reserve(elapsedJob, costRequest(elapsedJob, "elapsed-retry")), deny("time-limit"));
  const fallbackJob = costJob(s.period, "fallback");
  s.clock.value = fallbackJob.startsAt + fallbackJob.timeLimitMs - fallbackJob.fallbackReserveMs;
  assert.deepEqual(await s.service.reserve(fallbackJob, costRequest(fallbackJob, "fallback")), deny("fallback-time-reserved"));
  s.clock.value = fallbackJob.deadlineAt;
  assert.deepEqual(await s.service.reserve(fallbackJob, costRequest(fallbackJob, "timeout")), deny("timeout"));
});

test("nearest known kickoff precedes later fixtures and background jobs", async () => {
  const s = await scenario("priority"), background = costJob(s.period, "background"), later = costJob(s.period, "later"), nearest = costJob(s.period, "nearest");
  const backgroundRequest = costRequest(background, "background");
  const laterRequest = costRequest(later, "later", { priority: { kind: "fixture", kickoffAt: COST_NOW + 7200_000 } });
  const nearestRequest = costRequest(nearest, "nearest", { priority: { kind: "fixture", kickoffAt: COST_NOW + 3600_000 } });
  assert.equal((await s.service.queue(background, backgroundRequest)).status, "queued");
  assert.equal((await s.service.queue(later, laterRequest)).status, "queued");
  assert.equal((await s.service.queue(nearest, nearestRequest)).status, "queued");
  assert.deepEqual(await s.service.reserve(background, backgroundRequest), deny("priority-wait"));
  assert.deepEqual(await s.service.reserve(later, laterRequest), deny("priority-wait"));
  assert.equal((await s.service.reserve(nearest, nearestRequest)).status, "reserved");
  assert.equal((await s.service.reserve(later, laterRequest)).status, "reserved");
  assert.equal((await s.service.reserve(background, backgroundRequest)).status, "reserved");
});

test("storage failures and policy revocation stop dispatch and roll back accounting", async () => {
  const failed = await scenario("storage", { initialize: false, store: { async transaction() { throw new Error("mysql://secret@private"); } } });
  assert.deepEqual(await failed.service.initialize(failed.period), deny("service-unavailable"));
  const s = await scenario("revocation"), job = costJob(s.period, "revocation");
  let checks = 0;
  s.authority.verifyRequest = () => ++checks < 3;
  assert.deepEqual(await s.service.reserve(job, costRequest(job, "revocation")), deny("unverified-policy"));
  assert.equal((await s.service.summary()).liabilityUsdPicos, 0n);
  assert.equal((await s.service.jobSummary(job.jobId)).reason, "unknown-job");
});

test("expired permits cannot launch and source observations cannot move before dispatch or into the future", async () => {
  const s = await scenario("source-times"), job = costJob(s.period, "source-times");
  const reservation = await s.service.reserve(job, costRequest(job, "expired"));
  s.clock.value = reservation.permit.launchBefore;
  assert.deepEqual(await s.service.markDispatched(reservation.permit), deny("dispatch-expired"));
  assert.equal((await s.service.summary()).liabilityUsdPicos, USD);
  await s.service.cancelBeforeDispatch(reservation.permit);
  const permit = await dispatched(s, job, "source-times");
  assert.deepEqual(await s.service.reconcile(permit, costUsage(permit, "too-early", { observedAt: permit.reservedAt - 1 })), deny("invalid-request"));
  assert.deepEqual(await s.service.reconcile(permit, costUsage(permit, "future", { observedAt: s.clock.value + 1 })), deny("invalid-request"));
});

test("accounting never rounds aggregate token counts through JavaScript numbers", async () => {
  const zero = { amount: "0", perUnits: 1 };
  const s = await scenario("exact-counts", { rate: { rates: { requests: zero, inputTokens: zero, outputTokens: zero, billedUnits: zero } } });
  for (const suffix of ["a", "b"]) {
    const job = costJob(s.period, suffix, { inputTokenLimit: Number.MAX_SAFE_INTEGER });
    await dispatched(s, job, suffix, { maximum: { requests: 1, inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0, billedUnits: 0 } });
  }
  assert.equal((await s.service.summary()).inputTokens, 2n * BigInt(Number.MAX_SAFE_INTEGER));
});

test("AI and research on the same account retain independent periods, reservations and summaries", async () => {
  const ai = await scenario("independent", { period: { capUsdPicos: USD } });
  const research = createCostService({ accountId: ai.period.accountId, category: "research", store: ai.store,
    authority: syntheticCostAuthority(), rateFor: () => costRate("research") });
  const researchPeriod = costPeriod("independent", "research", { capUsdPicos: 2n * USD });
  assert.equal((await research.initialize(researchPeriod)).status, "initialized");
  const aiJob = costJob(ai.period, "ai");
  await dispatched(ai, aiJob, "ai");
  assert.deepEqual(await ai.service.reserve(aiJob, costRequest(aiJob, "ai-exhausted")), deny("budget-exhausted"));
  const researchJob = costJob(researchPeriod, "research");
  assert.equal((await research.reserve(researchJob, costRequest(researchJob, "research"))).status, "reserved");
  assert.equal((await research.summary()).remainingUsdPicos, USD);
  assert.equal((await ai.service.summary()).remainingUsdPicos, 0n);
  assert.deepEqual(await ai.service.reserve(researchJob, costRequest(researchJob, "cross-category")), deny("invalid-request"));
});

test("unexpected unpriced usage remains durable and blocks dispatch rather than disappearing", async () => {
  const rate = costRate();
  const s = await scenario("unexpected-unpriced", { rate: { rates: { ...rate.rates, billedUnits: null } } });
  const job = costJob(s.period, "unexpected-unpriced"), permit = await dispatched(s, job, "unexpected-unpriced");
  s.clock.value += 200;
  const reported = costUsage(permit, "unexpected-unpriced", { observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 2 } });
  assert.deepEqual(await s.service.reconcile(permit, reported), { status: "recorded", state: "uncertain", liabilityUsdPicos: USD });
  const summary = await s.service.summary();
  assert.equal(summary.billedUnits, 2n);
  assert.equal(summary.overageBlocked, true);
  assert.deepEqual(await s.service.reserve(job, costRequest(job, "after-unpriced")), deny("budget-exhausted"));
});

test("usage approval revoked before commit rolls reconciliation back without reducing the reserve", async () => {
  const s = await scenario("usage-revocation"), job = costJob(s.period, "usage-revocation");
  const permit = await dispatched(s, job, "usage-revocation", { maximum: { requests: 1, inputTokens: 20, outputTokens: 0, billedUnits: 0 } });
  s.clock.value += 200;
  let checks = 0;
  s.authority.verifyUsage = () => ++checks === 1;
  assert.deepEqual(await s.service.reconcile(permit, costUsage(permit, "usage-revocation")), deny("unverified-usage"));
  assert.equal((await s.service.summary()).liabilityUsdPicos, USD + USD / 5n);
  assert.equal((await s.service.jobSummary(job.jobId)).inputTokens, 20n);
});

test("exact request approval revoked during the dispatch claim rolls its single-use marker back", async () => {
  const s = await scenario("claim-revocation"), job = costJob(s.period, "claim-revocation");
  const reservation = await s.service.reserve(job, costRequest(job, "claim-revocation"));
  assert.equal(reservation.status, "reserved");
  let checks = 0;
  s.authority.verifyRequest = () => ++checks === 1;
  assert.deepEqual(await s.service.markDispatched(reservation.permit), deny("unverified-policy"));
  s.authority.verifyRequest = () => true;
  assert.deepEqual(await s.service.cancelBeforeDispatch(reservation.permit), { status: "canceled" });
  assert.equal((await s.service.summary()).liabilityUsdPicos, 0n);
});

test("queued work that exceeds current ceilings cannot starve affordable lower-priority work", async () => {
  const cases = [
    { reason: "budget-exhausted", period: { capUsdPicos: USD }, maximum: { requests: 1, inputTokens: 100, outputTokens: 0, billedUnits: 0 } },
    { reason: "job-budget-exhausted", job: { costCapUsdPicos: 0n } },
    { reason: "request-limit", job: { requestLimit: 1 }, previous: true },
    { reason: "token-limit", job: { inputTokenLimit: 0 }, maximum: { requests: 1, inputTokens: 1, outputTokens: 0, billedUnits: 0 } },
    { reason: "billed-unit-limit", job: { billedUnitLimit: 0 }, maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 1 } },
    { reason: "time-limit", job: { timeLimitMs: 1500, fallbackReserveMs: 0 }, previous: true },
    { reason: "fallback-time-reserved", job: { timeLimitMs: 2500, fallbackReserveMs: 1000 }, previous: true },
  ];
  for (const entry of cases) {
    const s = await scenario(`blocked-head-${entry.reason}`, { period: entry.period });
    const higherJob = costJob(s.period, `higher-${entry.reason}`, entry.job);
    if (entry.previous) await dispatched(s, higherJob, `previous-${entry.reason}`);
    const higher = costRequest(higherJob, `higher-${entry.reason}`, {
      ...(entry.maximum ? { maximum: entry.maximum } : {}), priority: { kind: "fixture", kickoffAt: COST_NOW + 3600_000 },
    });
    assert.equal((await s.service.queue(higherJob, higher)).status, "queued");
    assert.deepEqual(await s.service.reserve(higherJob, higher), deny(entry.reason));
    const lowerJob = costJob(s.period, `lower-${entry.reason}`);
    assert.equal((await s.service.reserve(lowerJob, costRequest(lowerJob, `lower-${entry.reason}`))).status, "reserved", entry.reason);
    const retained = await s.store.transaction(s.period.accountId, s.period.category, (tx) => tx.attempt(higher.attemptId));
    assert.equal(retained.state, "queued", "deferred head remains in the durable audit");
    assert.equal(retained.liabilityUsdPicos, 0n);
  }
});

test("an existing attempt rejects a mutated rate card even when its version is unchanged", async () => {
  let current = costRate();
  const s = await scenario("immutable-rate", { rateFor: () => current });
  const job = costJob(s.period, "immutable-rate"), request = costRequest(job, "immutable-rate");
  assert.equal((await s.service.queue(job, request)).status, "queued");
  current = { ...current, rates: { ...current.rates, requests: { amount: "2", perUnits: 1 } } };
  assert.deepEqual(await s.service.reserve(job, request), deny("conflicting-policy"));
  assert.equal((await s.service.summary()).liabilityUsdPicos, 0n);
});

test("new reconciliation IDs cannot reverse known measured cost or refresh older source observations", async () => {
  const s = await scenario("measured-history"), job = costJob(s.period, "measured-history");
  const permit = await dispatched(s, job, "measured-history", { maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 100 } });
  s.clock.value += 200;
  const first = costUsage(permit, "first-measurement", { observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 80 } });
  assert.equal((await s.service.reconcile(permit, first)).liabilityUsdPicos, USD + USD * 8n / 10n);
  const older = costUsage(permit, "older-measurement", { observedAt: COST_NOW + 50,
    observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 20 } });
  assert.equal((await s.service.reconcile(permit, older)).liabilityUsdPicos, USD + USD * 8n / 10n);
  const stored = await s.store.transaction(s.period.accountId, s.period.category, (tx) => tx.attempt(permit.attemptId));
  assert.equal(stored.usage.observedAt, first.observedAt);
  assert.equal(stored.usage.observedQuantities.billedUnits, 80);
  assert.equal(stored.reconciliations.length, 2);
  const newer = costUsage(permit, "newer-smaller-measurement", { observedAt: COST_NOW + 200,
    observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 20 } });
  assert.equal((await s.service.reconcile(permit, newer)).liabilityUsdPicos, USD + USD * 8n / 10n);
  assert.equal((await s.service.summary()).estimatedUsdPicos, USD + USD * 8n / 10n);
  assert.equal((await s.service.summary()).billedUnits, 80n);
});

test("measured monetary liability covers component maxima across separate receipts", async () => {
  const current = costRate();
  const s = await scenario("component-history", { rate: { rates: { ...current.rates, requests: { amount: "0", perUnits: 1 } } } });
  const job = costJob(s.period, "component-history"), permit = await dispatched(s, job, "component-history", {
    maximum: { requests: 1, inputTokens: 100, outputTokens: 100, billedUnits: 0 },
  });
  s.clock.value += 200;
  await s.service.reconcile(permit, costUsage(permit, "input-observation", { kind: "partial",
    observedQuantities: { requests: 1, inputTokens: 100, outputTokens: 0, billedUnits: 0 } }));
  const completed = costUsage(permit, "output-observation", { observedAt: COST_NOW + 200,
    observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 100, billedUnits: 0 } });
  assert.equal((await s.service.reconcile(permit, completed)).liabilityUsdPicos, 3n * USD);
  const summary = await s.service.summary();
  assert.equal(summary.inputTokens, 100n);
  assert.equal(summary.outputTokens, 100n);
  assert.equal(summary.estimatedUsdPicos, 3n * USD);
});

test("older verified invoices remain accountable even when a fresher completed usage source is selected", async () => {
  const s = await scenario("older-invoice"), job = costJob(s.period, "older-invoice"), permit = await dispatched(s, job, "older-invoice");
  s.clock.value += 200;
  const first = costUsage(permit, "newer-completion");
  await s.service.reconcile(permit, first);
  const older = costUsage(permit, "older-invoice", { kind: "partial", observedAt: COST_NOW + 50, invoicedUsdPicos: 3n * USD });
  assert.equal((await s.service.reconcile(permit, older)).liabilityUsdPicos, 3n * USD);
  const stored = await s.store.transaction(s.period.accountId, s.period.category, (tx) => tx.attempt(permit.attemptId));
  assert.equal(stored.usage.observedAt, first.observedAt);
  assert.equal(stored.reconciliations.length, 2);
  assert.equal((await s.service.summary()).overageBlocked, true);
});

test("clock regression cannot settle usage while late bills can reconcile their original closed period", async () => {
  const s = await scenario("reconcile-clock"), job = costJob(s.period, "reconcile-clock");
  const permit = await dispatched(s, job, "reconcile-clock", { maximum: { requests: 1, inputTokens: 20, outputTokens: 0, billedUnits: 0 } });
  s.clock.value = COST_NOW + 500;
  assert.equal((await s.service.summary()).liabilityUsdPicos, USD + USD / 5n);
  s.clock.value = COST_NOW + 200;
  assert.deepEqual(await s.service.reconcile(permit, costUsage(permit, "backward-clock")), deny("clock-regression"));
  s.clock.value = s.period.endsAt + 100;
  const next = { ...s.period, periodId: costId("reconcile-next-period"), startsAt: s.period.endsAt,
    endsAt: s.period.endsAt + 86_400_000, openingChargedUsdPicos: 0n };
  assert.deepEqual(await s.service.initialize(next), { status: "initialized" });
  assert.equal((await s.service.reconcile(permit, costUsage(permit, "late-original-bill"))).liabilityUsdPicos, USD);
  assert.equal((await s.service.summary(s.period.periodId)).liabilityUsdPicos, USD);
  assert.equal((await s.service.summary()).liabilityUsdPicos, 0n);
});

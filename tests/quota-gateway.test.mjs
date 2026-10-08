import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createPolicyQuotaGateway, createQuotaGateway } from "../src/server/football/quota-gateway.ts";

const id = (value) => createHash("sha256").update(value).digest("hex");
const request = Object.freeze({
  requestId: id("gateway-attempt"), workKey: id("fixture:synthetic"), priority: "daily-inputs",
  deadlineAt: parseUtcInstant("2026-10-08T00:01:00.000Z"), timeoutMs: 1000,
});
const permit = Object.freeze({
  requestId: request.requestId, periodId: id("synthetic-period"), ownerToken: id("synthetic-owner"),
  dispatchedAt: parseUtcInstant("2026-10-08T00:00:00.000Z"), launchBefore: parseUtcInstant("2026-10-08T00:00:01.000Z"),
});

function setup(overrides = {}, authorize = () => {}) {
  const calls = [];
  const limiter = {
    async reserve(input) { calls.push(["reserve", input]); return { status: "reserved", permit }; },
    async claimLaunch(input) { calls.push(["claim", input]); return { status: "claimed", timeoutMs: 1000 }; },
    async complete(input, feedback) { calls.push(["complete", input, feedback]); return { status: "recorded" }; },
    ...overrides,
  };
  return { limiter, calls, gateway: createQuotaGateway({ limiter, authorize }) };
}

test("gateway claims a counted permit before one transport and records feedback before exposing success", async () => {
  const events = [];
  const { calls, gateway } = setup({}, () => { events.push("authorize"); });
  const feedback = { kind: "success", dailyRemaining: 999, minuteRemaining: 8 };
  const result = await gateway.execute(request, async (signal, receivedPermit) => {
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    assert.equal(receivedPermit, permit);
    assert.deepEqual(calls.map(([name]) => name), ["reserve", "claim"]);
    events.push("transport");
    return { value: { fixture: 1 }, feedback };
  });
  assert.deepEqual(result, { status: "completed", value: { fixture: 1 }, feedback });
  assert.deepEqual(calls.map(([name]) => name), ["reserve", "claim", "complete"]);
  assert.deepEqual(events, ["authorize", "authorize", "authorize", "transport"]);
  assert.equal(calls[2][2], feedback);
});

test("joined in-flight work and budget denial never invoke transport or another launch claim", async () => {
  for (const decision of [
    { status: "joined", requestId: id("original"), leaseUntil: parseUtcInstant("2026-10-08T00:00:30.000Z") },
    { status: "denied", reason: "essential-reserve", retryAt: parseUtcInstant("2026-10-09T00:00:00.000Z") },
  ]) {
    let dispatched = false;
    const { calls, gateway } = setup({ async reserve() { return decision; } });
    assert.deepEqual(await gateway.execute(request, async () => { dispatched = true; }), decision);
    assert.equal(dispatched, false);
    assert.deepEqual(calls, []);
  }
});

test("missing authorization is rejected and failed authorization never reserves", async () => {
  assert.throws(() => createQuotaGateway({ limiter: {} }), /authorization callback/u);
  const { calls, gateway } = setup({}, () => { throw new Error("synthetic credential secret"); });
  const result = await gateway.execute(request, async () => { throw new Error("must not dispatch"); });
  assert.deepEqual(result, { status: "denied", reason: "operation-not-authorized" });
  assert.deepEqual(calls, []);
  assert.ok(!JSON.stringify(result).includes("synthetic credential secret"));
});

test("authorization revocation around durable launch leaves the reservation counted and performs no I/O", async () => {
  for (const revokedCheck of [2, 3]) {
    let checks = 0;
    const { calls, gateway } = setup({}, () => {
      if (++checks === revokedCheck) throw new Error("authorization revoked");
    });
    const result = await gateway.execute(request, async () => { assert.fail("unauthorized transport"); });
    assert.deepEqual(result, { status: "denied", reason: "operation-not-authorized" });
    assert.deepEqual(calls.map(([name]) => name), revokedCheck === 2
      ? ["reserve", "complete"] : ["reserve", "claim", "complete"]);
    assert.deepEqual(calls.at(-1)[2], { kind: "uncertain" });
  }
});

test("invalid transport time bounds cannot acquire a permit", async () => {
  for (const timeoutMs of [undefined, 0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
    const { calls, gateway } = setup();
    assert.deepEqual(await gateway.execute({ ...request, timeoutMs }, async () => {}),
      { status: "denied", reason: "invalid-request" });
    assert.deepEqual(calls, []);
  }
});

test("failed or expired single-use launch claim never invokes transport", async () => {
  for (const reason of ["already-attempted", "dispatch-expired", "storage-unavailable"]) {
    const { calls, gateway } = setup({ async claimLaunch() { return { status: "denied", reason }; } });
    const result = await gateway.execute(request, async () => { assert.fail("unclaimed transport"); });
    assert.deepEqual(result, { status: "denied", reason });
    assert.deepEqual(calls.map(([name]) => name), ["reserve"]);
  }
});

test("uncertain network rejection is recorded once without exposing errors or retrying", async () => {
  const { calls, gateway } = setup();
  let transports = 0;
  const result = await gateway.execute(request, async () => {
    transports++;
    throw new Error("synthetic-key mysql://private-driver diagnostic");
  });
  assert.deepEqual(result, { status: "failed", reason: "uncertain" });
  assert.equal(transports, 1);
  assert.deepEqual(calls.at(-1)[2], { kind: "uncertain" });
  assert.ok(!JSON.stringify(result).includes("synthetic-key"));
});

test("timeout aborts transport, records uncertainty and ignores a late rejection", async () => {
  const { calls, gateway } = setup();
  let signal;
  let rejectLate;
  const result = await gateway.execute({ ...request, timeoutMs: 100 }, (receivedSignal) => {
    signal = receivedSignal;
    return new Promise((_resolve, reject) => { rejectLate = reject; });
  });
  assert.equal(signal.aborted, true);
  assert.deepEqual(result, { status: "failed", reason: "uncertain" });
  assert.deepEqual(calls.at(-1)[2], { kind: "uncertain" });
  rejectLate(new Error("late synthetic secret rejection"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.filter(([name]) => name === "complete").length, 1);
});

test("timeout ignores a late successful response and cannot reconcile its headers", async () => {
  const { calls, gateway } = setup();
  let resolveLate;
  const result = await gateway.execute({ ...request, timeoutMs: 100 }, () =>
    new Promise((resolve) => { resolveLate = resolve; }));
  resolveLate({ value: "late value", feedback: { kind: "success", dailyRemaining: 150000 } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(result, { status: "failed", reason: "uncertain" });
  assert.equal(calls.filter(([name]) => name === "complete").length, 1);
  assert.deepEqual(calls.at(-1)[2], { kind: "uncertain" });
});

test("a delayed event loop cannot expose a transport result beyond its elapsed timeout", async () => {
  const { calls, gateway } = setup();
  let signal;
  const result = await gateway.execute({ ...request, timeoutMs: 50 }, async (receivedSignal) => {
    signal = receivedSignal;
    const end = performance.now() + 70;
    while (performance.now() < end) { /* Simulated transport blocks the timer task. */ }
    return { value: "late synchronous result", feedback: { kind: "success" } };
  });
  assert.equal(signal.aborted, true);
  assert.deepEqual(result, { status: "failed", reason: "uncertain" });
  assert.deepEqual(calls.at(-1)[2], { kind: "uncertain" });
});

test("slow claim return and pre-transport process pause cannot launch outside a permit window", async () => {
  const shortPermit = { ...permit, launchBefore: permit.dispatchedAt + 20 };
  const slowClaim = setup({
    async reserve() { return { status: "reserved", permit: shortPermit }; },
    async claimLaunch() {
      await new Promise((resolve) => setTimeout(resolve, 35));
      return { status: "claimed", timeoutMs: 1000 };
    },
  });
  assert.deepEqual(await slowClaim.gateway.execute(request, async () => { assert.fail("expired claim I/O"); }),
    { status: "denied", reason: "dispatch-expired" });
  assert.deepEqual(slowClaim.calls.at(-1)[2], { kind: "uncertain" });

  let authorizations = 0;
  const paused = setup({ async reserve() { return { status: "reserved", permit: shortPermit }; } }, () => {
    if (++authorizations === 3) {
      const end = performance.now() + 35;
      while (performance.now() < end) { /* Process pause before scheduled I/O. */ }
    }
  });
  assert.deepEqual(await paused.gateway.execute(request, async () => { assert.fail("paused expired I/O"); }),
    { status: "denied", reason: "dispatch-expired" });
  assert.deepEqual(paused.calls.at(-1)[2], { kind: "uncertain" });
});

test("remaining durable lease shortens transport and exhausted claim latency performs no I/O", async () => {
  const shorter = setup({ async claimLaunch() { return { status: "claimed", timeoutMs: 100 }; } });
  let signal;
  assert.deepEqual(await shorter.gateway.execute(request, (receivedSignal) => {
    signal = receivedSignal;
    return new Promise(() => {});
  }), { status: "failed", reason: "uncertain" });
  assert.equal(signal.aborted, true);
  assert.deepEqual(shorter.calls.at(-1)[2], { kind: "uncertain" });

  for (const timeoutMs of [0, undefined, NaN]) {
    const exhausted = setup({ async claimLaunch() { return { status: "claimed", timeoutMs }; } });
    assert.deepEqual(await exhausted.gateway.execute(request, async () => { assert.fail("unbounded claim I/O"); }),
      { status: "denied", reason: "dispatch-expired" });
  }
  const delayed = setup({ async claimLaunch() {
    await new Promise((resolve) => setTimeout(resolve, 35));
    return { status: "claimed", timeoutMs: 20 };
  } });
  assert.deepEqual(await delayed.gateway.execute(request, async () => { assert.fail("expired lease I/O"); }),
    { status: "denied", reason: "dispatch-expired" });
});

test("provider body, quota, credential and subscription errors are recorded without exposing a value", async () => {
  for (const kind of ["rate-limited", "credential-failure", "subscription-expired", "provider-error", "uncertain"]) {
    const { calls, gateway } = setup();
    const feedback = { kind, retryAfterMs: 60000 };
    const result = await gateway.execute(request, async () => ({ value: "private raw response", feedback }));
    assert.deepEqual(result, { status: "failed", reason: kind });
    assert.equal(calls.at(-1)[2], feedback);
    assert.ok(!JSON.stringify(result).includes("private raw response"));
  }
});

test("unavailable durable state fails closed before dispatch or success exposure", async () => {
  for (const operation of ["reserve", "claimLaunch", "complete"]) {
    const { gateway } = setup({ async [operation]() { throw new Error("synthetic database secret"); } });
    let transports = 0;
    const result = await gateway.execute(request, async () => {
      transports++;
      return { value: "success withheld", feedback: { kind: "success" } };
    });
    assert.deepEqual(result, { status: "denied", reason: "storage-unavailable" });
    assert.equal(transports, operation === "complete" ? 1 : 0);
  }
  const { gateway } = setup({ async complete() { return { status: "denied", reason: "storage-unavailable" }; } });
  assert.deepEqual(await gateway.execute(request, async () => ({ value: "withheld", feedback: { kind: "success" } })),
    { status: "denied", reason: "storage-unavailable" });
});

test("runtime-policy gateway rejects disabled capability and reference-only evidence", async () => {
  const disabled = parseRuntimePolicy({ NODE_ENV: "test" });
  const { limiter, calls } = setup();
  const gateway = createPolicyQuotaGateway({ limiter, policy: disabled });
  assert.deepEqual(await gateway.execute(request, async () => { assert.fail("disabled provider I/O"); }),
    { status: "denied", reason: "operation-not-authorized" });
  assert.deepEqual(calls, []);

  const trial = parseRuntimePolicy({
    NODE_ENV: "development", GOAL_HINT_OPERATION_SCOPE: "trial", GOAL_HINT_FOOTBALL_ENABLED: "true",
    API_FOOTBALL_KEY: "synthetic-test-key", API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: "3900",
    GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget", GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: "synthetic-rights",
    GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT: "3",
  });
  const blocked = createPolicyQuotaGateway({ limiter, policy: trial });
  assert.deepEqual(await blocked.execute(request, async () => { assert.fail("unverified provider I/O"); }),
    { status: "denied", reason: "operation-not-authorized" });
  assert.deepEqual(calls, []);

  // This verifier applies only to synthetic unit-test records; no production
  // account, subscription or permission is established by these tests.
  const trusted = createPolicyQuotaGateway({
    limiter, policy: trial,
    verifyEvidence: (reference, requirement) =>
      (reference === "synthetic-budget" && requirement === "budget-approval")
      || (reference === "synthetic-rights" && requirement === "football-private-use"),
  });
  assert.deepEqual(await trusted.execute(request, async () => ({ value: "synthetic", feedback: { kind: "success" } })),
    { status: "completed", value: "synthetic", feedback: { kind: "success" } });
});

test("authorized candidate reset probe uses the same single-use bounded transport flow", async () => {
  const evidence = Object.freeze({
    accountId: id("account"), periodId: permit.periodId, startsAt: permit.dispatchedAt,
    endsAt: parseUtcInstant("2026-10-09T00:00:00.000Z"),
    subscriptionExpiresAt: parseUtcInstant("2026-11-01T00:00:00.000Z"),
    providerDailyLimit: 150000, dailyRemaining: 150000, secondLimit: 15, minuteLimit: 900,
    evidenceRef: "synthetic-candidate-boundary",
  });
  let probeReservations = 0;
  let authorizations = 0;
  const { calls, gateway } = setup({
    async reserve() { assert.fail("candidate probe cannot use ordinary reservation"); },
    async reserveResetProbe(receivedEvidence, receivedRequest) {
      probeReservations++;
      assert.equal(receivedEvidence, evidence);
      assert.equal(receivedRequest, request);
      return { status: "reserved", permit };
    },
  }, () => { authorizations++; });
  const feedback = { kind: "success", dailyRemaining: 149999 };
  const result = await gateway.executeResetProbe(evidence, request, async (signal, receivedPermit) => {
    assert.equal(receivedPermit, permit);
    assert.equal(signal.aborted, false);
    assert.deepEqual(calls.map(([name]) => name), ["claim"]);
    return { value: "synthetic probe", feedback };
  });
  assert.equal(probeReservations, 1);
  assert.equal(authorizations, 3);
  assert.deepEqual(result, { status: "completed", value: "synthetic probe", feedback });
  assert.deepEqual(calls.map(([name]) => name), ["claim", "complete"]);
  assert.equal(calls.at(-1)[2], feedback);
});

test("unconfirmed or unsupported reset probes cannot invoke transport", async () => {
  for (const overrides of [{}, {
    async reserveResetProbe() { return { status: "denied", reason: "reset-unconfirmed" }; },
  }]) {
    const { calls, gateway } = setup(overrides);
    const result = await gateway.executeResetProbe({}, request, async () => { assert.fail("unconfirmed reset I/O"); });
    assert.deepEqual(result, { status: "denied", reason: overrides.reserveResetProbe ? "reset-unconfirmed" : "invalid-reset-evidence" });
    assert.deepEqual(calls, []);
  }
  const { calls, gateway } = setup({
    async reserveResetProbe() { assert.fail("unauthorized probe reservation"); },
  }, () => { throw new Error("authorization revoked"); });
  assert.deepEqual(await gateway.executeResetProbe({}, request, async () => { assert.fail("unauthorized reset I/O"); }),
    { status: "denied", reason: "operation-not-authorized" });
  assert.deepEqual(calls, []);
});

test("headers received before a blocked body remain durable when transport times out", async () => {
  const { calls, gateway } = setup();
  const headers = { kind: "uncertain", dailyLimit: 40, dailyRemaining: 0,
    minuteLimit: 2, minuteRemaining: 0, retryAfterMs: 60000 };
  let signal;
  const result = await gateway.execute({ ...request, timeoutMs: 75 }, (receivedSignal, receivedPermit, observe) => {
    signal = receivedSignal;
    assert.equal(receivedPermit, permit);
    observe(headers);
    return new Promise(() => {});
  });
  assert.equal(signal.aborted, true);
  assert.deepEqual(result, { status: "failed", reason: "uncertain" });
  assert.deepEqual(calls.at(-1)[2], headers);
  assert.equal(calls.filter(([name]) => name === "complete").length, 1);
});

test("early provider failures survive body rejection without exposing a response value", async () => {
  for (const kind of ["rate-limited", "credential-failure", "subscription-expired"]) {
    const { calls, gateway } = setup();
    const observed = { kind, dailyRemaining: 0, retryAfterMs: 60000 };
    const result = await gateway.execute(request, async (_signal, _permit, observe) => {
      observe(observed);
      throw new Error("synthetic private response-body diagnostic");
    });
    assert.deepEqual(result, { status: "failed", reason: kind });
    assert.deepEqual(calls.at(-1)[2], observed);
    assert.equal(calls.filter(([name]) => name === "complete").length, 1);
    assert.equal(JSON.stringify(result).includes("synthetic private"), false);
  }
});

test("early success cannot establish completion or reconcile headers without a complete response", async () => {
  const { calls, gateway } = setup();
  const result = await gateway.execute({ ...request, timeoutMs: 75 }, (_signal, _permit, observe) => {
    observe({ kind: "success", dailyLimit: 150000, dailyRemaining: 150000 });
    return new Promise(() => {});
  });
  assert.deepEqual(result, { status: "failed", reason: "uncertain" });
  assert.deepEqual(calls.at(-1)[2], { kind: "uncertain" });
  assert.equal(calls.filter(([name]) => name === "complete").length, 1);
});

test("observations after timeout or completion cannot mutate recorded quota feedback", async () => {
  for (const completes of [false, true]) {
    const { calls, gateway } = setup();
    let observeLate;
    const result = await gateway.execute({ ...request, timeoutMs: 75 }, async (_signal, _permit, observe) => {
      observeLate = observe;
      observe({ kind: "uncertain", dailyRemaining: 0, minuteRemaining: 0 });
      if (completes) return { value: "synthetic completed response", feedback: { kind: "success", dailyRemaining: 0, minuteRemaining: 0 } };
      return new Promise(() => {});
    });
    const recorded = structuredClone(calls.at(-1)[2]);
    observeLate({ kind: "credential-failure", dailyRemaining: 150000, minuteRemaining: 900 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.status, completes ? "completed" : "failed");
    assert.deepEqual(calls.at(-1)[2], recorded);
    assert.equal(calls.filter(([name]) => name === "complete").length, 1);
  }
});

test("repeated early observations retain lower quota limits and the longest retry delay", async () => {
  const { calls, gateway } = setup();
  const result = await gateway.execute(request, async (_signal, _permit, observe) => {
    observe({ kind: "uncertain", dailyLimit: 150000, dailyRemaining: 149000,
      minuteLimit: 900, minuteRemaining: 899, retryAfterMs: 250 });
    observe({ kind: "uncertain", dailyLimit: 100000, dailyRemaining: 99900,
      minuteLimit: 720, minuteRemaining: 10, retryAfterMs: 100 });
    observe({ kind: "uncertain", dailyLimit: 150000, dailyRemaining: 150000,
      minuteLimit: 900, minuteRemaining: 900, retryAfterMs: 200 });
    throw new Error("synthetic body rejection after observed headers");
  });
  assert.deepEqual(result, { status: "failed", reason: "uncertain" });
  assert.deepEqual(calls.at(-1)[2], { kind: "uncertain", dailyLimit: 100000,
    dailyRemaining: 99900, minuteLimit: 720, minuteRemaining: 10, retryAfterMs: 250 });
  assert.equal(calls.filter(([name]) => name === "complete").length, 1);
});

test("elapsed transport deadlines reject observations even when the abort timer has not run", async () => {
  const { calls, gateway } = setup();
  const result = await gateway.execute({ ...request, timeoutMs: 50 }, async (signal, _permit, observe) => {
    observe({ kind: "uncertain", dailyRemaining: 0 });
    const end = performance.now() + 70;
    while (performance.now() < end) { /* A blocked event loop delays the abort timer. */ }
    assert.equal(signal.aborted, false);
    observe({ kind: "credential-failure", dailyRemaining: 150000, minuteRemaining: 900 });
    return { value: "late response withheld", feedback: { kind: "success" } };
  });
  assert.deepEqual(result, { status: "failed", reason: "uncertain" });
  assert.deepEqual(calls.at(-1)[2], { kind: "uncertain", dailyRemaining: 0 });
  assert.equal(calls.filter(([name]) => name === "complete").length, 1);
});

test("a complete successful response cannot restore capacity exhausted by its earlier headers", async () => {
  const { calls, gateway } = setup();
  const result = await gateway.execute(request, async (_signal, _permit, observe) => {
    observe({ kind: "uncertain", dailyLimit: 120000, dailyRemaining: 0,
      minuteLimit: 720, minuteRemaining: 0, retryAfterMs: 1000 });
    return { value: "synthetic completed response", feedback: { kind: "success",
      dailyLimit: 150000, dailyRemaining: 149999, minuteLimit: 900,
      minuteRemaining: 899, retryAfterMs: 100 } };
  });
  const reconciled = { kind: "success", dailyLimit: 120000, dailyRemaining: 0,
    minuteLimit: 720, minuteRemaining: 0, retryAfterMs: 1000 };
  assert.deepEqual(result, { status: "completed", value: "synthetic completed response", feedback: reconciled });
  assert.deepEqual(calls.at(-1)[2], reconciled);
  assert.equal(calls.filter(([name]) => name === "complete").length, 1);
});

test("early provider failures cannot be overwritten by a contradictory successful body", async () => {
  for (const kind of ["rate-limited", "credential-failure", "subscription-expired"]) {
    const { calls, gateway } = setup();
    const result = await gateway.execute(request, async (_signal, _permit, observe) => {
      observe({ kind, dailyRemaining: 0 });
      return { value: "synthetic response withheld", feedback: { kind: "success", dailyRemaining: 150000 } };
    });
    assert.deepEqual(result, { status: "failed", reason: kind });
    assert.deepEqual(calls.at(-1)[2], { kind, dailyRemaining: 0 });
    assert.equal(calls.filter(([name]) => name === "complete").length, 1);
    assert.equal(JSON.stringify(result).includes("withheld"), false);
  }
});

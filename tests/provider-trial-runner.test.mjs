import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { getPublicationDeadline, parseUtcInstant } from "../src/domain/calendar.ts";
import { createApiFootballAdapter } from "../src/server/football/api-football-adapter.ts";
import { createQuotaGateway } from "../src/server/football/quota-gateway.ts";
import { parseTrialPlan } from "../src/server/football/provider-trial-input.ts";
import { chargedTrialRequests, runProviderTrial } from "../src/server/football/provider-trial-runner.ts";

// Isolated synthetic journals and transports; no provider suitability or account qualification evidence.
const NOW = parseUtcInstant("2026-10-08T12:00:00Z");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const task = (id, operation = { kind: "account-status" }, maxRequests = 2, extra = {}) => ({
  id, case: "identity", operation, maxRequests, ...extra,
});
const freshness = (overrides = {}) => ({ maxRetrievalAgeMs: 1000, maxSourceAgeMs: 2000,
  unknownUpdateTime: "retrieval-only", evidenceRef: "synthetic-approved-freshness", ...overrides });
function plan(tasks, overrides = {}) {
  return parseTrialPlan({ version: 1, id: "synthetic-runner-trial", accountId: hash("synthetic-trial-account"),
    competitions: [{ id: 39, season: 2026 }], maxRequests: 5, deadlineAt: NOW + 60_000,
    bounds: { priority: "enrichment", timeoutMs: 1000, maxPages: 5, maxRows: 100, maxResponseBytes: 100_000,
      retry: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100 }, cacheMaxAgeMs: 0 },
    freshness: null, tasks, evidence: [], ...overrides });
}
function result(overrides = {}) {
  return { status: "complete", data: [], completeness: { complete: true, reasons: [], missingIds: [], missingCoverage: [], invalidRows: 0 },
    provenance: [], requestsDispatched: 1, error: null, ...overrides };
}
function memorySession(trialPlan, { tasks = [], updatedAt = NOW, beforeWrite, afterWrite, events = [] } = {}) {
  let journal = { version: 1, planHash: hash(JSON.stringify(trialPlan)), plan: trialPlan,
    createdAt: NOW, updatedAt, tasks };
  const writes = [];
  return { writes, read: () => journal,
    async write(next) {
      await beforeWrite?.(next, writes.length + 1);
      journal = next; writes.push(next); events.push("write");
      await afterWrite?.(next, writes.length);
    },
  };
}
function runtime({ run = () => result(), source = "synthetic", authorize = () => {}, verifyObservation = () => true,
  verifyFreshness = () => true, events = [] } = {}) {
  const calls = [];
  const perform = async (kind, arguments_) => { events.push("adapter"); calls.push({ kind, arguments: arguments_ }); return run(kind, arguments_); };
  return { calls, source, authorize, verifyObservation, verifyFreshness,
    adapter: { evidence: {
      accountStatus: (...args) => perform("account-status", args), fixtures: (...args) => perform("fixtures", args),
      liveFixtures: (...args) => perform("live", args), unresolvedFixtures: (...args) => perform("fixture-ids", args),
      teams: (...args) => perform("teams", args), competitions: (...args) => perform("competitions", args),
      playerStatistics: (...args) => perform("player-statistics", args), statistics: (...args) => perform("statistics", args),
      availability: (...args) => perform(args[1], args),
    }, fallback: { predictions: (...args) => perform("predictions", args) } },
  };
}
const clock = () => ({ now: () => NOW });
function fixtureObservation({ source = "synthetic", status = "scheduled", kickoff = NOW + 3_600_000,
  retrievedAt = NOW, providerUpdatedAt = null, fixtureId = 1, resultStatus = "complete" } = {}) {
  return { taskId: "fixture-context", source, observedAt: NOW,
    result: result({ status: resultStatus, data: [{ id: fixtureId, status, kickoff,
      source: { provider: "api-football", endpoint: "/fixtures", retrievedAt, providerUpdatedAt } }] }) };
}
function fixtureState(observation = fixtureObservation()) {
  return { id: "fixture-context", status: "completed", startedAt: NOW, finishedAt: NOW,
    reservedRequests: 2, dispatchedRequests: 1, observation };
}
function predictionPlan(overrides = {}, firstOperation = { kind: "fixtures", query: { fixtureId: 1 } }) {
  return plan([task("fixture-context", firstOperation),
    task("fallback", { kind: "predictions", fixtureId: 1 }, 2, { case: "prematch", fixtureTaskId: "fixture-context" })],
  { freshness: freshness(), ...overrides });
}

test("trial writes bounded intent before transport and resumes completed work without new calls", async () => {
  const events = [], trialPlan = plan([task("account", undefined, 3), task("live", { kind: "live" }, 3)]);
  const session = memorySession(trialPlan, { events });
  const transport = runtime({ events });
  assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "completed" });
  assert.deepEqual(events, ["write", "adapter", "write", "write", "adapter", "write"]);
  assert.equal(session.writes[0].tasks[0].status, "running");
  assert.equal(session.writes[0].tasks[0].reservedRequests, 3);
  assert.equal(session.writes[0].tasks[0].dispatchedRequests, null);
  assert.equal(session.writes[2].tasks[1].reservedRequests, 3);
  assert.equal(chargedTrialRequests(session.read()), 2);
  assert.equal(session.read().tasks[0].observation.source, "synthetic");
  assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "completed" });
  assert.equal(transport.calls.length, 2);
  assert.equal(session.writes.length, 4);
});

test("a failed intent commit prevents provider transport", async () => {
  const session = memorySession(plan([task("account")]), { beforeWrite() { throw new Error("synthetic unavailable journal"); } });
  const transport = runtime();
  await assert.rejects(runProviderTrial(session, transport, { clock: clock() }), /unavailable journal/u);
  assert.equal(transport.calls.length, 0);
  assert.equal(session.read().tasks.length, 0);
});

test("zero-dispatch capacity waits defer safely and resume the original task without renewing its deadline", async () => {
  for (const reason of ["quota-denied", "shared-work-pending"]) {
    const session = memorySession(plan([task("account", undefined, 3)]));
    const denied = runtime({ run: () => result({ status: "failed", requestsDispatched: 0,
      completeness: { complete: false, reasons: [reason], missingIds: [], missingCoverage: [], invalidRows: 0 },
      error: { reason, retryable: true } }) });
    assert.deepEqual(await runProviderTrial(session, denied, { clock: clock() }), { reason: "waiting" });
    assert.equal(session.read().tasks[0].status, "deferred");
    assert.equal(chargedTrialRequests(session.read()), 0);
    const allowed = runtime();
    assert.deepEqual(await runProviderTrial(session, allowed, { clock: clock() }), { reason: "completed" });
    assert.equal(allowed.calls.length, 1);
    assert.equal(session.read().tasks.length, 1);
    assert.equal(session.read().tasks[0].status, "completed");
    assert.equal(chargedTrialRequests(session.read()), 1);
    assert.equal(allowed.calls[0].arguments[0].deadlineAt, NOW + 60_000);
    await runProviderTrial(session, allowed, { clock: clock() });
    assert.equal(allowed.calls.length, 1);
  }
});

test("capacity denial after actual I/O stays charged and immutable across resumes", async () => {
  const session = memorySession(plan([task("account", undefined, 3)]));
  const transport = runtime({ run: () => result({ status: "partial", requestsDispatched: 1,
    completeness: { complete: false, reasons: ["quota-denied"], missingIds: [], missingCoverage: [], invalidRows: 0 },
    error: { reason: "quota-denied", retryable: true } }) });
  assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "incomplete" });
  assert.equal(session.read().tasks[0].status, "completed");
  assert.equal(chargedTrialRequests(session.read()), 1);
  assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "incomplete" });
  assert.equal(transport.calls.length, 1);
});

test("a crash after provider I/O retains the full reservation and never replays unknown work", async () => {
  const trialPlan = plan([task("account", undefined, 3), task("next", { kind: "live" }, 1)], { maxRequests: 3 });
  const session = memorySession(trialPlan, { beforeWrite(_journal, count) { if (count === 2) throw new Error("synthetic crash before result commit"); } });
  const transport = runtime();
  await assert.rejects(runProviderTrial(session, transport, { clock: clock() }), /before result commit/u);
  assert.equal(session.read().tasks[0].status, "running");
  assert.equal(chargedTrialRequests(session.read()), 3);
  assert.equal(transport.calls.length, 1);
  const resumed = memorySession(trialPlan, { tasks: session.read().tasks.map((state) => ({ ...state, status: "uncertain" })) });
  assert.deepEqual(await runProviderTrial(resumed, transport, { clock: clock() }), { reason: "budget-exhausted" });
  assert.equal(transport.calls.length, 1);
  assert.equal(chargedTrialRequests(resumed.read()), 3);
});

test("running and uncertain task IDs are never automatically dispatched again", async () => {
  for (const status of ["running", "uncertain"]) {
    const session = memorySession(plan([task("account", undefined, 3)]), { tasks: [{ id: "account", status,
      startedAt: NOW, finishedAt: status === "uncertain" ? NOW : null, reservedRequests: 3, dispatchedRequests: null, observation: null }] });
    const transport = runtime();
    await runProviderTrial(session, transport, { clock: clock() });
    assert.equal(transport.calls.length, 0);
    assert.equal(chargedTrialRequests(session.read()), 3);
    assert.equal(session.writes.length, 0);
  }
});

test("revoked authority after the intent write withholds I/O and keeps the reservation charged", async () => {
  let authorized = true;
  const session = memorySession(plan([task("account", undefined, 3)]), { afterWrite() { authorized = false; } });
  const transport = runtime({ authorize() { if (!authorized) throw new Error("synthetic authority revoked"); } });
  assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "blocked" });
  assert.equal(transport.calls.length, 0);
  assert.equal(chargedTrialRequests(session.read()), 3);
  assert.equal(session.read().tasks[0].observation, null);
  assert.notEqual(session.read().tasks[0].status, "completed");
});

test("malformed adapter counters cannot release a committed trial allowance", async () => {
  for (const count of [NaN, -1, 1.5, 4]) {
    const trialPlan = plan([task("account", undefined, 3), task("next", { kind: "live" }, 1)], { maxRequests: 3 });
    const session = memorySession(trialPlan);
    const transport = runtime({ run: () => result({ requestsDispatched: count }) });
    assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "blocked" });
    assert.equal(session.read().tasks[0].status, "running");
    assert.equal(chargedTrialRequests(session.read()), 3);
    assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "budget-exhausted" });
    assert.equal(transport.calls.length, 1);
  }
});

test("timed observations return waiting and resume against the original absolute deadline", async () => {
  let now = NOW;
  const session = memorySession(plan([task("later", undefined, 2, { notBefore: NOW + 1000 })]));
  const transport = runtime();
  const testClock = { now: () => now };
  assert.deepEqual(await runProviderTrial(session, transport, { clock: testClock }), { reason: "waiting" });
  assert.equal(session.writes.length, 0);
  assert.equal(transport.calls.length, 0);
  now += 1000;
  assert.deepEqual(await runProviderTrial(session, transport, { clock: testClock }), { reason: "completed" });
  assert.equal(transport.calls[0].arguments[0].deadlineAt, NOW + 60_000);
});

test("unresolved configuration, expired deadlines and regressed persisted clocks stop before intent", async () => {
  for (const overrides of [{ accountId: null }, { competitions: [] }, { maxRequests: null }, { deadlineAt: null }, { bounds: null }]) {
    const session = memorySession(plan([task("account")], overrides));
    const transport = runtime();
    assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "blocked" });
    assert.equal(transport.calls.length, 0);
  }
  for (const session of [memorySession(plan([task("account")], { deadlineAt: NOW })),
    memorySession(plan([task("account")]), { updatedAt: NOW + 1 })]) {
    const transport = runtime();
    assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "deadline-exceeded" });
    assert.equal(session.writes.length, 0);
    assert.equal(transport.calls.length, 0);
  }
});

test("clock regression during the durable intent write cannot enter provider transport", async () => {
  let now = NOW;
  const session = memorySession(plan([task("account")]), { afterWrite(_journal, count) { if (count === 1) now = NOW - 1; } });
  const transport = runtime();
  assert.deepEqual(await runProviderTrial(session, transport, { clock: { now: () => now } }), { reason: "deadline-exceeded" });
  assert.equal(transport.calls.length, 0);
  assert.equal(chargedTrialRequests(session.read()), 2);
});

test("journal commit crossing the absolute deadline withholds I/O and preserves charged recovery", async () => {
  let now = NOW;
  const session = memorySession(plan([task("account")]), { afterWrite(_journal, count) { if (count === 1) now = NOW + 60_000; } });
  const transport = runtime();
  assert.deepEqual(await runProviderTrial(session, transport, { clock: { now: () => now } }), { reason: "deadline-exceeded" });
  assert.equal(transport.calls.length, 0);
  assert.equal(session.read().tasks[0].status, "running");
  assert.equal(chargedTrialRequests(session.read()), 2);
});

test("a frozen wall clock cannot extend the monotonic transport allowance", async () => {
  const session = memorySession(plan([task("account")], { deadlineAt: NOW + 5 }),
    { async afterWrite(_journal, count) { if (count === 1) await new Promise((resolve) => setTimeout(resolve, 20)); } });
  const transport = runtime();
  assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "deadline-exceeded" });
  assert.equal(transport.calls.length, 0);
  assert.equal(chargedTrialRequests(session.read()), 2);
});

test("fallback uses only trusted matching pre-match context and a verified unknown-time policy", async () => {
  const session = memorySession(predictionPlan(), { tasks: [fixtureState()] });
  let observationChecks = 0, policyChecks = 0;
  const transport = runtime({ verifyObservation(observation) { observationChecks++; return observation.taskId === "fixture-context"; },
    verifyFreshness(policy) { policyChecks++; return policy.evidenceRef === "synthetic-approved-freshness"; } });
  assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "completed" });
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0].kind, "predictions");
  assert.ok(observationChecks >= 1);
  assert.ok(policyChecks >= 1);
  const requestBounds = transport.calls[0].arguments[1];
  assert.equal(requestBounds.cacheScope, "trial:synthetic-runner-trial:fallback");
  assert.equal(requestBounds.deadlineAt, NOW + 60_000);
  assert.equal(session.read().tasks[1].observation.source, "synthetic");
  const longer = memorySession(predictionPlan({ deadlineAt: NOW + 7_200_000 }), { tasks: [fixtureState()] });
  const longerRuntime = runtime();
  await runProviderTrial(longer, longerRuntime, { clock: clock() });
  assert.equal(longerRuntime.calls[0].arguments[1].deadlineAt, getPublicationDeadline(NOW + 3_600_000));
});

test("unsupported freshness, source, fixture identity and status cannot spend fallback requests", async () => {
  const missingUpdate = fixtureObservation();
  delete missingUpdate.result.data[0].source.providerUpdatedAt;
  const cases = [
    { policy: null }, { policy: freshness({ unknownUpdateTime: "reject" }) },
    { verifyFreshness: () => false }, { verifyObservation: () => false },
    { observation: fixtureObservation({ source: "live-provider" }) }, { observation: fixtureObservation({ resultStatus: "partial" }) },
    { observation: fixtureObservation({ fixtureId: 2 }) }, { observation: fixtureObservation({ status: "live" }) },
    { observation: fixtureObservation({ status: "finished-regulation" }) }, { observation: fixtureObservation({ status: "postponed" }) },
    { observation: fixtureObservation({ kickoff: NOW + 4 * 60_000 }) },
    { observation: fixtureObservation({ retrievedAt: NOW - 1001 }) },
    { observation: fixtureObservation({ retrievedAt: NOW + 1 }) },
    { observation: fixtureObservation({ providerUpdatedAt: NOW - 2001 }) },
    { observation: fixtureObservation({ providerUpdatedAt: NOW + 1 }) },
    { observation: missingUpdate },
  ];
  for (const [index, entry] of cases.entries()) {
    const session = memorySession(predictionPlan({ freshness: Object.hasOwn(entry, "policy") ? entry.policy : freshness() }),
      { tasks: [fixtureState(entry.observation ?? fixtureObservation())] });
    const transport = runtime(entry);
    assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "dependency-unavailable" }, `synthetic rejected context ${index}`);
    assert.equal(transport.calls.length, 0);
    assert.equal(session.read().tasks.length, 1);
    assert.equal(chargedTrialRequests(session.read()), 1);
  }
});

test("a non-fixture task cannot become pre-match context from a fixture-shaped payload", async () => {
  const trialPlan = predictionPlan({}, { kind: "competitions", query: { competitionId: 39, season: 2026 } });
  const session = memorySession(trialPlan, { tasks: [fixtureState()] });
  const transport = runtime();
  assert.deepEqual(await runProviderTrial(session, transport, { clock: clock() }), { reason: "dependency-unavailable" });
  assert.equal(transport.calls.length, 0);
});

test("fallback context that becomes stale during the intent commit cannot enter transport", async () => {
  let now = NOW;
  const session = memorySession(predictionPlan(), { tasks: [fixtureState()],
    afterWrite(_journal, count) { if (count === 1) now = NOW + 1001; } });
  const transport = runtime();
  assert.deepEqual(await runProviderTrial(session, transport, { clock: { now: () => now } }), { reason: "dependency-unavailable" });
  assert.equal(transport.calls.length, 0);
  assert.equal(chargedTrialRequests(session.read()), 3);
});

test("actual adapter pagination and retries consume cumulative capacity through the shared gateway", async () => {
  let now = NOW, accountAttempts = 0;
  const reservations = [], completions = [], network = [];
  const limiter = {
    async reserve(request) { reservations.push(request); return { status: "reserved", permit: {
      requestId: request.requestId, periodId: hash("synthetic-runner-period"), ownerToken: hash(request.requestId),
      dispatchedAt: now, launchBefore: now + 1000 } }; },
    async claimLaunch() { return { status: "claimed", timeoutMs: 1000 }; },
    async complete(_permit, feedback) { completions.push(feedback); return { status: "recorded" }; },
  };
  const adapter = createApiFootballAdapter({ accountId: hash("synthetic-trial-account"), credential: { read: () => "synthetic-trial-private-key" },
    authorize() {}, gateway: createQuotaGateway({ limiter, authorize() {} }), clock: { now: () => now }, random: () => 0.5,
    sleep: async (milliseconds) => { now += milliseconds; },
    async fetcher(input) {
      const url = new URL(input); network.push(url);
      let body, status = 200;
      if (url.pathname === "/players") {
        const pageNumber = Number(url.searchParams.get("page"));
        const rows = Array.from({ length: 20 }, (_, index) => ({ player: { id: (pageNumber - 1) * 20 + index + 1, name: "Synthetic Player" },
          statistics: [{ team: { id: 10, name: "Synthetic Team" }, league: { id: 39, name: "Synthetic League", season: 2026 } }] }));
        body = { get: "players", parameters: Object.fromEntries(url.searchParams), errors: [], results: rows.length,
          paging: { current: pageNumber, total: 3 }, response: rows };
      } else {
        accountAttempts++;
        if (accountAttempts === 1) { status = 429; body = { errors: { rateLimit: "Synthetic rate limit" } }; }
        else body = { get: "status", parameters: [], errors: [], results: 1,
          response: { subscription: { plan: "Mega", active: true }, requests: { current: 100, limit_day: 150_000 } } };
      }
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
  });
  const ordinaryBounds = plan([]).bounds;
  const trialPlan = plan([task("players", { kind: "player-statistics", query: { competitionId: 39, season: 2026 } }, 2),
    task("account", undefined, 2), task("later", { kind: "live" }, 1)], { maxRequests: 4,
    bounds: { ...ordinaryBounds, retry: { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 100 } } });
  const session = memorySession(trialPlan);
  const transport = { adapter, source: "synthetic", authorize() {}, verifyObservation: () => true, verifyFreshness: () => true };
  assert.deepEqual(await runProviderTrial(session, transport, { clock: { now: () => now } }), { reason: "budget-exhausted" });
  assert.equal(chargedTrialRequests(session.read()), 4);
  assert.equal(reservations.length, 4);
  assert.equal(completions.length, 4);
  assert.equal(network.length, 4);
  assert.deepEqual(network.map((url) => url.pathname), ["/players", "/players", "/status", "/status"]);
  assert.deepEqual(network.slice(0, 2).map((url) => url.searchParams.get("page")), ["1", "2"]);
  assert.equal(session.read().tasks[0].observation.result.status, "partial");
  assert.equal(session.read().tasks[0].observation.result.completeness.complete, false);
  assert.equal(session.read().tasks[0].observation.result.requestsDispatched, 2);
  assert.equal(session.read().tasks[1].observation.result.requestsDispatched, 2);
  assert.equal(new Set(reservations.map(({ requestId }) => requestId)).size, 4);
  assert.equal(session.read().tasks.some(({ id }) => id === "later"), false);
});

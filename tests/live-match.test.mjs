import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { maximumCompetitionScope } from "../src/domain/feed-query.ts";
import { liveMatchSnapshotSchema } from "../src/domain/live-match.ts";
import { normalizeEvent } from "../src/server/football/api-football-normalize.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { createLiveMatchService, liveEvents, liveStatistics, parseLiveMatchPolicy } from "../src/server/live-match/live-match-service.ts";
import { createMysqlLiveMatchStore } from "../src/server/live-match/live-match-mysql-store.ts";
import { resultProvider } from "./helpers/result-sync-fixtures.mjs";
import { catalogResponse } from "./helpers/catalog-fixtures.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const NOW = parseUtcInstant("2026-10-25T12:00:00Z");
const fixtureId = "9d0873a7-51ba-4d72-8d6c-8357ae6da93a", cycleId = "7c193b1d-8d9e-4923-b60c-2b7215dbe852";
const policy = (extra = {}) => ({ version: 1, evidenceRef: "synthetic-live-detail-policy", coverage: [{ competitionId: 39, season: 2026 }],
  intervalMs: 60_000, finalIntervalMs: 600_000, finalWindowMs: 86_400_000, staleAfterMs: 180_000,
  leaseMs: 30_000, tickMs: 1000, maxFixturesPerTick: 4, requestWindowMs: 10_000,
  request: { timeoutMs: 1000, maxRequests: 1, maxPages: 1, maxRows: 500, maxResponseBytes: 300_000,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 }, ...extra });
const target = (extra = {}) => ({ occurrenceId: hash("occurrence"), fixtureId, cycleId, externalId: 101,
  kickoffAt: NOW - 3_600_000, homeExternalId: 10, awayExternalId: 20, status: "live", statisticsCoverage: true,
  eventsCoverage: true, previous: null, failures: 0, ...extra });
const source = (endpoint, retrievedAt = NOW) => ({ provider: "api-football", endpoint: `/fixtures/${endpoint}`, retrievedAt, providerUpdatedAt: null });
const statistic = (team, values = [{ providerType: "Corner Kicks", metric: "corners", value: 0, unit: "count", supported: true }]) => ({
  team: { id: team }, statistics: values, source: source("statistics") });
const event = (extra = {}) => ({ teamId: 10, elapsed: 45, extra: 2, type: "goal", detail: "Own Goal", player: "Synthetic player",
  assist: null, comments: null, source: source("events"), ...extra });
function response(endpoint, data = [], extra = {}) {
  return { status: "complete", data, completeness: { complete: true, reasons: [], missingIds: [], missingCoverage: [], invalidRows: 0 },
    provenance: [{ provider: "api-football", endpoint, requestParameters: { fixture: "101" }, contractVersion: API_FOOTBALL_CONTRACT_VERSION,
      retrievedAt: NOW, providerUpdatedAt: null, fromCache: false, currentPage: 1, totalPages: 1, quota: {} }], requestsDispatched: 1, error: null, ...extra };
}
function setup(overrides = {}) {
  let now = NOW, owned = null;
  const saved = [], calls = [], scheduled = [], targets = [target()], authorizations = [];
  const clock = { now: () => now };
  const store = {
    async acquire(ownerId, leaseMs) { if (owned) return null; return owned = { accountKey: hash("account"), ownerId, fence: 1n, until: now + leaseMs }; },
    async renew(lease, leaseMs) { assert.equal(lease.ownerId, owned.ownerId); return owned = { ...lease, until: now + leaseMs }; },
    async release() { owned = null; }, async due() { return targets; },
    async schedule(lease, candidate, nextAt) { scheduled.push({ lease, candidate, nextAt }); },
    async save(lease, candidate, snapshot, nextAt, failures) { saved.push({ lease, candidate, snapshot, nextAt, failures }); },
    ...overrides.store,
  };
  const adapter = {
    async statistics(id, bounds, workflow) { workflow.check(); calls.push({ kind: "statistics", id, bounds }); return response("statistics", [statistic(10), statistic(20)]); },
    async events(id, bounds, workflow) { workflow.check(); calls.push({ kind: "events", id, bounds }); return response("events", [event()]); },
    ...overrides.adapter,
  };
  const authority = { authorize() { authorizations.push(now); }, verifyPolicy: () => true, verifyResponse: () => true, ...overrides.authority };
  return { service: createLiveMatchService({ accountKey: hash("account"), policy: policy(), clock, store, adapter, authority, ...overrides.options }),
    saved, calls, scheduled, targets, authorizations, setNow(value) { now = value; } };
}

test("event normalization preserves stoppage/own goals without inferring scores or source update time", () => {
  const raw = { time: { elapsed: 45, extra: 2 }, team: { id: 10 }, player: { name: "Synthetic player" }, assist: null,
    type: "Goal", detail: "Own Goal", comments: null };
  const normalized = normalizeEvent(raw, { retrievedAt: NOW, endpoint: "/fixtures/events" });
  assert.equal(normalized.valid, true);
  assert.equal(normalized.data.type, "goal"); assert.equal(normalized.data.detail, "Own Goal");
  assert.equal(normalized.data.extra, 2); assert.equal(normalized.data.source.providerUpdatedAt, null);
  assert.equal("score" in normalized.data, false); assert.ok(Object.isFrozen(normalized.data));
  for (const [provider, type] of [["Card", "card"], ["subst", "substitution"], ["Var", "var"], ["new-provider-type", "unsupported"]])
    assert.equal(normalizeEvent({ ...raw, type: provider }, { retrievedAt: NOW, endpoint: "/fixtures/events" }).data.type, type);
  assert.equal(normalizeEvent({ ...raw, time: { elapsed: -1 } }, { retrievedAt: NOW, endpoint: "/fixtures/events" }).valid, false);
  assert.equal(normalizeEvent({ ...raw, team: { id: 0 } }, { retrievedAt: NOW, endpoint: "/fixtures/events" }).valid, false);
  const blank = normalizeEvent({ ...raw, detail: " ", comments: "", player: { name: "\t" }, assist: { name: "  " } },
    { retrievedAt: NOW, endpoint: "/fixtures/events" });
  assert.equal(blank.valid, true);
  assert.deepEqual([blank.data.detail, blank.data.comments, blank.data.player, blank.data.assist], [null, null, null, null]);
  assert.equal(normalizeEvent({ ...raw, comments: "x".repeat(161) }, { retrievedAt: NOW, endpoint: "/fixtures/events" }).valid, false);
});

test("dedicated timeline uses one counted fixture request, keeps same-team events and obeys workflow cancellation", async () => {
  const clock = { now: () => NOW };
  const raw = { time: { elapsed: 22, extra: null }, team: { id: 10 }, player: { name: "Synthetic player" }, type: "Card", detail: "Yellow Card" };
  const provider = resultProvider(clock, { respond: (url) => catalogResponse(url, [raw, { ...raw, time: { elapsed: 24, extra: null } }]) });
  const bounds = { ...policy().request, priority: "live-details", deadlineAt: NOW + 10_000 };
  const result = await provider.adapter.evidence.events(101, bounds);
  assert.equal(result.status, "complete"); assert.equal(result.data.length, 2);
  assert.equal(provider.network.length, 1); assert.equal(provider.network[0].url.pathname, "/fixtures/events");
  assert.equal(provider.network[0].url.search, "?fixture=101");
  assert.equal(provider.reservations.length, 1); assert.equal(result.requestsDispatched, 1);
  const controller = new AbortController(); controller.abort();
  await provider.adapter.evidence.events(101, bounds, { signal: controller.signal, deadlineAt: bounds.deadlineAt, check() { controller.signal.throwIfAborted(); } });
  assert.equal(provider.network.length, 1);
});

test("quota pacing may wait before launch but a failed provider dispatch cannot be repeated", async () => {
  let now = NOW, attempts = 0;
  const clock = { now: () => now };
  const limiter = {
    async reserve(request) { attempts++; return attempts === 1 ? { status: "denied", reason: "pacing", retryAt: now + 500 }
      : { status: "reserved", permit: { requestId: request.requestId, periodId: hash("period"), ownerToken: hash(request.requestId), dispatchedAt: now, launchBefore: now + 1000 } }; },
    async claimLaunch() { return { status: "claimed", timeoutMs: 1000 }; }, async complete() { return { status: "recorded" }; },
  };
  const provider = resultProvider(clock, { limiter, sleep: async (ms) => { now += ms; }, respond: (url) => catalogResponse(url, []) });
  const bounds = { ...policy().request, priority: "live-details", deadlineAt: NOW + 10_000,
    retry: { maxAttempts: 8, baseDelayMs: 250, maxDelayMs: 2000 } };
  assert.equal(parseLiveMatchPolicy(policy({ request: { ...policy().request, retry: bounds.retry } })).request.retry.maxAttempts, 8);
  assert.equal((await provider.adapter.evidence.events(101, bounds)).status, "complete");
  assert.equal(attempts, 2); assert.equal(provider.network.length, 1);
  const failed = resultProvider(clock, { respond: (url) => catalogResponse(url, [], { status: 503 }), sleep: async (ms) => { now += ms; } });
  assert.notEqual((await failed.adapter.evidence.events(101, { ...bounds, deadlineAt: now + 10_000 })).status, "complete");
  assert.equal(failed.network.length, 1); assert.equal(failed.reservations.length, 1);
});

test("statistics distinguish zero, unknown team-side values and unavailable coverage", () => {
  const complete = liveStatistics(response("statistics", [statistic(10), statistic(20)]), target(), NOW);
  assert.equal(complete.state, "available"); assert.deepEqual(complete.items[0], { metric: "corners", unit: "count", home: 0, away: 0 });
  const partial = liveStatistics(response("statistics", [statistic(10)]), target(), NOW);
  assert.equal(partial.state, "partial"); assert.equal(partial.items[0].away, null);
  const unknown = liveStatistics(response("statistics", []), target({ statisticsCoverage: null }), NOW);
  assert.equal(unknown.state, "unavailable"); assert.equal(unknown.reason, "coverage-unknown");
  const wrongTeam = liveStatistics(response("statistics", [statistic(99)]), target(), NOW);
  assert.equal(wrongTeam.state, "unavailable"); assert.equal(wrongTeam.reason, "invalid-response");
});

test("empty event history needs confirmed coverage; a correction replaces the timeline, not appended events", async () => {
  assert.equal(liveEvents(response("events"), target(), NOW).state, "available");
  assert.equal(liveEvents(response("events"), target({ eventsCoverage: null }), NOW).reason, "coverage-unknown");
  assert.equal(liveEvents(response("events", [event({ teamId: 99 })]), target(), NOW).reason, "invalid-response");
  const current = liveEvents(response("events", [event(), event({ type: "var", detail: "Goal cancelled" })]), target(), NOW);
  const previous = { ...target(), previous: { events: current } };
  assert.deepEqual(liveEvents(response("events", []), previous, NOW).items, []);
});

test("provider failure retains observations with original clocks and an explicit incomplete state", () => {
  const statistics = liveStatistics(response("statistics", [statistic(10), statistic(20)]), target(), NOW);
  const events = liveEvents(response("events", [event()]), target(), NOW);
  const candidate = target({ previous: { statistics, events } });
  const failed = response("events", [], { status: "failed", completeness: { complete: false }, error: { reason: "transport-error" } });
  const retained = liveEvents(failed, candidate, NOW + 60_000);
  assert.equal(retained.state, "partial"); assert.equal(retained.reason, "provider-error"); assert.equal(retained.retrievedAt, NOW);
  assert.deepEqual(retained.items, events.items);
  const wrongClock = response("statistics", [statistic(10)], { provenance: [{ ...response("statistics").provenance[0], retrievedAt: NOW + 1 }] });
  assert.equal(liveStatistics(wrongClock, candidate, NOW).state, "partial");
});

test("central collection reserves before dispatch, uses bounded independent endpoint budgets and persists one validated body", async () => {
  const state = setup();
  assert.equal(await state.service.runOnce(), true); assert.equal(state.saved.length, 1); assert.equal(state.scheduled.length, 1);
  assert.equal(state.scheduled[0].nextAt, NOW + 60_000); assert.equal(state.calls.length, 2);
  for (const call of state.calls) { assert.equal(call.id, 101); assert.equal(call.bounds.priority, "live-details");
    assert.equal(call.bounds.maxRequests, 1); assert.equal(call.bounds.retry.maxAttempts, 1); assert.equal(call.bounds.cacheMaxAgeMs, 0); }
  assert.equal(state.saved[0].failures, 0); assert.equal(liveMatchSnapshotSchema.safeParse(state.saved[0].snapshot).success, true);
  assert.equal(state.saved[0].snapshot.cycleId, cycleId); assert.equal("forecast" in state.saved[0].snapshot, false);
  await state.service.stop();
});

test("explicit missing coverage makes no calls and an unapproved response cannot become public observations", async () => {
  const state = setup(); state.targets[0] = target({ statisticsCoverage: false, eventsCoverage: false });
  assert.equal(await state.service.runOnce(), true); assert.equal(state.calls.length, 0);
  assert.equal(state.saved[0].snapshot.events.reason, "coverage-unavailable");
  const unapproved = setup({ authority: { verifyResponse: () => Promise.reject(new Error("synthetic private denial")) } });
  assert.equal(await unapproved.service.runOnce(), true); assert.equal(unapproved.saved[0].snapshot.statistics.state, "unavailable");
  assert.equal(unapproved.saved[0].snapshot.events.items.length, 0);
});

test("leases, changed permissions and source identity deny writes or dispatch; invalid policies cannot create work", async () => {
  const standby = setup({ store: { async acquire() { return null; } } });
  assert.equal(await standby.service.runOnce(), false); assert.equal(standby.calls.length, 0);
  const denied = setup({ authority: { verifyPolicy: () => Promise.resolve(true) } });
  await assert.rejects(denied.service.runOnce(), (error) => error.reason === "unauthorized"); assert.equal(denied.calls.length, 0);
  const moved = setup({ store: { async schedule() { throw new Error("synthetic changed occurrence"); } } });
  assert.equal(await moved.service.runOnce(), false); assert.equal(moved.calls.length, 0); assert.equal(moved.saved.length, 0);
  const wrongCycle = setup(); wrongCycle.targets[0].previous = { fixtureId: "f0ac9403-e430-4693-b9f1-58ee163a4084" };
  assert.equal(await wrongCycle.service.runOnce(), false); assert.equal(wrongCycle.calls.length, 0);
  for (const change of [{ intervalMs: 15_000 }, { request: { ...policy().request, maxRequests: 2 } }, { requestWindowMs: 30_000 }])
    assert.throws(() => parseLiveMatchPolicy(policy(change)), (error) => error.reason === "policy-required");
});

test("revocation during the first response releases the owned fence and prevents the second dispatch or save", async () => {
  let allowed = true, calls = 0, releases = 0;
  const state = setup({ authority: { verifyPolicy: () => allowed },
    store: { async release() { releases++; } }, adapter: {
      async statistics() { calls++; allowed = false; return response("statistics", [statistic(10), statistic(20)]); },
      async events() { calls++; return response("events", [event()]); },
    } });
  await assert.rejects(state.service.runOnce(), (error) => error.reason === "unauthorized");
  assert.equal(calls, 1); assert.equal(releases, 1); assert.equal(state.saved.length, 0);
});

test("collector and stored due reads accept the application's full competition scope while bounding each poll", async () => {
  const coverage = Array.from({ length: maximumCompetitionScope }, (_, index) => ({ competitionId: index + 1, season: 2026 }));
  assert.equal(parseLiveMatchPolicy(policy({ coverage: coverage.slice(0, 101) })).coverage.length, 101);
  const parsed = parseLiveMatchPolicy(policy({ coverage }));
  assert.equal(parsed.coverage.length, maximumCompetitionScope); assert.equal(parsed.maxFixturesPerTick, 4);
  let selectedScope;
  const database = { async query(operation) { return operation({ async $queryRaw(_sql, ...values) {
    selectedScope = JSON.parse(values.find((value) => typeof value === "string" && value.startsWith("["))); return [];
  } }); } };
  const store = createMysqlLiveMatchStore({ database, accountKey: hash("account") });
  assert.deepEqual(await store.due(parsed, NOW, parsed.maxFixturesPerTick), []);
  assert.deepEqual(selectedScope, coverage);
  const excessive = policy({ coverage: [...coverage, { competitionId: maximumCompetitionScope + 1, season: 2026 }] });
  assert.throws(() => parseLiveMatchPolicy(excessive), (error) => error.reason === "policy-required");
  await assert.rejects(store.due(excessive, NOW, 4), (error) => error.reason === "invalid-request");
  assert.throws(() => parseLiveMatchPolicy(policy({ coverage: [...coverage.slice(0, 101), coverage[0]] })),
    (error) => error.reason === "policy-required");
});

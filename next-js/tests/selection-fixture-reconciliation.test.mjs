import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { catalogScopeKey } from "../src/server/football/catalog-input.ts";
import { createHourlyFixtureReconciler, HourlyScheduleQuotaUnavailable } from "../src/server/selection/selection-fixture-reconciliation.ts";

const slot = parseUtcInstant("2026-10-09T08:00:00Z");
const lease = { runId: "synthetic-run", ownerId: "synthetic-owner", fence: 1 };
const day = "2026-10-09";
const nextDay = "2026-10-10";
const clock = { now: () => slot + 1000 };

function receipt(id, selection, selector, fixtures, extra = {}) {
  return { id, selection, fixtureIds: fixtures, observedAt: new Date(clock.now()), rejectedCount: 0, requestsDispatched: 1, status: "complete",
    provenance: [{ provider: "api-football", endpoint: "fixtures", contractVersion: API_FOOTBALL_CONTRACT_VERSION,
      retrievedAt: clock.now(), fromCache: false, currentPage: 1, totalPages: 1,
      requestParameters: { ...selector, timezone: "Africa/Kampala" } }], ...extra };
}

function setup({ candidates = [], dates = [day, nextDay], configureDate = (date, value) => value, dispatch = () => {} } = {}) {
  const imports = dates.map((date) => configureDate(date, receipt(date, { kind: "fixtures", query: { date } }, { date },
    date === nextDay ? ["moved-within-horizon"] : [])));
  const calls = [];
  const client = {
    dailyRun: { findFirst: async () => ({ leaseExpiresAt: new Date(slot + 120_000) }) },
    dailyRunImport: { findMany: async () => dates.map((date) => ({ id: date, eatDate: new Date(date) })) },
    footballImport: { findMany: async ({ where }) => imports.filter(({ id }) => where.id.in.includes(id)) },
    footballFixture: { findMany: async ({ where }) => candidates.filter(({ externalId }) => !where.externalId.notIn.includes(externalId)) },
  };
  const importer = { async import(request) {
    calls.push(request);
    dispatch(calls.length);
    const ids = [...request.selection.query.fixtureIds].sort((a, b) => a - b);
    const selector = { [ids.length === 1 ? "id" : "ids"]: ids.join("-") };
    const confirmed = ids.includes(2) ? ["confirmed-schedule-change"] : [];
    imports.push(receipt(request.id, request.selection, selector, confirmed, { status: "partial" }));
    return { fixtureIds: confirmed, observedAt: clock.now(), rejectedCount: 0, requestsDispatched: 1 };
  } };
  const policy = { competitionIds: [39], retentionEvidenceRef: "synthetic-retention",
    importBounds: { priority: "daily-inputs", deadlineMs: 60_000, timeoutMs: 1000, maxRequests: 2, maxPages: 1,
      maxRows: 100, maxResponseBytes: 100_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 } };
  const reconciler = createHourlyFixtureReconciler({ database: { query: (operation) => operation(client) }, importer, policy, clock });
  return { calls, reconcile: reconciler.reconcile };
}

test("hourly fixture reconciliation batches missing IDs once and reuses the confirmed receipt on retry", async () => {
  const candidates = [{ id: "moved-within-horizon", externalId: 1n }, ...Array.from({ length: 44 }, (_, index) => ({
    id: `missing-${index + 2}`, externalId: BigInt(index + 2),
  }))];
  const { calls, reconcile } = setup({ candidates });
  assert.deepEqual(await reconcile(lease, slot), ["confirmed-schedule-change"]);
  assert.deepEqual(calls.map(({ selection }) => selection.query.fixtureIds),
    [Array.from({ length: 20 }, (_, index) => index + 2), Array.from({ length: 20 }, (_, index) => index + 22)]);
  assert.ok(calls.every(({ bounds }) => bounds.cacheMaxAgeMs === 0 && bounds.maxRequests === 1 && bounds.deadlineAt <= slot + 3_600_000));
  assert.deepEqual(await reconcile(lease, slot), ["confirmed-schedule-change"]);
  assert.equal(calls.length, 2);
});

test("stale, cached and partial date receipts cannot establish missing fixture IDs", async () => {
  const configureDate = (date, value) => date === day
    ? { ...value, observedAt: new Date(slot - 1), provenance: [{ ...value.provenance[0], retrievedAt: slot - 1 }] }
    : { ...value, status: "partial", provenance: [{ ...value.provenance[0], fromCache: true }] };
  const { calls, reconcile } = setup({ configureDate, candidates: [{ id: "old-fixture", externalId: 2n }] });
  assert.deepEqual(await reconcile(lease, slot), []);
  assert.equal(calls.length, 0);
});

test("quota floor refusal leaves earlier confirmations available to the cohort", async () => {
  const candidates = Array.from({ length: 21 }, (_, index) => ({ id: `missing-${index + 2}`, externalId: BigInt(index + 2) }));
  const { calls, reconcile } = setup({ candidates, dispatch(index) {
    if (index > 1) throw new HourlyScheduleQuotaUnavailable();
  } });
  assert.deepEqual(await reconcile(lease, slot), ["confirmed-schedule-change"]);
  assert.equal(calls.length, 2);
});

test("hourly forward season discovery resumes completed scopes across slots and reports deferred scope", async () => {
  const hour = 3_600_000;
  const season = 2026;
  const observations = new Map();
  const calls = [];
  const controller = new AbortController();
  let at = slot;
  const client = {
    dailyRun: { findFirst: async () => ({ leaseExpiresAt: new Date(at + 120_000) }) },
    footballSeason: { findMany: async () => [39, 40, 41, 42].map(externalId => ({ year: season,
      competition: { providers: [{ externalId: BigInt(externalId) }] } })) },
    $queryRaw: async () => [...observations.values()],
  };
  const importer = { async import(request) {
    const { competitionId, status } = request.selection.query;
    assert.equal(status, "TBD-NS-PST");
    assert.equal(request.bounds.priority, "enrichment");
    assert.equal(request.bounds.maxRequests, 1);
    calls.push(competitionId);
    const scopeKey = catalogScopeKey(request.selection);
    observations.set(scopeKey, { scopeKey, observedAt: new Date(at + 1000), completeAt: new Date(at + 1000) });
    controller.abort();
    return { receivedCount: 2, changedFixtureIds: [`match-${competitionId}`], requestsDispatched: 1, status: "complete" };
  } };
  const options = { database: { query: (operation) => operation(client) }, importer, clock: { now: () => at + 1000 },
    policy: { competitionIds: [39, 40, 41, 42, 43], retentionEvidenceRef: "synthetic-retention", importBounds: {
      priority: "daily-inputs", deadlineMs: 60_000, timeoutMs: 1000, maxRequests: 2, maxPages: 1,
      maxRows: 100, maxResponseBytes: 100_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0,
    } } };
  const first = await createHourlyFixtureReconciler(options).sweepUpcoming(lease, at, controller.signal);
  assert.deepEqual(first, { completeScopes: 1, partialScopes: 0, failedScopes: 0, unavailableScopes: 0, retainedScopes: 0,
    deferredScopes: 3, competitionsWithoutSeason: 1, scannedFixtures: 2, changedFixtures: 1, requests: 1 });
  at += hour;
  const resumed = await createHourlyFixtureReconciler(options).sweepUpcoming({ ...lease, runId: "new-slot" }, at);
  assert.equal(resumed.retainedScopes, 1);
  assert.equal(resumed.completeScopes, 2);
  assert.equal(resumed.deferredScopes, 1);
  assert.equal(new Set(calls).size, 3);
  await createHourlyFixtureReconciler(options).sweepUpcoming({ ...lease, runId: "new-slot" }, at);
  assert.equal(calls.length, 3, "a resumed invocation cannot exceed the original slot budget");
  at += hour;
  const finished = await createHourlyFixtureReconciler(options).sweepUpcoming({ ...lease, runId: "third-slot" }, at);
  assert.equal(finished.retainedScopes, 3);
  assert.equal(finished.deferredScopes, 0);
  assert.equal(new Set(calls).size, 4);
});

test("odds horizon discovery extends the forecast scope and resumes verified date receipts within the same slot", async () => {
  const calls = [], observations = [];
  const controller = new AbortController();
  const client = {
    dailyRun: { findFirst: async () => ({ leaseExpiresAt: new Date(slot + 120_000) }) },
    footballImport: { findMany: async () => observations },
  };
  const policy = { competitionIds: [39], windowDays: 8, retentionEvidenceRef: "synthetic-retention", importBounds: {
    priority: "daily-inputs", deadlineMs: 60_000, timeoutMs: 1000, maxRequests: 2, maxPages: 1,
    maxRows: 100, maxResponseBytes: 100_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0,
  } };
  const importer = { async import(request) {
    const { date } = request.selection.query;
    calls.push(date);
    observations.push(receipt(request.id, request.selection, { date }, [], { scopeKey: catalogScopeKey(request.selection) }));
    if (calls.length === 2) controller.abort();
    return { status: "complete", requestsDispatched: 1, rejectedCount: 0, changedFixtureIds: [] };
  } };
  const create = () => createHourlyFixtureReconciler({ database: { query: (operation) => operation(client) }, importer, policy, clock });
  assert.deepEqual(await create().sweepOddsHorizon(lease, slot, 15, controller.signal),
    { complete: 2, partial: 0, failed: 0, deferred: 5, requests: 2, changed: 0 });
  assert.deepEqual(await create().sweepOddsHorizon(lease, slot, 15),
    { complete: 7, partial: 0, failed: 0, deferred: 0, requests: 5, changed: 0 });
  assert.deepEqual(calls, ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
});

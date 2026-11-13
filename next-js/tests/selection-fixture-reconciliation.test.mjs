import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
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

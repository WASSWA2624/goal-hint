import assert from "node:assert/strict";
import test from "node:test";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { createFootballHistoryOddsMapping, normalizeFootballHistoryOddsMapping } from "../src/server/football/history-odds-mapping.ts";
import { createFootballHistorySource } from "../src/server/football/history-source.ts";
import { catalogBounds } from "./helpers/catalog-fixtures.mjs";
import { resultProvider } from "./helpers/result-sync-fixtures.mjs";

const now = Date.parse("2026-11-12T12:00:00Z");
const dayEnd = Date.parse("2026-11-13T00:00:00Z");
const day = "2026-11-12";
const kickoffAt = Date.parse("2026-11-14T17:30:00Z");
const mapping = (id) => ({ id, competitionId: 39, season: 2026, kickoffAt, updatedAt: now });
const firstPage = Array.from({ length: 100 }, (_, index) => mapping(index + 1));

function setup(pages, overrides = {}) {
  const saved = [], dispatched = [];
  const source = createFootballHistorySource({ query(callback) { return callback({ footballHistorySourcePage: {
    async createMany({ data }) { saved.push(data); },
    async findMany({ where }) { return saved.filter((page) => page.endpoint === where.endpoint && page.selectorHash === where.selectorHash); },
  } }); } });
  const importer = createFootballHistoryOddsMapping({
    authorized: () => true, canDispatch: async () => true, now: () => now, providerDayEndsAt: () => dayEnd,
    readPages: source.readOddsMappingPages, savePage: source.saveOddsMappingPage, ...overrides,
    async mappingPage(page, bounds, workflow) {
      assert.equal(bounds.priority, "enrichment");
      assert.equal(bounds.maxRequests, 1);
      workflow.beforeDispatch();
      dispatched.push(page);
      const { data, totalPages } = pages[page - 1];
      return { status: "complete", data, error: null, requestsDispatched: 1,
        completeness: { complete: true, invalidRows: 0 }, provenance: [{
          provider: "api-football", endpoint: "oddsMapping", requestParameters: { page: String(page) },
          contractVersion: API_FOOTBALL_CONTRACT_VERSION, currentPage: page, totalPages, fromCache: false,
          retrievedAt: now, quota: { kind: "success" },
        }] };
    },
  });
  return { importer, source, saved, dispatched };
}

test("a daily odds mapping resumes from verified pages and does not repeat a completed cohort", async () => {
  const { importer, source, dispatched } = setup([{ data: firstPage, totalPages: 2 }, { data: [mapping(101)], totalPages: 2 }]);
  const partial = await importer.run(1);
  assert.equal(partial.stopped, "request-budget");
  assert.equal(partial.pagesVerified, 1);
  const complete = await importer.run(2);
  assert.equal(complete.status, "complete");
  assert.equal(complete.pagesVerified, 2);
  assert.equal(complete.fixturesVerified, 101);
  assert.equal(complete.requests, 1);
  assert.equal((await importer.run(2)).requests, 0);
  assert.deepEqual(dispatched, [1, 2]);
  assert.deepEqual(await source.readOddsMappingPages("2026-11-13"), []);
});

test("a conflicting valid page remains recorded as incomplete without a repeated dispatch", async () => {
  const { importer, source, dispatched } = setup([{ data: firstPage, totalPages: 2 }, { data: [mapping(100)], totalPages: 2 }]);
  const conflict = await importer.run(2);
  assert.equal(conflict.status, "partial");
  assert.equal(conflict.stopped, "pagination-incomplete");
  assert.equal((await source.readOddsMappingPages(day)).length, 2);
  const repeat = await importer.run(2);
  assert.equal(repeat.status, "partial");
  assert.equal(repeat.requests, 0);
  assert.deepEqual(dispatched, [1, 2]);
});

test("a mapping page from later in the day cannot prove current coverage", async () => {
  const { importer, source, dispatched } = setup([]);
  await source.saveOddsMappingPage(day, { page: 1, totalPages: 1, retrievedAt: now + 1, rows: [mapping(1)] });
  const report = await importer.run(1);
  assert.equal(report.status, "partial");
  assert.equal(report.stopped, "odds-mapping-archive-invalid");
  assert.deepEqual(dispatched, []);
});

test("mapping obeys retention authorization and the dedicated spare quota before dispatch", async () => {
  const closed = setup([], { authorized: () => false });
  assert.equal((await closed.importer.run(1)).stopped, "operation-not-authorized");
  assert.deepEqual(closed.dispatched, []);
  const exhausted = setup([], { canDispatch: async () => false });
  assert.equal((await exhausted.importer.run(1)).stopped, "odds-mapping-quota-unavailable");
  assert.deepEqual(exhausted.dispatched, []);
});

test("adapter requests the documented mapping endpoint and retains only structured fields", async () => {
  const raw = { league: { id: 39, season: 2026 }, fixture: { id: 12, date: "2026-11-14T17:30:00+00:00",
    timestamp: kickoffAt / 1000 }, update: "2026-11-12T12:00:00+00:00", extra: "discard" };
  const provider = resultProvider({ now: () => now }, { respond: (url) => {
    assert.equal(url.pathname, "/odds/mapping");
    assert.deepEqual(Object.fromEntries(url.searchParams), { page: "1" });
    return new Response(JSON.stringify({ get: "odds/mapping", parameters: { page: "1" }, errors: [], results: 1,
      paging: { current: 1, total: 1 }, response: [raw] }), { headers: { "content-type": "application/json" } });
  } });
  const bounds = catalogBounds(now, { priority: "enrichment", maxRows: 100, timeoutMs: 10_000 });
  const response = await provider.adapter.odds.mappingPage(1, bounds, {
    signal: new AbortController().signal, deadlineAt: bounds.deadlineAt, check() {},
  });
  assert.equal(response.status, "complete");
  assert.deepEqual(response.data, [mapping(12)]);
  assert.equal(normalizeFootballHistoryOddsMapping({ ...raw, fixture: { ...raw.fixture, timestamp: 1 } }, now), null);
});

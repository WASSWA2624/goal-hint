import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { createFootballHistoryPlayerStatistics } from "../src/server/football/history-player-statistics.ts";
import { readHistoryPlayerStatisticsTargets } from "../src/server/football/history-reference-targets.ts";
import { createFootballHistorySource } from "../src/server/football/history-source.ts";
import { catalogBounds, catalogResponse } from "./helpers/catalog-fixtures.mjs";
import { resultProvider } from "./helpers/result-sync-fixtures.mjs";

const NOW = Date.parse("2026-11-12T02:00:00Z");
const target = { competitionId: 39, season: 2025 };
const scope = ({ competitionId, season }) => `${competitionId}:${season}`;

function players(selector, count = 20) {
  return Array.from({ length: count }, (_, index) => ({ player: { id: (selector.page - 1) * 20 + index + 1, nationality: "Synthetic" },
    statistics: [{ team: { id: 10 }, league: { id: selector.competitionId, season: selector.season }, shots: { total: 0 } }] }));
}

function response(selector, retrievedAt, totalPages = 2, rows = players(selector), provenance = {}) {
  return { status: "complete", data: rows.map((raw) => ({ raw })), completeness: { complete: true, reasons: [], missingIds: [], missingCoverage: [], invalidRows: 0 },
    provenance: [{ provider: "api-football", endpoint: "playerStatistics", contractVersion: API_FOOTBALL_CONTRACT_VERSION,
      requestParameters: { league: String(selector.competitionId), season: String(selector.season), page: String(selector.page) },
      retrievedAt, providerUpdatedAt: null, fromCache: false, currentPage: selector.page, totalPages, quota: { kind: "success" }, ...provenance }],
    requestsDispatched: 1, error: null };
}

function harness({ respond = response, maximumPage, afterRead } = {}) {
  let now = NOW, dayEnd = NOW + 24 * 3_600_000;
  const saved = new Map(), requests = [], reports = [];
  const persist = (page) => {
    const key = scope(page), pages = saved.get(key) ?? new Map();
    assert.equal(pages.has(page.page), false, "a durable page is never fetched and written again");
    pages.set(page.page, structuredClone(page));
    saved.set(key, pages);
  };
  const options = { maximumPage, now: () => now, providerDayEndsAt: () => dayEnd,
    async readPages(selector) {
      afterRead?.(() => { dayEnd += 24 * 3_600_000; });
      return [...(saved.get(scope(selector))?.values() ?? [])];
    },
    async savePage(page) { persist(page); },
    async playerStatisticsPage(selector, bounds, workflow) {
      assert.equal(bounds.maxRequests, 1);
      assert.equal(bounds.maxPages, 1);
      assert.equal(bounds.maxRows, 20);
      assert.equal(bounds.priority, "enrichment");
      workflow.beforeReserve();
      workflow.beforeDispatch();
      requests.push(selector);
      return respond(selector, ++now);
    },
  };
  return { saved, requests, reports,
    seed(selector, totalPages, rows = players(selector)) {
      persist({ ...selector, rows, totalPages, retrievedAt: NOW - 1000, rowCount: rows.length, playerIds: rows.map((row) => row.player.id) });
    },
    run(input = {}) { return createFootballHistoryPlayerStatistics(options).run({ targets: [target], maxRequests: 3, ...input }, (report) => reports.push(report)); },
  };
}

test("a counted page is saved immediately and a later run resumes through the reported last page", async () => {
  const state = harness();
  const first = await state.run({ maxRequests: 1, targets: [target, target] });
  assert.deepEqual(first, { status: "partial", planned: 1, remaining: 1, requested: 1, archived: 1, skipped: 0,
    deferred: 0, requests: 1, completed: 0, empty: 0, conflicts: 0, limited: 0, stopped: "request-budget" });
  const saved = state.saved.get(scope(target)).get(1);
  assert.deepEqual(saved.rows, players({ ...target, page: 1 }));
  assert.equal(saved.totalPages, 2);
  assert.equal(saved.retrievedAt, NOW + 1);
  assert.equal(saved.rowCount, 20);

  const second = await state.run({ maxRequests: 1 });
  assert.equal(second.status, "complete");
  assert.equal(second.completed, 1);
  assert.equal(second.skipped, 1);
  assert.equal(second.archived, 1);
  assert.deepEqual(state.requests.map(({ page }) => page), [1, 2]);
  assert.equal(state.saved.get(scope(target)).get(2).rowCount, 20);
  assert.equal((await state.run()).requests, 0);
});

test("having only the reported last page does not complete a season and valid empty coverage is tracked", async () => {
  const gap = harness();
  gap.seed({ ...target, page: 2 }, 2);
  const filled = await gap.run();
  assert.equal(filled.status, "complete");
  assert.deepEqual(gap.requests.map(({ page }) => page), [1]);

  const empty = harness({ respond: (selector, at) => response(selector, at, 1, []) });
  const result = await empty.run();
  assert.equal(result.status, "complete");
  assert.equal(result.empty, 1);
  assert.deepEqual(empty.saved.get(scope(target)).get(1).playerIds, []);
  assert.equal((await empty.run()).empty, 1);
});

test("a full page cannot establish coverage without the right pagination, selector, and player scope", async () => {
  const invalid = [
    (selector, at) => response(selector, at, null),
    (selector, at) => response(selector, at, 2, players(selector, 19)),
    (selector, at) => response(selector, at, 2, players(selector), { currentPage: 2 }),
    (selector, at) => response(selector, at, 2, players(selector), { requestParameters: { league: "40", season: "2025", page: "1" } }),
    (selector, at) => response(selector, at, 2, players({ ...selector, season: 2024 })),
    (selector, at) => response(selector, at, 2, players(selector), { fromCache: true }),
  ];
  for (const respond of invalid) {
    const state = harness({ respond });
    const result = await state.run();
    assert.equal(result.status, "partial");
    assert.equal(result.requests, 1);
    assert.equal(result.deferred, 1);
    assert.equal(result.completed, 0);
    assert.equal(state.saved.size, 0);
  }
});

test("pagination drift and duplicate identities never replace saved pages or claim completion", async () => {
  const drift = harness({ respond: (selector, at) => response(selector, at, 3) });
  drift.seed({ ...target, page: 1 }, 2);
  assert.equal((await drift.run()).conflicts, 1);
  assert.equal(drift.reports[0].reason, "page-count-changed");
  assert.equal(drift.saved.get(scope(target)).size, 1);

  const duplicates = harness({ respond: (selector, at) => response(selector, at, 2, players({ ...selector, page: 1 })) });
  duplicates.seed({ ...target, page: 1 }, 2);
  const result = await duplicates.run();
  assert.equal(result.status, "partial");
  assert.equal(result.conflicts, 1);
  assert.equal(duplicates.reports[0].reason, "duplicate-player");
  assert.equal(duplicates.saved.get(scope(target)).size, 1);

  const storedConflict = harness();
  storedConflict.seed({ ...target, page: 1 }, 2);
  storedConflict.seed({ ...target, page: 2 }, 3);
  assert.equal((await storedConflict.run()).conflicts, 1);
  assert.equal(storedConflict.requests.length, 0);
});

test("plan limits and a provider day rollover leave the season incomplete without excess dispatch", async () => {
  const limited = harness({ maximumPage: 3, respond: (selector, at) => response(selector, at, 4) });
  const first = await limited.run({ maxRequests: 10 });
  assert.equal(first.status, "partial");
  assert.equal(first.limited, 1);
  assert.deepEqual(limited.requests.map(({ page }) => page), [1, 2, 3]);
  assert.equal((await limited.run()).requests, 0);

  const rollover = harness({ afterRead: (rolloverDay) => rolloverDay() });
  assert.equal((await rollover.run()).stopped, "provider-day-ended");
  assert.equal(rollover.requests.length, 0);
});

test("quota refusal halts before the next target and newer seasons go first", async () => {
  const refused = harness({ respond: () => ({ status: "failed", data: [], completeness: { complete: false, reasons: ["quota-denied"],
    missingIds: [], missingCoverage: [], invalidRows: 0 }, provenance: [], requestsDispatched: 0, error: { reason: "quota-denied", retryable: false } }) });
  const latest = { ...target, season: target.season + 1 };
  const result = await refused.run({ targets: [target, latest] });
  assert.equal(result.status, "partial");
  assert.equal(result.stopped, "quota-denied");
  assert.equal(result.requests, 0);
  assert.deepEqual(refused.requests, [{ ...latest, page: 1 }]);
  assert.equal(refused.saved.size, 0);
});

test("the counted adapter fetches exactly the requested raw page and rejects unrelated rows", async () => {
  const selector = { ...target, page: 2 };
  let raw = players(selector);
  const provider = resultProvider({ now: () => NOW }, { respond: (url) => {
    assert.equal(url.pathname, "/players");
    assert.deepEqual(Object.fromEntries(url.searchParams), { league: "39", season: "2025", page: "2" });
    return catalogResponse(url, raw, { paging: { current: 2, total: 3 } });
  } });
  const bounds = catalogBounds(NOW, { priority: "enrichment", maxRows: 20, timeoutMs: 10_000 });
  const result = await provider.adapter.reference.playerStatisticsPage(selector, bounds);
  assert.equal(result.status, "complete");
  assert.equal(result.requestsDispatched, 1);
  assert.equal(result.provenance[0].currentPage, 2);
  assert.equal(result.provenance[0].totalPages, 3);
  assert.deepEqual(result.data.map(({ raw }) => raw), raw);
  assert.equal(provider.network.length, 1);
  assert.equal(provider.reservations.length, 1);
  raw = [players({ ...selector, season: 2024 }, 1)[0], ...raw.slice(1)];
  const foreign = await provider.adapter.reference.playerStatisticsPage(selector, bounds);
  assert.equal(foreign.status, "partial");
  assert.equal(foreign.completeness.invalidRows, 1);
  assert.equal(foreign.requestsDispatched, 1);
  assert.equal((await provider.adapter.reference.playerStatisticsPage({ ...selector, page: 0 }, bounds)).requestsDispatched, 0);
});

test("raw page envelopes share a source selector and restore their verified player identities", async () => {
  const saved = [];
  const database = { async query(operation) { return operation({ footballHistorySourcePage: {
    async createMany({ data }) { saved.push(data); return { count: 1 }; },
    async findMany({ where }) { return saved.filter((page) => page.endpoint === where.endpoint && page.selectorHash === where.selectorHash); },
  } }); } };
  const source = createFootballHistorySource(database);
  const retrievedAt = Date.now() - 1000;
  for (const page of [1, 2]) {
    const selector = { ...target, page };
    const rows = players(selector, page === 1 ? 20 : 3);
    await source.savePlayerStatisticsPage({ ...selector, rows, totalPages: 2, retrievedAt: retrievedAt + page,
      rowCount: rows.length, playerIds: rows.map(({ player }) => player.id) });
  }
  assert.deepEqual(saved.map(({ parameters }) => parameters), [{ league: "39", season: "2025" }, { league: "39", season: "2025" }]);
  assert.equal(saved[0].selectorHash, saved[1].selectorHash);
  assert.notEqual(saved[0].id, saved[1].id);
  assert.deepEqual(JSON.parse(gunzipSync(saved[1].compressedRows).toString()), { provider: "api-football", contract: API_FOOTBALL_CONTRACT_VERSION,
    page: 2, totalPages: 2, retrievedAt: retrievedAt + 2, rows: players({ ...target, page: 2 }, 3) });
  const pages = await source.readPlayerStatisticsPages(target);
  assert.deepEqual(pages.map(({ page, totalPages, rowCount }) => ({ page, totalPages, rowCount })),
    [{ page: 1, totalPages: 2, rowCount: 20 }, { page: 2, totalPages: 2, rowCount: 3 }]);
  assert.deepEqual(pages[1].playerIds, [21, 22, 23]);
  assert.deepEqual(await source.readPlayerStatisticsPages({ ...target, season: 2024 }), []);
  saved[0].contentHash = "bad";
  assert.equal(await source.readPlayerStatisticsPages(target), null);
});

test("player-statistics planning uses observed approved seasons and skips explicit noncoverage", async () => {
  const season = (year, ids, coverage) => ({ year, coverage, competition: { providers: ids.map((externalId) => ({ externalId })) } });
  const database = { async query(operation) { return operation({ footballSeason: { async findMany(query) {
    assert.equal(query.where.fixtures.some.provider, "api-football");
    assert.deepEqual(query.where.competition.providers.some.externalId.in, [39n, 40n]);
    return [season(2026, [39n], { players: true }), season(2025, [39n], { players: false }),
      season(2024, [40n], null), season(2023, [39n, 40n], { players: true }), season(2022, [55n], null)];
  } } }); } };
  assert.deepEqual(await readHistoryPlayerStatisticsTargets(database, [39, 40]), [
    { competitionId: 39, season: 2026 }, { competitionId: 40, season: 2024 },
  ]);
});

import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { catalogScopeKey } from "../src/server/football/catalog-input.ts";
import { readFootballArchiveCompletion } from "../src/server/football/history-completion.ts";
import { readFootballArchiveCoverage } from "../src/server/football/history-coverage.ts";
import { footballHistoryFixtureScopeFingerprint } from "../src/server/football/history-fixture-scope.ts";
import { catalogFixture, catalogHash, CATALOG_NOW } from "./helpers/catalog-fixtures.mjs";

function page(endpoint, parameters, value, retrievedAt = CATALOG_NOW) {
  const selectorHash = catalogHash(JSON.stringify(parameters));
  const body = Buffer.from(JSON.stringify(value)), contentHash = catalogHash(body);
  const id = catalogHash(JSON.stringify([endpoint, selectorHash, retrievedAt, contentHash]));
  const rows = Array.isArray(value) ? value : value.rows;
  return { id, endpoint, parameters, selectorHash, retrievedAt: new Date(retrievedAt), contentHash, rowCount: rows.length,
    compressedRows: gzipSync(body), contract: API_FOOTBALL_CONTRACT_VERSION };
}

function fixturePage(season, rows) {
  return page("fixtures", { league: "39", season: String(season), timezone: "Africa/Kampala" }, rows);
}

function receipt(season, overrides = {}) {
  return { id: String(season), scopeKey: catalogScopeKey({ kind: "fixtures", query: { competitionId: 39, season } }),
    status: "complete", observedAt: new Date(CATALOG_NOW), receivedCount: 1, rejectedCount: 0,
    requestsDispatched: 1, reasons: [], ...overrides };
}

function database({ catalog, fixtures = [], receipts = [], extraPages = [], upcoming = [], details = null }) {
  const pages = [catalog, ...fixtures, ...extraPages].filter(Boolean);
  const matchingPages = (where) => pages.filter((row) =>
    (where.endpoint === undefined || where.endpoint === row.endpoint) &&
    (where.contract === undefined || where.contract === row.contract) &&
    (where.selectorHash === undefined || where.selectorHash === row.selectorHash) &&
    (where.rowCount === undefined || where.rowCount === row.rowCount) &&
    (where.retrievedAt === undefined || (where.retrievedAt instanceof Date
      ? row.retrievedAt.getTime() === where.retrievedAt.getTime() : row.retrievedAt <= where.retrievedAt.lte)) &&
    (where.id === undefined || row.id > where.id.gt));
  const client = {
    footballHistorySourcePage: {
      async findFirst() { return catalog; },
      async findMany({ where, take }) {
        return matchingPages(where).sort((left, right) => left.id.localeCompare(right.id)).slice(0, take);
      },
      async count({ where }) { return matchingPages(where).length; },
      async groupBy() { return []; },
    },
    footballImport: { async findMany({ where }) { return receipts.filter(({ scopeKey }) => where.scopeKey.in.includes(scopeKey)); } },
    footballFixture: { async count() { return details ? Number(details.eligible) : 3; } },
    footballCompetitionProvider: { async findMany() { return details ? [{ externalId: 39n }] : []; } },
    async $queryRaw(query) {
      if (query.sql?.includes("AS fixtureCoverage")) return [details];
      if (Array.isArray(query) && query[0].includes("AS upcoming")) return upcoming;
      return [];
    },
  };
  return { query: (read) => read(client) };
}

test("coverage checks exact receipt observation, distinguishes verified empties and leaves partitions and raw-only scopes unresolved", async () => {
  const catalog = page("competitions", {}, [{ league: { id: 39 }, seasons: [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2026, 2027]
    .map((year) => ({ year })) }]);
  const report = await readFootballArchiveCoverage(database({ catalog, fixtures: [
    fixturePage(2026, [catalogFixture(100)]), fixturePage(2025, []),
    fixturePage(2024, [catalogFixture(101, { season: 2024 })]),
    fixturePage(2022, [catalogFixture(102, { season: 2022 })]),
  ], receipts: [
    receipt(2026), receipt(2025, { receivedCount: 0 }),
    receipt(2024, { observedAt: new Date(CATALOG_NOW - 1) }),
    receipt(2023, { status: "failed", reasons: ["response-too-large"] }),
    receipt(2022, { status: "partial", reasons: ["schema-error"], rejectedCount: 1 }),
    receipt(2021, { status: "failed", reasons: ["transport-error"] }),
  ] }), CATALOG_NOW + 1);
  assert.equal(report.requests, 0);
  assert.equal(report.catalog.futureSeasonLabels, 1);
  assert.deepEqual(report.fixtureSeasons, { throughSeason: 2026, total: 7, verifiedData: 1, verifiedEmpty: 1, rawOnly: 1,
    unverifiedSource: 1, partitionRequired: 1, retryPending: 1, unattempted: 1, verifiedComplete: false });
});

test("missing or malformed catalog identities cannot establish complete season coverage", async () => {
  const catalog = page("competitions", {}, [{ league: { id: 39 }, seasons: [{ year: 2025 }, { year: "unknown" }] }]);
  const report = await readFootballArchiveCoverage(database({ catalog, fixtures: [fixturePage(2025, [])],
    receipts: [receipt(2025, { receivedCount: 0 })] }), CATALOG_NOW + 1);
  assert.equal(report.catalog.invalidSeasons, 1);
  assert.equal(report.fixtureSeasons.verifiedEmpty, 1);
  assert.equal(report.fixtureSeasons.verifiedComplete, false);
});

function completionFixture({ corrupt = false } = {}) {
  const at = CATALOG_NOW + 1, providerDayEndsAt = Date.parse("2026-10-10T00:00:00Z");
  const day = "2026-10-09", settled = { status: "complete", stopped: null };
  const coverage = { eligible: 1, storedComplete: 0, unsupported: 1, exhausted: 0, delayed: 0, due: 0 };
  const pass = {
    fixtures: { ...settled, planned: 2, completed: 2, archivedOnly: 0, deferred: 0, imported: 0, processed: 0,
      unlistedCompetitions: [], providerDayEndsAt,
      fixtureScopeFingerprint: footballHistoryFixtureScopeFingerprint([2026, 2027].map((season) => ({ competitionId: 39, season }))) },
    details: { status: "partial", passComplete: true, stopped: null, requests: 0, received: 0, written: 0, coverage },
    reference: { ...settled, archived: 0, deferred: 0, verification: { complete: true, scope: "discovered", providerDayEndsAt, reason: null },
      oddsMapping: { ...settled, day, totalPages: 1, pagesVerified: 1, fixturesVerified: 0 } },
    replay: { ...settled, pending: 0, unverified: 0, written: 0, imported: 0 },
  };
  const dictionary = page("countries", {}, [{ name: "Uganda" }]);
  if (corrupt) dictionary.compressedRows = new Uint8Array();
  const db = database({
    catalog: page("competitions", {}, [{ league: { id: 39 }, seasons: [{ year: 2026 }, { year: 2027 }, { year: 2028 }] }]),
    fixtures: [fixturePage(2026, [catalogFixture(101)]), fixturePage(2027, [catalogFixture(102, { season: 2027 })])],
    receipts: [receipt(2026), receipt(2027)],
    extraPages: [dictionary, page("oddsMapping", { archiveDay: day }, { page: 1, totalPages: 1, retrievedAt: CATALOG_NOW, rows: [] })],
    upcoming: [{ id: 39n, year: 2027, upcoming: 1n }],
    details: { ...coverage, delayedCount: 0, nextCheckAt: null },
  });
  return { at, providerDayEndsAt, pass, db, clock: { now: () => at } };
}

test("completion checks the precise archive scope including active future seasons and explicit detail noncoverage", async () => {
  const { at, pass, db, clock } = completionFixture();
  const result = await readFootballArchiveCompletion(db, at, pass, clock);
  assert.equal(result.status, "complete");
  assert.equal(result.scope, "historical-archive");
  assert.equal(result.requests, 0);
  assert.equal(result.fixtures.total, 2);
  assert.equal(result.matchDetails.unsupported, 1);
  assert.match(result.snapshotId, /^[a-f0-9]{64}$/u);
  pass.fixtures.fixtureScopeFingerprint = footballHistoryFixtureScopeFingerprint([2026, 2028].map((season) => ({ competitionId: 39, season })));
  assert.deepEqual((await readFootballArchiveCompletion(db, at, pass, clock)).pending, ["fixture-seasons-unverified"]);
});

test("incomplete passes and stale daily odds evidence cannot start a full completion audit", async () => {
  const { at, pass, clock } = completionFixture();
  const db = { query: () => assert.fail("An incomplete pass must not start a database audit.") };
  pass.details.coverage.exhausted = 1;
  assert.deepEqual((await readFootballArchiveCompletion(db, at, pass, clock)).pending, ["details-pass-unverified"]);
  pass.details.coverage.exhausted = 0;
  pass.reference.oddsMapping.day = "2026-10-08";
  assert.deepEqual((await readFootballArchiveCompletion(db, at, pass, clock)).pending, ["provider-day-changed"]);
});

test("corrupt retained reference pages and a day rollover keep an otherwise complete pass pending", async () => {
  const corrupt = completionFixture({ corrupt: true });
  assert.deepEqual((await readFootballArchiveCompletion(corrupt.db, corrupt.at, corrupt.pass, corrupt.clock)).pending,
    ["archived-pages-unverified"]);
  const { db, at, pass, providerDayEndsAt } = completionFixture();
  assert.deepEqual((await readFootballArchiveCompletion(db, at, pass, { now: () => providerDayEndsAt })).pending, ["provider-day-changed"]);
});

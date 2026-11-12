import assert from "node:assert/strict";
import test from "node:test";
import { createApiFootballAdapter } from "../src/server/football/api-football-adapter.ts";
import { createFootballHistoryReference } from "../src/server/football/history-reference.ts";
import { createQuotaGateway } from "../src/server/football/quota-gateway.ts";
import { catalogBounds, catalogHash, catalogResponse, catalogTeam, CATALOG_NOW } from "./helpers/catalog-fixtures.mjs";

const league = { id: 39, season: 2025 };
const venue = { id: 117, name: "Synthetic Ground", capacity: 42_000 };
const injury = { player: { id: 79, type: "Missing Fixture", reason: "Synthetic injury" }, fixture: { id: 1234 },
  team: { id: 10 }, league };
const transfers = [{ date: "2025-07-01", type: "Loan", teams: { in: { id: 10 }, out: { id: 20 } } },
  { date: "2021-07-01", type: "Free", teams: { in: { id: 30 }, out: { id: 40 } } }];
const scenarios = [
  [{ endpoint: "teams", competitionId: 39, season: 2025 }, { league: "39", season: "2025" }, [{ team: catalogTeam(10), venue }]],
  [{ endpoint: "standings", competitionId: 39, season: 2025 }, { league: "39", season: "2025" },
    [{ league: { ...league, standings: [[{ rank: 1, team: { id: 10 }, points: 81 }], [{ rank: 1, team: { id: 20 }, points: 75 }]] } }]],
  [{ endpoint: "injuries", competitionId: 39, season: 2025 }, { league: "39", season: "2025" },
    [injury, { ...injury, fixture: { id: 1235 } }]],
  [{ endpoint: "venues", venueId: 117 }, { id: "117" }, [venue]],
  [{ endpoint: "transfers", teamId: 10 }, { team: "10" }, [{ player: { id: 79 }, transfers }]],
];

function setup(respond) {
  const transport = [], reservations = [], pages = [];
  let currentTime = CATALOG_NOW;
  const clock = { now: () => currentTime };
  const authorize = () => undefined;
  const limiter = {
    async reserve(request) {
      reservations.push(request);
      return { status: "reserved", permit: { requestId: request.requestId, periodId: catalogHash("reference-day"),
        ownerToken: catalogHash(request.requestId), dispatchedAt: currentTime, launchBefore: currentTime + 1000 } };
    },
    async claimLaunch() { return { status: "claimed", timeoutMs: 1000 }; },
    async complete() { return { status: "recorded" }; },
  };
  const adapter = createApiFootballAdapter({ accountId: catalogHash("synthetic-reference-account"), clock,
    credential: { read: () => "synthetic-reference-key" }, gateway: createQuotaGateway({ limiter, authorize }), authorize,
    async fetcher(input) {
      const url = new URL(input);
      transport.push(url);
      currentTime += 100;
      return respond(url);
    } });
  const importer = createFootballHistoryReference({ reference: adapter.reference, now: clock.now,
    providerDayEndsAt: () => CATALOG_NOW + 60_000,
    async hasPage({ endpoint, parameters }) {
      return pages.some((page) => page.endpoint === endpoint && JSON.stringify(page.parameters) === JSON.stringify(parameters));
    },
    async savePage(page) { pages.push(page); },
  });
  return { adapter, importer, clock, pages, transport, reservations };
}

test("archives all five documented nonpaginated reference scopes with provider retrieval times and unchanged raw fields", async () => {
  const { importer, transport, pages, reservations } = setup((url) => {
    const [target, parameters, rows] = scenarios.find(([target]) => url.pathname === `/${target.endpoint}`);
    assert.equal(url.origin, "https://v3.football.api-sports.io");
    assert.equal(url.pathname, `/${target.endpoint}`);
    assert.deepEqual(Object.fromEntries(url.searchParams), parameters);
    return catalogResponse(url, rows);
  });
  const targets = scenarios.map(([target]) => target);
  const report = await importer.run({ targets, maxRequests: 5 });
  assert.deepEqual(report, { status: "complete", requested: 5, archived: 5, skipped: 0, deferred: 0, requests: 5, stopped: null });
  assert.deepEqual(pages, scenarios.map(([target, parameters, rows], index) => ({ endpoint: target.endpoint,
    parameters, rows, retrievedAt: CATALOG_NOW + (index + 1) * 100 })));
  assert.ok(reservations.every(({ priority }) => priority === "enrichment"));
  assert.equal(transport.length, 5);
  assert.equal((await importer.run({ targets: [...targets, targets[0]], maxRequests: 1 })).skipped, 5);
  assert.equal(transport.length, 5);
});

test("handles a complete empty response durably and starts with the newest unresolved season", async () => {
  const { importer, transport, pages } = setup((url) => catalogResponse(url, []));
  const targets = [2024, 2025, 2026].map((season) => ({ endpoint: "standings", competitionId: 39, season }));
  assert.deepEqual(await importer.run({ targets, maxRequests: 1 }),
    { status: "partial", requested: 1, archived: 1, skipped: 0, deferred: 0, requests: 1, stopped: "request-budget" });
  assert.equal((await importer.run({ targets, maxRequests: 1 })).skipped, 1);
  assert.deepEqual(transport.map((url) => url.searchParams.get("season")), ["2026", "2025"]);
  assert.deepEqual(pages.map(({ rows }) => rows), [[], []]);
});

test("leaves mismatched rows, truncated pagination, and omitted selector echoes unresolved", async () => {
  const invalid = new Map([
    ["/teams", (url) => new Response(JSON.stringify({ get: "teams", parameters: { league: url.searchParams.get("league") },
      errors: [], results: 0, paging: { current: 1, total: 1 }, response: [] }), { headers: { "content-type": "application/json" } })],
    ["/standings", (url) => catalogResponse(url, [], { paging: { current: 1, total: 2 } })],
    ["/injuries", (url) => catalogResponse(url, [{ ...injury, league: { ...league, season: 2024 } }])],
    ["/venues", (url) => catalogResponse(url, [{ ...venue, id: 118 }])],
    ["/transfers", (url) => catalogResponse(url, [{ player: { id: 79 }, transfers: transfers.slice(1) }])],
  ]);
  const { importer, transport, pages } = setup((url) => invalid.get(url.pathname)(url));
  const targets = scenarios.map(([target]) => target);
  assert.deepEqual(await importer.run({ targets, maxRequests: 5 }),
    { status: "partial", requested: 5, archived: 0, skipped: 0, deferred: 5, requests: 5, stopped: null });
  assert.equal(transport.length, 5);
  assert.deepEqual(pages, []);
  assert.equal((await importer.run({ targets, maxRequests: 1 })).requested, 1);
  assert.equal(transport.length, 6);
});

test("validates targets before quota reservation and stops on interruption and provider throttling", async () => {
  const { importer, adapter, reservations, transport } = setup((url) => catalogResponse(url, [], { status: 429 }));
  const targets = scenarios.map(([target]) => target);
  const badTarget = { endpoint: "teams", competitionId: 39, season: 0 };
  assert.equal((await adapter.reference.page(badTarget, catalogBounds())).error.reason, "invalid-request");
  await assert.rejects(importer.run({ targets: [...targets, badTarget], maxRequests: 5 }), /Invalid historical reference target/);
  await assert.rejects(importer.run({ targets, maxRequests: 101 }), /request limit/);
  assert.equal((await importer.run({ targets, maxRequests: 5, signal: AbortSignal.abort() })).stopped, "interrupted");
  assert.equal(reservations.length, 0);
  assert.equal(transport.length, 0);
  const report = await importer.run({ targets, maxRequests: 5 });
  assert.equal(report.stopped, "rate-limited");
  assert.equal(report.requests, 1);
  assert.equal(transport.length, 1);
});

test("does not share the raw teams projection with an overlapping normalized teams request", async () => {
  const { adapter, transport } = setup((url) => catalogResponse(url, [{ team: catalogTeam(10), venue }]));
  const [target] = scenarios[0];
  const bounds = catalogBounds();
  const [normal, archived] = await Promise.all([
    adapter.evidence.teams({ competitionId: target.competitionId, season: target.season }, bounds),
    adapter.reference.page(target, bounds),
  ]);
  assert.equal(normal.status, "complete");
  assert.equal(normal.data[0].name, "Synthetic club 10");
  assert.equal(archived.status, "complete");
  assert.deepEqual(archived.data[0].raw.venue, venue);
  assert.equal(transport.length, 2);
});

test("does not dispatch after a provider day rollover while checking stored coverage", async () => {
  const { adapter, clock, transport } = setup((url) => catalogResponse(url, []));
  let providerDayEnd = CATALOG_NOW + 60_000;
  const importer = createFootballHistoryReference({ reference: adapter.reference, now: clock.now,
    providerDayEndsAt: () => providerDayEnd,
    async hasPage() { providerDayEnd += 86_400_000; return false; },
    async savePage() { assert.fail("unexpected archive write"); },
  });
  const report = await importer.run({ targets: scenarios.map(([target]) => target), maxRequests: 5 });
  assert.equal(report.stopped, "provider-day-ended");
  assert.equal(report.requests, 0);
  assert.deepEqual(transport, []);
});

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createApiFootballAdapter } from "../../src/server/football/api-football-adapter.ts";
import { createQuotaGateway } from "../../src/server/football/quota-gateway.ts";

// All provider bodies, approvals and clocks in this helper are synthetic. The
// real adapter and quota gateway run, but their transport never uses the network.
export const CATALOG_NOW = Date.parse("2026-10-09T08:00:00.000Z");
export const catalogHash = (value) => createHash("sha256").update(value).digest("hex");

export function catalogTeam(id = 10, overrides = {}) {
  return { id, name: `Synthetic club ${id}`, code: `T${id}`, country: "Synthetic country", national: false,
    logo: `https://media.api-sports.io/football/teams/${id}.png`, ...overrides };
}

export function catalogFixture(id = 101, overrides = {}) {
  const kickoff = overrides.kickoff ?? "2026-10-09T21:30:00.000Z";
  const status = overrides.status ?? "NS";
  const { competitionId = 39, season = 2026, homeId = 10, awayId = 20 } = overrides;
  const rawOverrides = Object.fromEntries(Object.entries(overrides).filter(([key]) =>
    !["kickoff", "status", "competitionId", "season", "homeId", "awayId"].includes(key)));
  return {
    fixture: { id, date: kickoff, timezone: "UTC", timestamp: kickoff === null ? null : Date.parse(kickoff) / 1000,
      status: { short: status, elapsed: status === "NS" ? null : 90 } },
    league: { id: competitionId, name: `Synthetic competition ${competitionId}`, country: "Synthetic country",
      season, round: "Synthetic round 1" },
    teams: { home: catalogTeam(homeId), away: catalogTeam(awayId) },
    goals: { home: null, away: null }, score: { fulltime: null, extratime: null, penalty: null },
    ...rawOverrides,
  };
}

export function catalogCompetition(id = 39, season = 2026, overrides = {}) {
  return { league: { id, name: `Synthetic competition ${id}`, type: "League",
    logo: `https://media.api-sports.io/football/leagues/${id}.png` },
  country: { name: "Synthetic country" }, seasons: [{ year: season, current: true,
    coverage: { fixtures: { events: true, lineups: false, statistics_fixtures: true,
      statistics_players: false }, standings: true, players: false, predictions: false } }], ...overrides };
}

export function catalogBounds(now = CATALOG_NOW, overrides = {}) {
  return { priority: "daily-inputs", deadlineAt: now + 120_000, timeoutMs: 1000,
    maxRequests: 1, maxPages: 1, maxRows: 100, maxResponseBytes: 100_000,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0, ...overrides };
}

export function catalogRequest(selection, now = CATALOG_NOW, overrides = {}) {
  return { id: randomUUID(), selection, bounds: catalogBounds(now),
    retentionEvidenceRef: "synthetic-catalog-retention", ...overrides };
}

export function catalogResponse(url, rows, options = {}) {
  return new Response(JSON.stringify({ get: url.pathname.slice(1), parameters: Object.fromEntries(url.searchParams),
    errors: options.errors ?? [], results: rows.length, paging: options.paging ?? { current: 1, total: 1 },
    response: rows }), { status: options.status ?? 200,
    headers: { "content-type": "application/json", ...options.headers } });
}

export function createSyntheticCatalogAdapter({ rows = [], authorize = () => {},
  respond, verifyLogo = () => true, verifyRegulationScore = () => true } = {}) {
  const clock = { value: CATALOG_NOW, now() { return this.value; } };
  const requests = [], completions = [], network = [];
  const limiter = {
    async reserve(request) {
      requests.push(request);
      return { status: "reserved", permit: { requestId: request.requestId,
        periodId: catalogHash("synthetic-catalog-period"), ownerToken: catalogHash(request.requestId),
        dispatchedAt: clock.value, launchBefore: clock.value + 1000 } };
    },
    async claimLaunch() { return { status: "claimed", timeoutMs: 1000 }; },
    async complete(permit, feedback) { completions.push({ permit, feedback }); return { status: "recorded" }; },
  };
  const adapter = createApiFootballAdapter({ accountId: catalogHash("synthetic-catalog-account"),
    credential: { read: () => "synthetic-catalog-private-key" },
    gateway: createQuotaGateway({ limiter, authorize }), authorize, clock,
    verifyLogo, verifyRegulationScore, sleep: async (ms) => { clock.value += ms; }, random: () => 0.5,
    fetcher: async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      assert.equal(url.origin, "https://v3.football.api-sports.io");
      assert.ok(["/fixtures", "/teams", "/leagues"].includes(url.pathname), "catalog must not fetch binary media or unrelated endpoints");
      assert.equal(init.redirect, "error");
      network.push({ url, init });
      return respond ? respond(url, init, network.length) : catalogResponse(url, rows);
    } });
  return { adapter, clock, requests, completions, network };
}

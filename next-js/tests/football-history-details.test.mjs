import assert from "node:assert/strict";
import test from "node:test";
import { createFootballHistoryDetails } from "../src/server/football/history-details.ts";
import { catalogFixture } from "./helpers/catalog-fixtures.mjs";
import { resultProvider } from "./helpers/result-sync-fixtures.mjs";

const NOW = Date.parse("2026-11-12T02:00:00Z");
const KICKOFF = "2026-11-11T20:00:00.000Z";
const fixtureId = "53bf9ce7-7e07-4379-853e-5afff73aa966";
const statistics = (id, value) => ({ team: { id }, statistics: [{ type: "Corner Kicks", value }] });
const event = (elapsed) => ({ time: { elapsed, extra: null }, team: { id: 10 }, player: { name: "Synthetic player" },
  type: "Card", detail: "Yellow Card" });

function fixture(overrides = {}) {
  const row = catalogFixture(101, { status: "FT", kickoff: KICKOFF, goals: { home: 1, away: 0 },
    score: { fulltime: { home: 1, away: 0 }, extratime: null, penalty: null }, ...overrides });
  row.fixture.referee = " Synthetic referee ";
  row.fixture.venue = { id: 12, name: "Synthetic stadium", city: "Synthetic city" };
  return row;
}

function harness(previousFacts = null) {
  let now = NOW, facts = previousFacts, archive = null;
  const provider = resultProvider({ now: () => now });
  const target = { fixtureId, externalId: 101n, competitionId: 39n, season: 2026, kickoffAt: new Date(KICKOFF),
    homeExternalId: 10n, awayExternalId: 20n, homeGoals: 1, awayGoals: 0,
    coverage: { "fixtures.events": true, "fixtures.statistics_fixtures": true, "fixtures.lineups": false, "fixtures.statistics_players": false } };
  const flags = () => ({ hasInfo: Boolean(facts?.venueName || facts?.referee), hasEvents: Boolean(facts?.events?.length),
    hasStatistics: facts?.statistics?.length === 2 && facts.statistics.every((row) => row.statistics.length > 0), hasLineups: false, hasPlayers: false });
  const tx = {
    async $queryRaw(statement, id) {
      if (Array.isArray(statement)) {
        assert.match(statement.join("?"), /^SELECT id FROM FootballFixture/u);
        assert.equal(id, fixtureId);
        return [{ id }];
      }
      if (statement.sql.includes("WHERE facts.fixtureId=")) return [flags()];
      assert.match(statement.sql, /regulationVerifiedAt IS NOT NULL/u);
      if (statement.sql.includes("detail.nextCheckAt<=") && archive && (archive.nextCheckAt === null || archive.nextCheckAt > now)) return [];
      return [{ ...target, ...flags(), archiveState: archive?.state ?? null, nextCheckAt: archive?.nextCheckAt ?? null }];
    },
    footballHistoryDetailState: {
      async upsert({ create, update }) { archive = archive ? { ...archive, ...update } : create; },
      async update({ data }) { archive = { ...archive, ...data }; },
    },
    fixtureFacts: {
      async findUnique() { return facts; },
      async upsert({ create, update }) { facts = facts ? { ...facts, ...update } : create; },
    },
  };
  const database = { async query(operation) { return operation(tx); }, async transaction(operation) { return operation(tx); } };
  const run = createFootballHistoryDetails({ database, adapter: provider.adapter.evidence, batchSize: 20, competitionIds: [39],
    now: () => now, providerDayEndsAt: () => NOW + 7 * 86_400_000 });
  return { run, provider, get facts() { return facts; }, get archive() { return archive; }, advance(ms) { now += ms; } };
}

test("historical detail preserves saved facts, adds missing team and fixture information, and records terminal coverage", async () => {
  const retained = { events: [event(18)], statistics: [statistics(10, 3), { team: { id: 20 }, statistics: [] }], venueName: "SYNTHETIC STADIUM" };
  const state = harness(retained);
  state.provider.state.rows = [fixture({ events: [event(24)], statistics: [statistics(20, 0), statistics(10, 9)], lineups: [], players: [] })];
  const result = await state.run({ maxRequests: 2 });
  assert.deepEqual(result, { status: "complete", requested: 1, received: 1, written: 1, completed: 1, deferred: 0, requests: 1, stopped: null });
  assert.equal(state.provider.network[0].url.searchParams.get("ids"), "101");
  assert.deepEqual(state.facts.events, retained.events);
  assert.deepEqual(state.facts.statistics, [statistics(10, 3), statistics(20, 0)]);
  assert.equal(state.facts.venueName, "SYNTHETIC STADIUM");
  assert.equal(state.facts.venueExternalId, 12n);
  assert.equal(state.facts.venueCity, "Synthetic city");
  assert.equal(state.facts.referee, "Synthetic referee");
  assert.deepEqual(state.archive.state.sections, { info: "available", events: "available", statistics: "available", lineups: "unsupported", players: "unsupported" });
  assert.equal(state.archive.nextCheckAt, null);
  assert.equal((await state.run({ maxRequests: 2 })).requests, 0);
});

test("an uncorrelated fixture and a failed dispatch preserve facts and retry without inventing evidence", async () => {
  const state = harness();
  state.provider.state.rows = [fixture({ awayId: 99, events: [] })];
  const wrongTeam = await state.run({ maxRequests: 2 });
  assert.equal(wrongTeam.received, 0);
  assert.equal(state.facts, null);
  assert.equal(state.archive.state.attempts, 1);
  assert.equal(state.archive.state.observations, 1);
  assert.ok(Object.values(state.archive.state.sections).every((section) => section === "missing"));
  assert.equal((await state.run({ maxRequests: 2 })).requests, 0);

  state.advance(86_400_000);
  state.provider.state.status = 503;
  assert.equal((await state.run({ maxRequests: 2 })).written, 0);
  assert.equal(state.archive.state.attempts, 2);
  assert.equal(state.archive.state.observations, 1);
  assert.ok(state.archive.nextCheckAt);

  state.advance(15 * 60_000);
  state.provider.state.status = 200;
  state.provider.state.rows = [fixture({ events: [], statistics: [statistics(10, 1), statistics(20, 0)] })];
  assert.equal((await state.run({ maxRequests: 2 })).completed, 1);
  assert.equal(state.archive.state.sections.events, "known-empty");
  assert.equal(state.facts.events, undefined);
  assert.equal(state.archive.nextCheckAt, null);
});

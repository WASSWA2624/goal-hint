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
const lineup = (id) => ({ team: { id }, formation: "4-4-2", startXI: [{ player: { id, name: "Synthetic player", number: 1, pos: "G", grid: "1:1" } }] });
const playerFacts = (id) => ({ team: { id }, players: [{ player: { id }, statistics: [{ games: { minutes: 90 } }] }] });

function fixture(overrides = {}) {
  const row = catalogFixture(101, { status: "FT", kickoff: KICKOFF, goals: { home: 1, away: 0 },
    score: { fulltime: { home: 1, away: 0 }, extratime: null, penalty: null }, ...overrides });
  row.fixture.referee = " Synthetic referee ";
  row.fixture.venue = { id: 12, name: "Synthetic stadium", city: "Synthetic city" };
  return row;
}

function harness(previousFacts = null, { eligible = true } = {}) {
  let now = NOW, facts = previousFacts, archive = null;
  const provider = resultProvider({ now: () => now });
  const target = { fixtureId, externalId: 101n, competitionId: 39n, season: 2026, kickoffAt: new Date(KICKOFF),
    homeExternalId: 10n, awayExternalId: 20n, homeGoals: 1, awayGoals: 0,
    coverage: { "fixtures.events": true, "fixtures.statistics_fixtures": true, "fixtures.lineups": false, "fixtures.statistics_players": false } };
  const flags = () => ({ hasInfo: Boolean(facts?.venueName || facts?.referee), hasEvents: Boolean(facts?.events?.length),
    hasStatistics: facts?.statistics?.length === 2 && facts.statistics.every((row) => row.statistics.length > 0),
    hasLineups: facts?.lineups?.length === 2 && facts.lineups.every((row) => row.startXI.length > 0),
    hasPlayers: facts?.playerStatistics?.length === 2 && facts.playerStatistics.every((row) => row.players.length > 0) });
  const classify = () => {
    const { hasInfo, hasEvents, hasStatistics, hasLineups, hasPlayers } = flags();
    const sections = archive?.state.sections ?? {};
    const stored = { info: hasInfo, events: hasEvents || sections.events === "known-empty", statistics: hasStatistics, lineups: hasLineups, players: hasPlayers };
    if (Object.values(stored).every(Boolean)) return "storedComplete";
    if (Object.entries(stored).every(([name, available]) => available || sections[name] === "unsupported")) return "unsupported";
    if (!archive || archive.nextCheckAt && archive.nextCheckAt <= now) return "due";
    return archive.nextCheckAt === null ? "exhausted" : "delayed";
  };
  const tx = {
    async $queryRaw(statement, id) {
      if (Array.isArray(statement)) {
        assert.match(statement.join("?"), /^SELECT id FROM FootballFixture/u);
        assert.equal(id, fixtureId);
        return [{ id }];
      }
      if (statement.sql.includes("WHERE facts.fixtureId=")) return [flags()];
      assert.match(statement.sql, /regulationVerifiedAt IS NOT NULL/u);
      assert.match(statement.sql, /NOT EXISTS \(SELECT 1 FROM FootballTeamProvider/u);
      if (statement.sql.includes("COUNT(*) AS eligible")) {
        const bucket = eligible ? classify() : null;
        const counts = Object.fromEntries(["storedComplete", "unsupported", "exhausted", "due"].map((name) => [name, BigInt(name === bucket)]));
        return [{ eligible: BigInt(eligible), ...counts, delayedCount: BigInt(bucket === "delayed"),
          nextCheckAt: bucket === "delayed" ? archive.nextCheckAt : null }];
      }
      if (!eligible || statement.sql.includes("detail.nextCheckAt<=") && classify() !== "due") return [];
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
  assert.deepEqual(result, { status: "partial", requested: 1, received: 1, written: 1, completed: 1, deferred: 0, requests: 1, stopped: null,
    passComplete: true, fullyCovered: false, coverage: { eligible: 1, storedComplete: 0, unsupported: 1, exhausted: 0, delayed: 0, due: 0, nextCheckAt: null } });
  assert.equal(state.provider.network[0].url.searchParams.get("ids"), "101");
  assert.deepEqual(state.facts.events, retained.events);
  assert.deepEqual(state.facts.statistics, [statistics(10, 3), statistics(20, 0)]);
  assert.equal(state.facts.venueName, "SYNTHETIC STADIUM");
  assert.equal(state.facts.venueExternalId, 12n);
  assert.equal(state.facts.venueCity, "Synthetic city");
  assert.equal(state.facts.referee, "Synthetic referee");
  assert.deepEqual(state.archive.state.sections, { info: "available", events: "available", statistics: "available", lineups: "unsupported", players: "unsupported" });
  assert.equal(state.archive.nextCheckAt, null);
  const repeat = await state.run({ maxRequests: 2 });
  assert.equal(repeat.requests, 0);
  assert.equal(repeat.status, "partial");
  assert.deepEqual(repeat.coverage, result.coverage);
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
  const waiting = await state.run({ maxRequests: 2 });
  assert.equal(waiting.requests, 0);
  assert.equal(waiting.passComplete, true);
  assert.equal(waiting.fullyCovered, false);
  assert.deepEqual(waiting.coverage, { eligible: 1, storedComplete: 0, unsupported: 0, exhausted: 0, delayed: 1, due: 0,
    nextCheckAt: new Date(NOW + 86_400_000).toISOString() });

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

test("exhausted fixture details remain visible after a completed pass and do not dispatch again", async () => {
  const state = harness();
  state.provider.state.rows = [fixture({ awayId: 99 })];
  await state.run({ maxRequests: 1 });
  state.advance(86_400_000);
  await state.run({ maxRequests: 1 });
  state.advance(2 * 86_400_000);
  await state.run({ maxRequests: 1 });
  assert.equal(state.archive.state.observations, 3);
  assert.equal(state.archive.nextCheckAt, null);
  const repeat = await state.run({ maxRequests: 1 });
  assert.equal(repeat.status, "partial");
  assert.equal(repeat.passComplete, true);
  assert.equal(repeat.fullyCovered, false);
  assert.deepEqual(repeat.coverage, { eligible: 1, storedComplete: 0, unsupported: 0, exhausted: 1, delayed: 0, due: 0, nextCheckAt: null });
  assert.equal(repeat.requests, 0);
  assert.equal(state.provider.network.length, 3);
});

test("stored facts and a confirmed empty timeline can fully cover every tracked section", async () => {
  const state = harness({ venueName: "Synthetic stadium", statistics: [statistics(10, 1), statistics(20, 0)],
    lineups: [lineup(10), lineup(20)], playerStatistics: [playerFacts(10), playerFacts(20)] });
  state.provider.state.rows = [fixture({ events: [] })];
  const result = await state.run({ maxRequests: 1 });
  assert.equal(result.status, "complete");
  assert.equal(result.passComplete, true);
  assert.equal(result.fullyCovered, true);
  assert.equal(result.stopped, null);
  assert.equal(result.requests, 1);
  assert.deepEqual(result.coverage, { eligible: 1, storedComplete: 1, unsupported: 0, exhausted: 0, delayed: 0, due: 0, nextCheckAt: null });
  assert.equal((await state.run({ maxRequests: 1 })).requests, 0);
});

test("a cancelled pass reports due work, and an empty verified scope does not imply coverage", async () => {
  const state = harness();
  const cancelled = await state.run({ maxRequests: 1 }, undefined, AbortSignal.abort());
  assert.equal(cancelled.status, "partial");
  assert.equal(cancelled.stopped, "interrupted");
  assert.equal(cancelled.passComplete, false);
  assert.equal(cancelled.coverage.due, 1);
  assert.equal(cancelled.requests, 0);
  const empty = await harness(null, { eligible: false }).run({ maxRequests: 1 });
  assert.equal(empty.status, "partial");
  assert.equal(empty.passComplete, true);
  assert.equal(empty.fullyCovered, false);
  assert.equal(empty.coverage.eligible, 0);
});

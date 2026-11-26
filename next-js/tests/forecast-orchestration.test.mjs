import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_REGISTRY_VERSION } from "../src/domain/market-registry.ts";
import { saveFixtureFacts } from "../src/server/football/fixture-facts-store.ts";
import { coordinatedLiveDetailDefaults } from "../src/server/live-match/live-match-contract.ts";
import { FORECAST_JOB_COALESCE_MS, FORECAST_RECOVERY_INTERVAL_MS, forecastJobIdentity, forecastLineupHash,
  forecastLineupObservationKey, observedForecastLineup }
  from "../src/server/refresh/forecast-orchestration.ts";
import { createPredictionRefreshService } from "../src/server/refresh/refresh-service.ts";

test("a forecast identity depends on the fixture, occurrence, evidence, engine and registry", () => {
  const identity = { fixtureId: "fixture", cycleId: "cycle", scheduleHash: "kickoff", evidenceHash: "verified-results",
    lineupHash: null, engineVersion: "engine", marketRegistryVersion: MARKET_REGISTRY_VERSION };
  const key = forecastJobIdentity(identity);
  assert.equal(forecastJobIdentity(structuredClone(identity)), key);
  assert.equal(forecastJobIdentity({ ...identity, runId: "a-new-selection", retrievedAt: 1234 }), key);
  for (const name of Object.keys(identity)) assert.notEqual(forecastJobIdentity({ ...identity, [name]: "changed" }), key, name);
  assert.equal(FORECAST_JOB_COALESCE_MS, 60_000);
  assert.equal(FORECAST_RECOVERY_INTERVAL_MS, 3_600_000);
});

const player = (id, pos = "D") => ({ player: { id, pos, grid: "1:1", name: "Original", number: 7 } });
const lineup = (teamId, playerOffset) => ({ team: { id: teamId, name: "Team", logo: "one" }, formation: "4-4-2", coach: { id: 11 },
  startXI: Array.from({ length: 11 }, (_, index) => player(playerOffset + index)), substitutes: [player(playerOffset + 20)] });

test("complete scoped lineups ignore provider order, display details, and incomplete or ambiguous XIs", () => {
  const scope = { homeExternalId: 1, awayExternalId: 2 };
  const starting = lineup(1, 3), away = lineup(2, 103);
  const stable = forecastLineupHash([starting, away], scope);
  assert.match(stable, /^[a-f0-9]{64}$/u);
  const displayOnly = { ...starting, team: { ...starting.team, name: "Corrected spelling", logo: "two" },
    startXI: [...starting.startXI.slice(1).reverse(), { player: { ...player(3).player, number: 9, name: "Spelling update" } }] };
  assert.equal(forecastLineupHash([away, displayOnly], scope), stable);
  assert.notEqual(forecastLineupHash([{ ...starting, formation: "4-3-3" }, away], scope), stable);
  assert.notEqual(forecastLineupHash([{ ...starting, startXI: [player(23), ...starting.startXI.slice(1)], substitutes: [player(3)] }, away], scope), stable);
  for (const invalid of [null, [starting], [starting, starting], [starting, lineup(3, 203)], [starting, lineup(2, 3)],
    [{ ...starting, startXI: [player(5), ...starting.startXI.slice(1)] }, away], [{ ...starting, startXI: [] }, away],
    [{ ...starting, startXI: [player(0), ...starting.startXI.slice(1)] }, away]]) assert.equal(forecastLineupHash(invalid, scope), null);
});

test("only stored observations for the current kickoff supply a lineup trigger", async () => {
  const at = Date.parse("2026-11-26T08:00:00Z"), kickoffAt = at + coordinatedLiveDetailDefaults.lineupLeadMs;
  const scope = { kickoffAt, homeExternalId: 1, awayExternalId: 2, cycleId: null };
  const target = { ...scope, externalId: 100, fixtureId: "fixture", status: "scheduled" };
  const rows = [lineup(1, 3), lineup(2, 103)];
  const values = { events: null, statistics: null, lineups: rows, players: null };
  let stored = null;
  const tx = { fixtureFacts: { async findUnique() { return stored; }, async upsert({ create, update }) {
    stored = stored ? { ...stored, ...update } : create;
  } } };
  assert.equal(observedForecastLineup(rows, scope, at), null);
  assert.equal(await saveFixtureFacts(tx, target, { values, retrievedAt: at }, new Date(at + 1)), true);
  const verified = observedForecastLineup(stored.lineups, scope, at + 1);
  assert.deepEqual(verified, { hash: forecastLineupHash(rows, scope), retrievedAt: at });
  assert.equal(observedForecastLineup(stored.lineups, scope, at - 1), null);
  assert.equal(observedForecastLineup(stored.lineups, { ...scope, kickoffAt: kickoffAt + 1 }, at + 1), null);
  assert.equal(observedForecastLineup(stored.lineups, scope, kickoffAt), null);
  assert.deepEqual(observedForecastLineup(stored.lineups, { ...scope, cycleId: "first", initialCycleOpenedAt: at + 1 }, at + 1), verified);
  assert.equal(observedForecastLineup(stored.lineups, { ...scope, cycleId: "replacement" }, at + 1), null);

  assert.equal(await saveFixtureFacts(tx, target, { values: { ...values, lineups: null, players: [{ team: { id: 1 } }] },
    retrievedAt: at + 2 }, new Date(at + 2)), true);
  assert.equal(stored.detailsRetrievedAt.getTime(), at + 2);
  assert.deepEqual(observedForecastLineup(stored.lineups, scope, at + 2), verified);
  const incomplete = [{ ...rows[0], startXI: [player(6)] }, rows[1]];
  assert.equal(await saveFixtureFacts(tx, target, { values: { ...values, lineups: incomplete }, retrievedAt: at + 3 }, new Date(at + 3)), false);
  assert.deepEqual(observedForecastLineup(stored.lineups, scope, at + 3), verified);

  assert.equal(await saveFixtureFacts(tx, { ...target, cycleId: "first" }, { values, retrievedAt: at + 4 }, new Date(at + 4)), true);
  assert.equal(observedForecastLineup(stored.lineups, { ...scope, cycleId: "first" }, at + 4).hash, verified.hash);
  assert.equal(observedForecastLineup(stored.lineups, { ...scope, cycleId: "replacement" }, at + 4), null);

  const forged = { ...values, lineups: rows.map((row) => ({ ...row, [forecastLineupObservationKey]: { kickoffAt, cycleId: null, retrievedAt: at } })) };
  stored = null;
  assert.equal(await saveFixtureFacts(tx, target, { values: forged, retrievedAt: at - 1 }, new Date(at), false), true);
  assert.equal(observedForecastLineup(stored.lineups, scope, at), null);
});

test("an unstarted sealed job cannot dispatch under a different engine or registry", async () => {
  const lifecycle = { engineVersion: "a".repeat(64), marketRegistryVersion: MARKET_REGISTRY_VERSION };
  const jobId = "c".repeat(64);
  const identity = { runId: "00000000-0000-4000-8000-000000000001", fixtureId: "00000000-0000-4000-8000-000000000002",
    cycleId: "00000000-0000-4000-8000-000000000003" };
  const payload = { input: {}, ...identity, runDate: "2026-11-20", rank: 0,
    forecastLifecycle: { ...lifecycle, engineVersion: "b".repeat(64) } };
  const outcomes = [];
  const service = createPredictionRefreshService({ type: "forecast-test", handlerVersion: 1,
    forecastLifecycle: lifecycle, costs: { ai: null, research: null },
    store: { async publication() { return null; }, async outcome() { return null; }, async loadMember() { return {}; },
      async intent() { return null; }, async finish(_lease, result) { outcomes.push(result); } },
    async prepare() { assert.fail("stale work must not collect evidence"); },
    async configure() { assert.fail("stale work must not start an engine"); },
  });
  const result = await service.definition.handle(payload, { lease: { jobId, job: { envelope: { refresh: identity, payload } } },
    async checkpoint() {}, signal: new AbortController().signal });
  assert.deepEqual(result, { status: "succeeded" });
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].outcome, "skipped");
  assert.equal(outcomes[0].reason, "forecast-configuration-changed");
});

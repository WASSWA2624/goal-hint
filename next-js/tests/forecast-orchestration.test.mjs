import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_REGISTRY_VERSION } from "../src/domain/market-registry.ts";
import { FORECAST_JOB_COALESCE_MS, FORECAST_RECOVERY_INTERVAL_MS, forecastJobIdentity, forecastLineupHash }
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

test("lineup role changes are meaningful and display data and provider order are ignored", () => {
  const player = (id, pos = "D") => ({ player: { id, pos, grid: "1:1", name: "Original", number: 7 } });
  const starting = { team: { id: 1, name: "Team", logo: "one" }, formation: "4-4-2", coach: { id: 11 },
    startXI: [player(3), player(5)], substitutes: [player(8)] };
  const away = { ...starting, team: { id: 2 } };
  const stable = forecastLineupHash([starting, away]);
  const displayOnly = { ...starting, team: { ...starting.team, name: "Corrected spelling", logo: "two" },
    startXI: [player(5), { player: { ...player(3).player, number: 9, name: "Spelling update" } }] };
  assert.equal(forecastLineupHash([away, displayOnly]), stable);
  assert.notEqual(forecastLineupHash([{ ...starting, formation: "4-3-3" }, away]), stable);
  assert.notEqual(forecastLineupHash([{ ...starting, startXI: [player(3), player(8)], substitutes: [player(5)] }, away]), stable);
  assert.equal(forecastLineupHash([starting, starting]), null);
  assert.equal(forecastLineupHash(null), null);
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

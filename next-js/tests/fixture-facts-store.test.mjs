import assert from "node:assert/strict";
import test from "node:test";
import { saveFixtureFacts } from "../src/server/football/fixture-facts-store.ts";

test("live corrections retain omitted team sections and never overwrite a newer observation", async () => {
  const at = new Date("2026-11-20T10:00:00Z"), before = new Date(at.getTime() - 1000);
  const home = { team: { id: 1 }, formation: "4-3-3", startXI: [{ player: { id: 11 } }] };
  const away = { team: { id: 2 }, formation: "4-4-2", startXI: [{ player: { id: 21 } }] };
  const target = { fixtureId: "synthetic-fixture", externalId: 123 };
  let previous = { lineups: [home, away], detailsRetrievedAt: before }, writes = 0;
  const store = { fixtureFacts: {
    async findUnique() { return previous; },
    async upsert({ update }) { writes++; previous = { ...previous, ...update }; },
  } };
  const observation = { values: { events: null, statistics: null, players: null,
    lineups: [{ team: { id: 1 }, formation: "3-4-3" }] }, retrievedAt: at.getTime() };
  assert.equal(await saveFixtureFacts(store, target, observation, at), true);
  assert.deepEqual(previous.lineups, [{ ...home, formation: "3-4-3" }, away]);
  assert.equal(await saveFixtureFacts(store, target, observation, at), false);
  const older = { ...observation, retrievedAt: before.getTime(), values: { ...observation.values, lineups: [home] } };
  assert.equal(await saveFixtureFacts(store, target, older, at), false);
  assert.equal(writes, 1);
});

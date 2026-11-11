import assert from "node:assert/strict";
import test from "node:test";
import { utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { createFootballCatalogImporter } from "../src/server/football/catalog-service.ts";
import { normalizeInPlayOdds } from "../src/server/football/api-football-normalize.ts";
import { createInPlayOddsPoller } from "../src/server/odds/in-play-odds-service.ts";
import { storedInPlayOdds } from "../src/server/odds/in-play-odds-read.ts";
import { catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from "./helpers/catalog-fixtures.mjs";
import { catalogSelectionAuthority } from "./helpers/selection-fixtures.mjs";
import { withPredictionPipeline } from "./prediction-pipeline.mjs";

test("one shared live odds slot updates only changed prices and withdraws missing matches", { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (pipeline) => {
    const { a, b, catalog, instance } = pipeline;
    await instance.executeAdmin(`GRANT SELECT, INSERT, UPDATE ON goal_hint_test.FixtureInPlayOdds TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.InPlayOddsPollState TO 'cutoff_app'@'127.0.0.1';`);
    const start = Date.parse("2026-11-11T15:00:00Z"), kickoffAt = start - 10 * 60_000;
    const source = catalogFixture(2871, { kickoff: new Date(kickoffAt).toISOString(), homeId: 1, awayId: 2, status: "1H" });
    const provider = createSyntheticCatalogAdapter({ rows: [source] });
    provider.clock.value = start - 1000;
    pipeline.setTime(provider.clock.value);
    await createFootballCatalogImporter({ adapter: provider.adapter, store: catalog, authority: catalogSelectionAuthority, clock: provider.clock })
      .import(catalogRequest({ kind: "fixtures", query: { competitionId: 39, season: 2026 } }, pipeline.now()));
    const fixture = await catalog.fixtureByProviderId(2871);
    assert.equal(fixture.status, "live");
    pipeline.setTime(start);
    let catalogCalls = 0, liveCalls = 0, present = true, home = "1.89";
    const adapter = {
      async inPlayBets(bounds) {
        assert.equal(bounds.priority, "enrichment"); catalogCalls++;
        return { status: "complete", requestsDispatched: 1, data: [{ id: 59, name: "Fulltime Result" }] };
      },
      async inPlay(bounds) {
        assert.equal(bounds.maxRequests, 1); liveCalls++;
        const retrievedAt = utcInstantFromEpochMilliseconds(pipeline.now());
        const observation = normalizeInPlayOdds({
          fixture: { id: 2871 }, league: { id: 39, season: 2026 }, teams: { home: { id: 1 }, away: { id: 2 } },
          status: { stopped: false, blocked: false, finished: false }, update: new Date(retrievedAt - 1000).toISOString(),
          odds: [{ id: 59, name: "Fulltime Result", values: [["Home", home], ["Draw", "4"], ["Away", "5"]]
            .map(([value, odd]) => ({ value, odd, suspended: false })) }],
        }, { endpoint: "/odds/live", retrievedAt });
        assert.equal(observation.valid, true);
        return { status: "complete", requestsDispatched: 1, data: present ? [observation.data] : [], provenance: [{ retrievedAt }] };
      },
    };
    const make = (database) => createInPlayOddsPoller({ database, adapter, now: pipeline.now, enabled: () => true, displayAllowed: () => true });
    const first = make(a), second = make(b);
    const results = await Promise.all([first.poll(), second.poll()]);
    assert.equal(results.find((entry) => entry.outcome === "complete")?.changed, 1);
    assert.equal(catalogCalls, 1); assert.equal(liveCalls, 1);
    const observation = () => a.query((tx) => storedInPlayOdds(tx, { fixtureId: fixture.id, kickoffAt, asOf: pipeline.now() }));
    assert.equal((await observation()).prices.markets[0].selections[0].price, "1.89");
    const stored = () => a.query((tx) => tx.$queryRaw`SELECT changedAt, checkedAt FROM FixtureInPlayOdds WHERE fixtureId = ${fixture.id}`);
    const [before] = await stored();
    pipeline.setTime(start + 30_000);
    assert.deepEqual(await first.poll(), { outcome: "complete", requests: 1, changed: 0 });
    const [after] = await stored();
    assert.equal(after.changedAt.getTime(), before.changedAt.getTime());
    assert.equal(after.checkedAt.getTime(), start + 30_000);
    home = "2.1";
    pipeline.setTime(start + 60_000);
    assert.equal((await second.poll()).changed, 1);
    assert.equal((await observation()).prices.markets[0].selections[0].price, "2.1");
    present = false;
    pipeline.setTime(start + 90_000);
    assert.equal((await first.poll()).changed, 1);
    assert.equal(await observation(), null);
    assert.equal(await a.query((tx) => tx.fixtureOddsPrice.count()), 0);
    assert.equal(catalogCalls, 1); assert.equal(liveCalls, 4);
  }, { migrationTimeoutMs: 180_000 });
});

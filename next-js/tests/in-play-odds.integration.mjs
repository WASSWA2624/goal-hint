import assert from "node:assert/strict";
import test from "node:test";
import { utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { createFootballCatalogImporter } from "../src/server/football/catalog-service.ts";
import { normalizeInPlayOdds } from "../src/server/football/api-football-normalize.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { createInPlayOddsPoller } from "../src/server/odds/in-play-odds-service.ts";
import { storedInPlayOdds } from "../src/server/odds/in-play-odds-read.ts";
import { withFeedOdds } from "../src/server/matches/feed-odds.ts";
import { gateFeedResponse } from "../src/domain/paywall.ts";
import { catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from "./helpers/catalog-fixtures.mjs";
import { catalogSelectionAuthority } from "./helpers/selection-fixtures.mjs";
import { withPredictionPipeline } from "./prediction-pipeline.mjs";

test("one shared live odds slot updates only changed prices and withdraws missing matches", { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (pipeline) => {
    const { a, b, catalog, instance } = pipeline;
    await instance.executeAdmin(`GRANT SELECT, INSERT,
      UPDATE (kickoffAt,homeTeamId,awayTeamId,checkedAt,changedAt,providerUpdatedAt,withdrawnAt,semanticHash,bodyJson)
      ON goal_hint_test.FixtureInPlayOdds TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (nextPollAt,catalogDueAt,catalogJson) ON goal_hint_test.InPlayOddsPollState TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (lastObservedAt,lastProviderUpdatedAt) ON goal_hint_test.FixtureInPlayOddsHistory TO 'cutoff_app'@'127.0.0.1';`);
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
    let catalogCalls = 0, liveCalls = 0, present = true, home = "1.89", display = true, retain = true;
    let providerClock = null;
    const response = (endpoint, data) => ({ status: "complete", requestsDispatched: 1, data, error: null,
      completeness: { complete: true, invalidRows: 0, reasons: [], missingCoverage: [], missingIds: [] },
      provenance: [{ provider: "api-football", endpoint, contractVersion: API_FOOTBALL_CONTRACT_VERSION, requestParameters: {},
        currentPage: 1, totalPages: data.length ? 1 : 0, retrievedAt: utcInstantFromEpochMilliseconds(pipeline.now()), fromCache: false,
        providerUpdatedAt: null, quota: { kind: "success" } }],
    });
    const adapter = {
      async inPlayBets(bounds) {
        assert.equal(bounds.priority, "enrichment"); catalogCalls++;
        const result = response("inPlayOddsBets", [{ id: 59, name: "Fulltime Result" }, { id: 814, name: "Synthetic unknown definition" }]);
        return { ...result, completeness: { ...result.completeness, missingCoverage: ["odds-catalog-name:815"] } };
      },
      async inPlay(bounds) {
        assert.equal(bounds.maxRequests, 1); liveCalls++;
        const retrievedAt = utcInstantFromEpochMilliseconds(pipeline.now());
        const observation = normalizeInPlayOdds({
          fixture: { id: 2871 }, league: { id: 39, season: 2026 }, teams: { home: { id: 1 }, away: { id: 2 } },
          status: { stopped: false, blocked: false, finished: false }, update: new Date(providerClock ?? retrievedAt - 1000).toISOString(),
          odds: [{ id: 59, name: "Fulltime Result", values: [["Home", home], ["Draw", "4"], ["Away", "5"]]
            .map(([value, odd]) => ({ value, odd, suspended: false })) },
          { id: 814, name: "Synthetic unknown definition", values: [{ value: "Exact unknown", handicap: "+2.5", odd: "0", suspended: true }] }],
        }, { endpoint: "/odds/live", retrievedAt });
        assert.equal(observation.valid, true);
        return response("inPlayOdds", present ? [observation.data] : []);
      },
    };
    const make = (database) => createInPlayOddsPoller({ database, adapter, now: pipeline.now, enabled: () => true,
      retentionAllowed: () => retain, displayAllowed: () => display, competitionIds: [39] });
    const first = make(a), second = make(b);
    const results = await Promise.all([first.poll(), second.poll()]);
    assert.equal(results.find((entry) => entry.outcome === "complete")?.changed, 1);
    assert.equal(catalogCalls, 1); assert.equal(liveCalls, 1);
    const observation = () => a.query((tx) => storedInPlayOdds(tx, { fixtureId: fixture.id, kickoffAt, asOf: pipeline.now() }));
    assert.equal((await observation()).prices.markets[0].selections[0].price, "1.89");
    const base = { records: [{ fixtureId: fixture.id, kickoffAt, status: "live", forecast: null, prices: [] }] };
    const feedOdds = () => withFeedOdds(a, base, pipeline.now(), true);
    const feed = await feedOdds();
    assert.equal(feed.records[0].marketOdds.kind, "in-play");
    assert.equal(feed.records[0].marketOdds.prices.markets[0].selections[0].price, "1.89");
    assert.equal(feed.records[0].forecast, null);
    assert.equal(gateFeedResponse(feed, { tier: "free", signedIn: false }).records[0].marketOdds, null);
    const stored = () => a.query((tx) => tx.$queryRaw`SELECT changedAt, checkedAt FROM FixtureInPlayOdds WHERE fixtureId = ${fixture.id}`);
    const readJson = (value) => typeof value === "string" ? JSON.parse(value) : value;
    const history = () => a.query((tx) => tx.$queryRaw`SELECT firstObservedAt, lastObservedAt, providerUpdatedAt, lastProviderUpdatedAt,
      outOfOrder, bodyJson FROM FixtureInPlayOddsHistory WHERE fixtureId=${fixture.id} ORDER BY firstObservedAt`);
    const catalogRows = await a.query((tx) => tx.$queryRaw`SELECT catalogJson FROM InPlayOddsPollState WHERE provider='api-football'`);
    const references = readJson(catalogRows[0].catalogJson);
    assert.equal(references.namespace, "in-play");
    assert.deepEqual(references.entries.map(({ id }) => id), [59, 814, 815]);
    assert.equal(references.entries[0].status, "mapped");
    assert.equal(references.entries[1].status, "unmapped");
    assert.equal(references.entries[2].reason, "provider-name-unavailable");
    const [initialPrice] = await history();
    const retained = readJson(initialPrice.bodyJson);
    assert.deepEqual(retained.source, { provider: "api-football", sourceId: "api-football-live", namespace: "in-play", bookmakerId: null });
    assert.deepEqual(retained.markets[1].values[0], { label: "Exact unknown", line: "2.5", price: null, main: false, suspended: true });
    const forecastEvents = () => a.query((tx) => tx.predictionChangeEvent.count({ where: { fixtureId: fixture.id } }));
    const eventsBefore = await forecastEvents();
    const [before] = await stored();
    pipeline.setTime(start + 30_000);
    assert.equal((await first.poll()).outcome, "waiting");
    pipeline.setTime(start + 60_000);
    assert.deepEqual(await first.poll(), { outcome: "complete", requests: 1, changed: 0 });
    const [after] = await stored();
    assert.equal(after.changedAt.getTime(), before.changedAt.getTime());
    assert.equal(after.checkedAt.getTime(), start + 60_000);
    const samePrice = await history();
    assert.equal(samePrice.length, 1);
    assert.equal(samePrice[0].firstObservedAt.getTime(), start);
    assert.equal(samePrice[0].lastObservedAt.getTime(), start + 60_000);
    assert.equal(samePrice[0].providerUpdatedAt.getTime(), start - 1000);
    assert.equal(samePrice[0].lastProviderUpdatedAt.getTime(), start + 59_000);
    home = "2.1";
    providerClock = start + 59_000;
    pipeline.setTime(start + 120_000);
    assert.equal((await second.poll()).changed, 1);
    assert.equal((await observation()).prices.markets[0].selections[0].price, "2.1");
    present = false;
    pipeline.setTime(start + 180_000);
    assert.equal((await first.poll()).changed, 1);
    assert.equal(await observation(), null);
    assert.equal((await feedOdds()).records[0].marketOdds, undefined);
    const withdrawn = await history();
    assert.equal(withdrawn.length, 3);
    assert.equal(readJson(withdrawn[2].bodyJson).availability, "not-returned");
    assert.equal(withdrawn[2].providerUpdatedAt, null);
    display = false; present = true; home = "1.92"; providerClock = null;
    pipeline.setTime(start + 240_000);
    assert.deepEqual(await first.poll(), { outcome: "complete", requests: 1, changed: 0 });
    assert.equal(await observation(), null, "private retention does not publish prices");
    providerClock = start + 30_000; home = "4.5";
    pipeline.setTime(start + 300_000);
    assert.equal((await first.poll()).outcome, "complete");
    const stale = await history();
    assert.equal(stale.length, 5);
    assert.equal(Number(stale[4].outOfOrder), 1, "older provider clocks are archived without advancing current offers");
    assert.equal(await observation(), null);
    retain = false;
    pipeline.setTime(start + 360_000);
    assert.equal((await first.poll()).outcome, "disabled");
    assert.equal(await forecastEvents(), eventsBefore, "odds changes never enqueue forecast evidence changes");
    assert.equal(await a.query((tx) => tx.fixtureOddsPrice.count()), 0);
    assert.equal(catalogCalls, 1); assert.equal(liveCalls, 6);

    await t.test("partial live responses preserve confirmed offers and safe remapping retains the actual occurrence and clocks", async () => {
      const at = start + 8 * 60_000, oldKickoff = at - 12 * 60_000;
      const ids = [2872, 2873];
      async function saveFixtures(rows, at) {
        const source = createSyntheticCatalogAdapter({ rows });
        source.clock.value = at;
        pipeline.setTime(at);
        return createFootballCatalogImporter({ adapter: source.adapter, store: catalog, authority: catalogSelectionAuthority, clock: source.clock })
          .import(catalogRequest({ kind: "fixtures", query: { date: "2026-11-11" } }, at));
      }
      const row = (id, kickoff, status) => catalogFixture(id, { kickoff: new Date(kickoff).toISOString(), status,
        competitionId: id === ids[0] ? 39 : 40, homeId: 1, awayId: 2 });
      await saveFixtures(ids.map(id => row(id, oldKickoff, "1H")), at - 1000);
      const [target, other] = await Promise.all(ids.map(id => catalog.fixtureByProviderId(id)));
      const historyRows = (fixtureId) => a.query(tx => tx.$queryRaw`SELECT occurrenceHash, firstObservedAt, lastObservedAt,
        providerUpdatedAt, lastProviderUpdatedAt, bodyJson FROM FixtureInPlayOddsHistory WHERE fixtureId = ${fixtureId} ORDER BY firstObservedAt`);
      const displayed = (fixtureId, kickoff = oldKickoff) => a.query(tx => storedInPlayOdds(tx, { fixtureId, kickoffAt: kickoff, asOf: pipeline.now() }));
      const offer = (id, price = "2.21", malformed = false, updatedAt = null) => {
        const isTarget = id === ids[0];
        const values = isTarget ? [["Home", price], ["Draw", malformed ? "invalid" : "4"], ["Away", "5"]]
          : [["Over", "1.9"], ["Under", "2.07"]];
        const observation = normalizeInPlayOdds({ fixture: { id }, league: { id: isTarget ? 39 : 40, season: 2026 },
          teams: { home: { id: 1 }, away: { id: 2 } }, status: { stopped: false, blocked: false, finished: false },
          update: updatedAt === null ? null : new Date(updatedAt).toISOString(),
          odds: [{ id: isTarget ? 59 : 36, name: isTarget ? "Fulltime Result" : "Over/Under Line",
            values: values.map(([value, odd]) => ({ value, odd, handicap: isTarget ? null : "2.5", suspended: false })) }],
        }, { endpoint: "/odds/live", retrievedAt: pipeline.now() });
        assert.ok(observation.valid);
        return observation.data;
      };
      let catalogKnowsTarget = false, quotePage = () => response("inPlayOdds", ids.map(id => offer(id)));
      const changingSource = {
        async inPlayBets() { return response("inPlayOddsBets", [{ id: 36, name: "Over/Under Line" },
          ...(catalogKnowsTarget ? [{ id: 59, name: "Fulltime Result" }] : [])]); },
        async inPlay() { return quotePage(); },
      };
      const collector = competitionIds => createInPlayOddsPoller({ database: a, adapter: changingSource,
        now: pipeline.now, enabled: () => true, displayAllowed: () => true, competitionIds });
      const all = collector([39, 40]), scoped = collector([39]);
      const catalogDue = () => a.query(tx => tx.$executeRaw`UPDATE InPlayOddsPollState SET catalogDueAt = ${new Date(pipeline.now())} WHERE provider = 'api-football'`);
      const partial = data => {
        const verified = response("inPlayOdds", data);
        return { ...verified, status: "partial", completeness: { ...verified.completeness, complete: false, invalidRows: 1,
          reasons: ["invalid-rows"] }, provenance: verified.provenance.map(page => ({ ...page, totalPages: 1 })) };
      };
      pipeline.setTime(at); await catalogDue();
      assert.deepEqual(await all.poll(), { outcome: "complete", requests: 2, changed: 1 });
      assert.equal(await displayed(target.id), null);
      assert.equal((await displayed(other.id)).prices.markets[0].selections[1].price, "2.07");
      const [unmapped] = await historyRows(target.id), capture = readJson(unmapped.bodyJson);
      assert.deepEqual(capture.occurrence, { kickoffAt: oldKickoff, homeTeamId: target.homeTeamId, awayTeamId: target.awayTeamId });
      assert.equal(capture.providerClockKnown, false);
      assert.equal(capture.markets[0].period, null);

      pipeline.setTime(at + 60_000); await catalogDue();
      catalogKnowsTarget = true; quotePage = () => partial([]);
      assert.deepEqual(await scoped.poll(), { outcome: "partial", requests: 2, changed: 1 });
      const replayed = await displayed(target.id);
      assert.equal(replayed.checkedAt, at);
      assert.equal(replayed.providerUpdatedAt, null);
      assert.equal(replayed.prices.markets[0].selections[0].price, "2.21");
      assert.equal((await historyRows(target.id)).length, 1, "reinterpreting a quote does not create a source observation");
      assert.ok(await displayed(other.id), "a partial listing does not withdraw absent offers");

      pipeline.setTime(at + 120_000);
      quotePage = () => partial([offer(ids[0], "2.32"), offer(ids[1])]);
      assert.deepEqual(await all.poll(), { outcome: "partial", requests: 1, changed: 1 });
      assert.equal((await displayed(target.id)).prices.markets[0].selections[0].price, "2.32");

      pipeline.setTime(at + 180_000);
      quotePage = () => response("inPlayOdds", [offer(ids[0], "3.11", true)]);
      assert.deepEqual(await scoped.poll(), { outcome: "partial", requests: 1, changed: 0 });
      assert.equal((await displayed(target.id)).prices.markets[0].selections[0].price, "2.32", "a malformed group does not withdraw a complete group");
      assert.equal((await displayed(target.id)).checkedAt, at + 120_000, "the malformed group does not extend an older price");
      assert.ok(await displayed(other.id), "a complete narrower catalog scan cannot withdraw another competition");
      assert.equal(readJson((await historyRows(target.id)).at(-1).bodyJson).availability, "partial-offers");

      const newKickoff = at + 300_000;
      await saveFixtures([row(ids[0], newKickoff, "NS")], at + 240_000);
      const existing = (await historyRows(target.id)).length;
      quotePage = () => response("inPlayOdds", [offer(ids[0])]);
      assert.equal((await scoped.poll()).changed, 0);
      assert.equal((await historyRows(target.id)).length, existing);
      assert.equal(await displayed(target.id), null, "a previous occurrence may not appear against a rescheduled fixture");
      await saveFixtures([row(ids[0], newKickoff, "1H")], at + 330_000);
      quotePage = () => response("inPlayOdds", [offer(ids[0], "2.8", false, oldKickoff + 1000)]);
      assert.equal((await scoped.poll()).changed, 0, "a reported update preceding the new occurrence is held");
      pipeline.setTime(at + 390_000);
      quotePage = () => response("inPlayOdds", [offer(ids[0], "2.81")]);
      assert.equal((await scoped.poll()).changed, 1);
      assert.equal((await displayed(target.id, newKickoff)).prices.markets[0].selections[0].price, "2.81");
      const [newOccurrence] = (await historyRows(target.id)).slice(-1);
      assert.notEqual(newOccurrence.occurrenceHash, unmapped.occurrenceHash);
      assert.equal(readJson(newOccurrence.bodyJson).occurrence.kickoffAt, newKickoff);
      assert.equal(newOccurrence.providerUpdatedAt, null);
      assert.equal(await a.query(tx => tx.fixtureOddsPrice.count()), 0, "replay keeps in-play quotes out of the pre-match store");
    });
  }, { migrationTimeoutMs: 180_000 });
});

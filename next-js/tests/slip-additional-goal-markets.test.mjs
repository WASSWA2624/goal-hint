import assert from "node:assert/strict";
import test from "node:test";
import { snapshotCardPrediction } from "../src/domain/match-card.ts";
import { buildSlips, parseSlipCriteria, serializeSlipCriteria } from "../src/domain/slip-builder.ts";
import { slipSelectionCard } from "../src/domain/slip-card.ts";
import { canonicalSlipConfigurationParameters, slipConfigurationCriteria } from "../src/domain/slip-configurations.ts";
import { slipMarketSelections } from "../src/domain/slip-markets.ts";
import { slipMatchWatch, slipMatchWatchSchema } from "../src/domain/slip-match-refresh.ts";
import { slipResultView, slipSnapshotSchema } from "../src/domain/slip-snapshot.ts";
import { slipRevisionMatches } from "../src/server/slips/slip-forecast.ts";
import { createSlipBuildService } from "../src/server/slips/slip-service.ts";
import { pricedEditorialSelection } from "./helpers/best-slip-publication-fixtures.mjs";
import { additionalGoalFixture, now, today } from "./helpers/slip-additional-goal-fixture.mjs";

test("all team-total outcomes round-trip in saved criteria without changing the legacy match-total order", () => {
  const query = new URLSearchParams({
    markets: "team-goals,total-goals", "picks.total-goals": "over-1.5,under-2.5",
    "picks.team-goals": [...slipMarketSelections["team-goals"]].reverse().join(","),
  });
  const stored = canonicalSlipConfigurationParameters(query.toString(), today);
  const restored = slipConfigurationCriteria(stored, today);
  assert.deepEqual(restored.outcomes["team-goals"], [...slipMarketSelections["team-goals"]]);
  assert.equal(serializeSlipCriteria(restored).get("picks.total-goals"), "under-2.5,over-1.5");
  assert.throws(() => parseSlipCriteria({ markets: "team-goals", "picks.team-goals": "under-3.5" }, today));
});

test("explicit match and team totals build from their sealed event and exact bookmaker quote and settle from regulation scores", async () => {
  const { record, reference, extension, readCohort } = additionalGoalFixture();
  const cases = [
    ["total-goals", "under-3.5", "total:3.5", "1.321", "lost"],
    ["team-goals", "home-under-2.5", "home:2.5", "1.2451", "won"],
    ["team-goals", "away-under-2.5", "away:2.5", "1.51", "lost"],
  ];
  for (const [family, selection, event, expectedOdds, expectedOutcome] of cases) {
    const marketKey = `goal:full-time:totals:${event}:binary`;
    const query = new URLSearchParams({
      build: "1", markets: family, [`picks.${family}`]: selection, totalMin: "1.01", totalMax: "", teamsMax: "1",
    });
    const criteria = parseSlipCriteria(query, today);
    const result = await createSlipBuildService({
      consume: async () => {}, providerOdds: true, clock: { now: () => now },
      readCohort: async (parameters, context, clock) => {
        assert.deepEqual(context.additionalGoals, { keys: [marketKey], only: true });
        const cohort = await readCohort(parameters, context, clock);
        assert.ok(cohort.additionalGoalForecasts[record.fixtureId]);
        const prices = cohort.selectionPrices[record.fixtureId];
        assert.deepEqual(prices.map(({ selection, price, bookmaker }) => [selection, price, bookmaker.id]), [[selection, expectedOdds, 8]]);
        return cohort;
      },
    }).query(criteria);
    assert.equal(result.state, "generated");
    const [slip] = result.data.slips, [leg] = slip.selections;
    assert.equal(leg.family, family);
    assert.equal(leg.selection, selection);
    assert.equal(leg.odds, expectedOdds);
    assert.equal(leg.bookmaker.id, 8);
    assert.deepEqual(slipSnapshotSchema.parse(slip), slip);
    assert.equal(snapshotCardPrediction(slipSelectionCard(leg).snapshotPick).item.market.selection, selection);
    const watch = slipMatchWatchSchema.parse(slipMatchWatch(leg));
    const revision = { ...reference, id: reference.revisionId, fixtureId: leg.fixtureId };
    assert.equal(slipRevisionMatches(watch, revision, extension, now), true);
    assert.equal(slipRevisionMatches({ ...watch, source: "local-engine" }, revision, extension, now), true);
    assert.equal(slipRevisionMatches({ ...watch, source: "ai" }, revision, extension, now), false);
    assert.equal(slipRevisionMatches({ ...watch, probability: 0.999 }, revision, extension, now), false);
    assert.equal(slipRevisionMatches(watch, revision, { ...extension, recordedAt: now + 1 }, now), false);
    const final = { fixtureId: leg.fixtureId, family, selection, forecast: reference, completed: true,
      status: "finished-extra-time", regulationVerified: true, regulationHome: 2, regulationAway: 3 };
    assert.equal(slipResultView("sealed", "", slip, [final]).outcome, expectedOutcome);
    assert.equal(slipResultView("sealed", "", slip, [{ ...final, regulationVerified: false }]).outcome, "pending");
  }
});

test("editorial combination search excludes manual goal records and keeps all legs at one bookmaker", async () => {
  const { record, readCohort } = additionalGoalFixture();
  const cohort = await readCohort(new URLSearchParams({ date: today }), {
    additionalGoals: { keys: ["goal:full-time:totals:home:2.5:binary"], only: true },
  }, { now: () => now });
  const records = [{ ...record, selectionPrices: cohort.selectionPrices[record.fixtureId],
    additionalGoalForecast: cohort.additionalGoalForecasts[record.fixtureId] }];
  const criteria = parseSlipCriteria({
    markets: "match-result,team-goals", "picks.team-goals": "home-under-2.5",
    totalMin: "1.01", totalMax: "5.00", teamsMin: "2", teamsMax: "2",
  }, today);
  const reviewed = [pricedEditorialSelection(1, { odds: "2.00", probability: 0.81 }),
    pricedEditorialSelection(2, { odds: "2.00", probability: 0.82 }),
    pricedEditorialSelection(3, { odds: "2.00", probability: 0.99, bookmakerId: 9 })];
  const editorial = buildSlips(criteria, records, now, undefined, {
    allowPublishedFallback: true, editorial: { selections: reviewed, exclusiveMaximum: true },
  });
  assert.equal(editorial.qualifyingMatches, reviewed.length);
  assert.equal(editorial.slips.length, 1);
  assert.deepEqual(editorial.slips[0].selections.map(({ fixtureId }) => fixtureId).sort(),
    reviewed.slice(0, 2).map(({ fixtureId }) => fixtureId));
  assert.ok(editorial.slips[0].selections.every((leg) => leg.offer?.bookmakerId === 8));

  const custom = buildSlips({ ...criteria, teamsMin: 1, teamsMax: 1 }, records, now, undefined, { allowPublishedFallback: true });
  assert.equal(custom.slips.length, 1);
  const [pick] = custom.slips[0].selections;
  assert.equal(pick.selection, "home-under-2.5");
  assert.equal(pick.odds, "1.2451");
  assert.equal(pick.offer, undefined);
});

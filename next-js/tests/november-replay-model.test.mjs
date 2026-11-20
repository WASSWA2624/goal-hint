import assert from "node:assert/strict";
import test from "node:test";
import { getDayBoundsInTimeZone } from "../src/domain/device-calendar.ts";
import { novemberReplayRange, novemberReplayZone } from "../src/domain/november-replay.ts";
import { compareForecastPicks } from "../src/domain/recommendation.ts";
import { goalProbabilities, localGoalModelVersion } from "../src/server/intelligence/local-goals-model.ts";
import { buildNovemberReplayMarkets } from "../src/server/intelligence/november-replay-model.ts";

test("the November replay covers the full Kampala browsing month with an exclusive December boundary", () => {
  assert.equal(novemberReplayRange.dayCount, 30);
  assert.equal(novemberReplayRange.window.startInclusive, Date.parse("2026-10-31T21:00:00Z"));
  assert.equal(novemberReplayRange.window.endExclusive, Date.parse("2026-11-30T21:00:00Z"));
  assert.equal(novemberReplayRange.window.endExclusive, getDayBoundsInTimeZone("2026-12-01", novemberReplayZone).startInclusive);
  assert.notEqual(novemberReplayRange.window.endExclusive, getDayBoundsInTimeZone("2026-12-01", "America/New_York").startInclusive);
});

test("a retrospective estimate uses approved local families and ranks exact distributions without prices", () => {
  const expectedGoals = { home: 1.6, away: 1.1 };
  const probabilities = goalProbabilities(expectedGoals.home, expectedGoals.away);
  const forecast = { status: "estimated", expectedGoals, probabilities, modelVersion: localGoalModelVersion() };
  const result = buildNovemberReplayMarkets(forecast);
  assert.equal(result.markets.length, new Set(result.markets.map(({ definition }) => definition.key)).size);
  const totalLines = new Set(result.markets.flatMap(({ definition }) => definition.selections.flatMap(({ rule }) =>
    (rule.kind === "total" || rule.kind === "asian-total") && rule.metric === "total" ? [rule.line] : [])));
  assert.deepEqual([...totalLines].sort((a, b) => a - b), Array.from({ length: 17 }, (_, index) => 1.5 + index / 4));
  const teamLines = result.markets.flatMap(({ definition }) => definition.selections.flatMap(({ rule }) =>
    (rule.kind === "total" || rule.kind === "asian-total") && rule.metric !== "total" ? [rule.line] : []));
  assert.ok(teamLines.length > 0);
  assert.ok(teamLines.every((line) => line >= 1.5 && line <= 5.5));
  assert.ok(!result.selected.marketKey.includes(":6.5:"));
  const exact = result.markets.find(({ definition }) => definition.key === "goal:full-time:result");
  assert.equal(exact.selections.find(({ key }) => key === "home").outcomes.win, probabilities["match-result"]["home-win"]);
  const quarter = result.markets.find(({ definition }) => definition.key === "goal:full-time:totals:total:5.25:asian");
  assert.ok(quarter.selections.some(({ outcomes }) => outcomes["half-win"] > 0));
  const ranked = result.markets.flatMap(({ definition, selections }) => selections.map(({ key: selection, outcomes }) =>
    ({ key: definition.key, selection, probability: outcomes.win, odds: null }))).sort(compareForecastPicks);
  assert.deepEqual(result.selected, { marketKey: ranked[0].key, selection: ranked[0].selection, probability: ranked[0].probability });
  assert.equal(buildNovemberReplayMarkets({ ...forecast, status: "withheld" }), null);
  assert.equal(buildNovemberReplayMarkets({ ...forecast, modelVersion: "unsupported" }), null);
});

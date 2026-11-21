import assert from "node:assert/strict";
import test from "node:test";
import { getDayBoundsInTimeZone } from "../src/domain/device-calendar.ts";
import { inclusiveReplayEvidenceCutoff, novemberReplayRange, novemberReplayZone, replaySuppressionClocks } from "../src/domain/november-replay.ts";
import { compareForecastPicks } from "../src/domain/recommendation.ts";
import { goalProbabilities, localGoalModelVersion } from "../src/server/intelligence/local-goals-model.ts";
import { replayFeaturedCalibration } from "../src/server/intelligence/november-replay-evaluation.ts";
import { sameReplayFeaturedDisplay } from "../src/server/intelligence/november-replay-featured.ts";
import { buildNovemberReplayMarkets } from "../src/server/intelligence/november-replay-model.ts";

test("the November replay covers the full Kampala browsing month with an exclusive December boundary", () => {
  assert.equal(novemberReplayRange.dayCount, 30);
  assert.equal(novemberReplayRange.window.startInclusive, Date.parse("2026-10-31T21:00:00Z"));
  assert.equal(novemberReplayRange.window.endExclusive, Date.parse("2026-11-30T21:00:00Z"));
  assert.equal(novemberReplayRange.window.endExclusive, getDayBoundsInTimeZone("2026-12-01", novemberReplayZone).startInclusive);
  assert.notEqual(novemberReplayRange.window.endExclusive, getDayBoundsInTimeZone("2026-12-01", "America/New_York").startInclusive);
});

test("recorded rebuilt evidence uses the inclusive clock of the same pre-lock window", () => {
  const decisionAt = Date.parse("2026-11-21T17:00:00Z");
  assert.equal(inclusiveReplayEvidenceCutoff(decisionAt + 1, decisionAt), decisionAt);
  assert.equal(inclusiveReplayEvidenceCutoff(decisionAt - 1, decisionAt), decisionAt - 1);
  assert.equal(inclusiveReplayEvidenceCutoff(decisionAt + 2, decisionAt), decisionAt + 2);
  assert.equal(inclusiveReplayEvidenceCutoff(null, decisionAt), null);
});

test("prior-pointer suppression retains the archived evidence window and a verified decision clock", () => {
  const exclusiveCutoffAt = Date.parse("2026-11-21T17:00:00Z");
  assert.deepEqual(replaySuppressionClocks(exclusiveCutoffAt, exclusiveCutoffAt - 1),
    { decisionAt: exclusiveCutoffAt - 1, evidenceCutoffAt: exclusiveCutoffAt - 1 });
  assert.deepEqual(replaySuppressionClocks(exclusiveCutoffAt, null),
    { decisionAt: exclusiveCutoffAt, evidenceCutoffAt: exclusiveCutoffAt });
  assert.equal(replaySuppressionClocks(exclusiveCutoffAt, exclusiveCutoffAt - 2), null);
});

test("retrospective policy comparison ignores private policy metadata and preserves meaningful display changes", () => {
  const first = { version: "local-featured-pre-match-v1", status: "priced", marketKey: "m", selection: "under", probability: 0.84,
    quote: { decimal: "1.37", bookmakerId: 6 } };
  const second = { ...first, version: "local-featured-pre-match-v2", threshold: 0.8 };
  assert.equal(sameReplayFeaturedDisplay(first, second), true);
  assert.equal(sameReplayFeaturedDisplay(first, { ...second, selection: "over" }), false);
  assert.equal(sameReplayFeaturedDisplay(first, { ...second, quote: { ...second.quote, decimal: "1.3701" } }), false);
  assert.equal(sameReplayFeaturedDisplay(first, { ...second, status: "abstained" }), false);
  assert.equal(sameReplayFeaturedDisplay({ status: "abstained" }, { status: "abstained" }), true);
});

test("featured calibration uses inclusive lower bands, an inclusive upper bound at one, and outright wins", () => {
  const bands = replayFeaturedCalibration([{ probability: 0.6, won: true }, { probability: 0.649, won: false },
    { probability: 0.65, won: true }, { probability: 0.7, won: false }, { probability: 1, won: true }]);
  assert.deepEqual(bands.map(({ n, outrightWins }) => [n, outrightWins]), [[2, 1], [1, 1], [1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [1, 1]]);
  assert.ok(Math.abs(bands[0].brier - ((0.6 - 1) ** 2 + 0.649 ** 2) / 2) < 1e-12);
  assert.ok(bands.every(({ sufficientSample }) => !sufficientSample));
  assert.equal(bands[3].meanModelProbability, null);
  assert.equal(bands[7].brier, 0);
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

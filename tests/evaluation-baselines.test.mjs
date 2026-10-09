import assert from "node:assert/strict";
import test from "node:test";
import { reconstructBaselines } from "../src/server/evaluation/evaluation-baselines.ts";
import { marketRules } from "../src/domain/markets.ts";
import { EVIDENCE_NOW, evidenceContext, evidenceHash } from "./helpers/evidence-fixtures.mjs";

// All results, fixture IDs and configuration here are labeled synthetic records.
// No score/provider/news history is claimed to be genuine trial evidence.
const id = (number) => `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const COMPETITION = id(50), HOME = id(10), AWAY = id(20), DAY = 86_400_000;
function fixture(overrides = {}) {
  return { context: evidenceContext(undefined, { fixtureId: id(100), cycleId: id(101), cutoffAt: EVIDENCE_NOW,
    home: { teamId: HOME, externalId: 10 }, away: { teamId: AWAY, externalId: 20 }, ...overrides }),
  competitionId: COMPETITION };
}
function config(overrides = {}) {
  const base = { version: "synthetic-baselines-v1", lookbackMs: 30 * DAY, minimumMatches: 1,
    leagueFrequency: { alpha: 1 }, teamStrength: { initialRating: 1500, kFactor: 32, scale: 400, homeAdvantage: 0, drawWeight: 1 } };
  return { ...base, ...overrides, leagueFrequency: { ...base.leagueFrequency, ...overrides.leagueFrequency },
    teamStrength: { ...base.teamStrength, ...overrides.teamStrength } };
}
function result(number, homeGoals = 2, awayGoals = 0, overrides = {}) {
  return { fixtureId: id(number), cycleId: id(number + 1000), competitionId: COMPETITION, homeTeamId: HOME, awayTeamId: AWAY,
    kickoffAt: EVIDENCE_NOW - (10 - number) * DAY, availableAt: EVIDENCE_NOW - (10 - number) * DAY + 2 * 60 * 60 * 1000,
    homeGoals, awayGoals, period: marketRules.period, observationHash: evidenceHash(`synthetic-history-${number}`),
    evidenceRef: `synthetic-regulation-result-proof-${number}`, ...overrides };
}
const distribution = (forecast, family = "match-result") => {
  assert.equal(forecast.markets.markets[family].available, true);
  return forecast.markets.markets[family].market.probabilities;
};
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-12, `${actual} != ${expected}`);

test("league frequencies reconstruct hand-counted regulation distributions with explicit additive smoothing", () => {
  const history = [result(1, 3, 0), result(2, 1, 1), result(3, 0, 1)];
  const baselines = reconstructBaselines(fixture(), history, config());
  const league = baselines["league-frequency"];
  assert.deepEqual(distribution(league), { "home-win": 1 / 3, draw: 1 / 3, "away-win": 1 / 3 });
  assert.deepEqual(distribution(league, "total-goals"), { "over-2.5": 0.4, "under-2.5": 0.6 });
  assert.deepEqual(distribution(league, "both-teams-to-score"), { yes: 0.4, no: 0.6 });
  approximately(distribution(league, "double-chance")["home-or-draw"], 2 / 3);
  assert.equal(league.markets.ruleVersion, marketRules.ruleVersion);
  assert.equal(league.version, "synthetic-baselines-v1");
  assert.deepEqual(league.historyIds, history.map((entry) => entry.observationHash));
});

test("a single known Elo update produces the specified Davidson result probabilities", () => {
  const baseline = reconstructBaselines(fixture(), [result(1, 2, 0)], config())["team-strength"];
  // Equal starting ratings and drawWeight=1 give pHome=pDraw=pAway=1/3.
  // The home win raises home by 16 and lowers away by 16.
  const q = 10 ** (32 / 800), denominator = q + 1 + 1 / q;
  const probabilities = distribution(baseline);
  approximately(probabilities["home-win"], q / denominator);
  approximately(probabilities.draw, 1 / denominator);
  approximately(probabilities["away-win"], (1 / q) / denominator);
  approximately(distribution(baseline, "double-chance")["home-or-draw"], probabilities["home-win"] + probabilities.draw);
  assert.equal(baseline.markets.markets["total-goals"].reason, "unsupported-family");
  assert.equal(baseline.markets.markets["both-teams-to-score"].reason, "unsupported-family");
});

test("away wins lower the home rating and swapping target orientation swaps home/away estimates", () => {
  const history = [result(1, 0, 3)];
  const normal = distribution(reconstructBaselines(fixture(), history, config())["team-strength"]);
  const swapped = distribution(reconstructBaselines(fixture({ home: { teamId: AWAY, externalId: 20 },
    away: { teamId: HOME, externalId: 10 } }), history, config())["team-strength"]);
  assert.ok(normal["away-win"] > normal["home-win"]);
  approximately(normal["home-win"], swapped["away-win"]);
  approximately(normal["away-win"], swapped["home-win"]);
  approximately(normal.draw, swapped.draw);
});

test("a drawn history result leaves equal ratings unchanged when approved home advantage is zero", () => {
  const probabilities = distribution(reconstructBaselines(fixture(), [result(1, 2, 2)], config())["team-strength"]);
  assert.deepEqual(probabilities, { "home-win": 1 / 3, draw: 1 / 3, "away-win": 1 / 3 });
});

test("home advantage participates in both historical expected scores and target probabilities", () => {
  const parameters = config({ teamStrength: { homeAdvantage: 100, drawWeight: 2 } });
  const baseline = reconstructBaselines(fixture(), [result(1, 2, 0)], parameters)["team-strength"];
  const initialQ = 10 ** (100 / 800), initialDenominator = initialQ + 2 + 1 / initialQ;
  const expectedScore = initialQ / initialDenominator + 0.5 * (2 / initialDenominator);
  const adjustment = 32 * (1 - expectedScore);
  const q = 10 ** ((2 * adjustment + 100) / 800), denominator = q + 2 + 1 / q;
  const probability = distribution(baseline);
  approximately(probability["home-win"], q / denominator);
  approximately(probability.draw, 2 / denominator);
  approximately(probability["away-win"], (1 / q) / denominator);
});

test("later or unknown-at-cutoff results cannot influence either baseline", () => {
  const history = [result(1, 1, 0)];
  const future = result(2, 100, 0, { availableAt: EVIDENCE_NOW + 1 });
  const laterKickoff = result(3, 0, 100, { kickoffAt: EVIDENCE_NOW, availableAt: EVIDENCE_NOW });
  assert.deepEqual(reconstructBaselines(fixture(), [...history, future, laterKickoff], config()),
    reconstructBaselines(fixture(), history, config()));
});

test("availability at the exact evidence cutoff is usable but kickoff at that cutoff is excluded", () => {
  const available = result(1, 2, 0, { availableAt: EVIDENCE_NOW });
  const tooLate = result(2, 0, 2, { kickoffAt: EVIDENCE_NOW, availableAt: EVIDENCE_NOW });
  const baselines = reconstructBaselines(fixture(), [available, tooLate], config());
  assert.deepEqual(baselines["league-frequency"].historyIds, [available.observationHash]);
});

test("frozen lookback is inclusive at its start and excludes older history", () => {
  const oldest = result(1, 2, 0, { kickoffAt: EVIDENCE_NOW - 2 * DAY, availableAt: EVIDENCE_NOW - DAY });
  const outside = result(2, 0, 2, { kickoffAt: oldest.kickoffAt - 1, availableAt: EVIDENCE_NOW - DAY });
  const baselines = reconstructBaselines(fixture(), [outside, oldest], config({ lookbackMs: 2 * DAY }));
  assert.deepEqual(baselines["team-strength"].historyIds, [oldest.observationHash]);
  assert.deepEqual(distribution(baselines["league-frequency"]), { "home-win": 0.5, draw: 0.25, "away-win": 0.25 });
});

test("foreign competitions, the target fixture and its cycle are omitted from reconstruction", () => {
  const target = fixture();
  const included = result(1);
  const rows = [included, result(2, 0, 20, { competitionId: id(51) }),
    result(3, 0, 20, { fixtureId: target.context.fixtureId }), result(4, 0, 20, { cycleId: target.context.cycleId })];
  assert.deepEqual(reconstructBaselines(target, rows, config()), reconstructBaselines(target, [included], config()));
});

test("later cutoffs may consume newly observed prior results without changing frozen parameters", () => {
  const prior = result(1, 2, 0), newlyObserved = result(2, 0, 3, { availableAt: EVIDENCE_NOW + 1000 });
  const earlier = reconstructBaselines(fixture(), [prior, newlyObserved], config());
  const later = reconstructBaselines(fixture({ cutoffAt: EVIDENCE_NOW + 1000, analysisAt: EVIDENCE_NOW + 1000 }), [prior, newlyObserved], config());
  assert.deepEqual(earlier["league-frequency"].historyIds, [prior.observationHash]);
  assert.deepEqual(later["league-frequency"].historyIds, [prior.observationHash, newlyObserved.observationHash]);
  assert.equal(earlier["team-strength"].version, later["team-strength"].version);
  assert.notDeepEqual(distribution(earlier["team-strength"]), distribution(later["team-strength"]));
});

test("minimum history prevents a prior-only forecast for either baseline", () => {
  for (const history of [[], [result(1)]]) {
    const baselines = reconstructBaselines(fixture(), history, config({ minimumMatches: 2 }));
    for (const baseline of Object.values(baselines)) {
      assert.equal(baseline.markets.markets["match-result"].available, false);
      assert.equal(baseline.markets.markets["double-chance"].available, false);
      assert.ok(baseline.limitations.includes("insufficient-history"));
    }
  }
});

test("unobserved target ratings are explicitly limited while a qualifying league history uses approved initial ratings", () => {
  const baseline = reconstructBaselines(fixture(), [result(1, 2, 0, { homeTeamId: id(30), awayTeamId: id(40) })], config())["team-strength"];
  assert.deepEqual(distribution(baseline), { "home-win": 1 / 3, draw: 1 / 3, "away-win": 1 / 3 });
  assert.ok(baseline.limitations.includes("home-team-rating-unobserved"));
  assert.ok(baseline.limitations.includes("away-team-rating-unobserved"));
});

test("duplicate fixture/cycle records fail instead of double counting revised results", () => {
  const first = result(1);
  for (const second of [{ ...first }, { ...first, observationHash: evidenceHash("synthetic-revised-result") }])
    assert.throws(() => reconstructBaselines(fixture(), [first, second], config()));
});

test("distinct verified matches may reference the same original batch-response artifact", () => {
  const first = result(1), second = result(2, 0, 3, { observationHash: first.observationHash });
  const baselines = reconstructBaselines(fixture(), [first, second], config());
  assert.deepEqual(baselines["league-frequency"].historyIds, [first.observationHash, first.observationHash]);
  assert.deepEqual(distribution(baselines["league-frequency"]), { "home-win": 0.4, draw: 0.2, "away-win": 0.4 });
});

test("malformed provenance, unverified periods, impossible result times and scores are rejected", () => {
  for (const patch of [{ observationHash: "invented" }, { evidenceRef: "" }, { period: "extra-time" },
    { availableAt: EVIDENCE_NOW - 10 * DAY }, { homeGoals: NaN }, { awayGoals: Infinity },
    { homeGoals: -1 }, { awayGoals: 1.5 }, { homeTeamId: AWAY }, { winner: "home" }])
    assert.throws(() => reconstructBaselines(fixture(), [result(1, 2, 0, patch)], config()));
});

test("unsafe baseline settings cannot replace explicit approved configuration", () => {
  for (const settings of [config({ lookbackMs: 0 }), config({ minimumMatches: 0 }), config({ minimumMatches: 100_001 }),
    config({ leagueFrequency: { alpha: 0 } }), config({ leagueFrequency: { alpha: Infinity } }),
    config({ teamStrength: { kFactor: 0 } }), config({ teamStrength: { scale: 0 } }),
    config({ teamStrength: { drawWeight: 0 } }), config({ teamStrength: { initialRating: NaN } }),
    { ...config(), automaticTuning: true }])
    assert.throws(() => reconstructBaselines(fixture(), [result(1)], settings));
});

test("strict shared probability bounds reject extreme model output instead of clamping it", () => {
  const baselines = reconstructBaselines(fixture(), [result(1)], config({ teamStrength: { scale: Number.MIN_VALUE, homeAdvantage: 1_000_000 } }));
  assert.equal(baselines["team-strength"].markets.markets["match-result"].available, false);
  assert.equal(baselines["team-strength"].markets.markets["match-result"].reason, "invalid-probability");
  assert.equal(baselines["league-frequency"].markets.markets["match-result"].available, true);
});

test("floating-point smoothing at probability boundaries stays unavailable without invented epsilon", () => {
  const baseline = reconstructBaselines(fixture(), [result(1, 3, 0)], config({ leagueFrequency: { alpha: Number.MIN_VALUE } }))["league-frequency"];
  assert.equal(baseline.markets.markets["match-result"].available, false);
  assert.equal(baseline.markets.markets["total-goals"].available, false);
  assert.equal(baseline.markets.markets["both-teams-to-score"].available, false);
});

test("deterministic chronological sorting makes repeated reconstruction order-independent and immutable", () => {
  const history = [result(1, 3, 0), result(2, 0, 1), result(3, 1, 1)];
  const input = structuredClone(history), settings = config();
  const ordered = reconstructBaselines(fixture(), history, settings);
  const shuffled = reconstructBaselines(fixture(), [history[2], history[0], history[1]], settings);
  assert.deepEqual(ordered, shuffled);
  assert.deepEqual(ordered, reconstructBaselines(fixture(), history, settings));
  assert.deepEqual(history, input);
  assert.equal(Object.isFrozen(ordered), true);
  assert.equal(Object.isFrozen(ordered["team-strength"].historyIds), true);
  assert.equal(Object.isFrozen(ordered["league-frequency"].markets.markets), true);
});

test("same-time history uses a deterministic identity tie-break without reading target outcomes or forecasts", () => {
  const first = result(1, 3, 0), second = result(2, 0, 2, { kickoffAt: first.kickoffAt, availableAt: first.availableAt });
  const target = fixture();
  Object.defineProperties(target, { forecasts: { get() { throw new Error("Target forecasts must not be read."); } },
    result: { get() { throw new Error("Target result must not be read."); } } });
  assert.deepEqual(reconstructBaselines(target, [second, first], config()), reconstructBaselines(target, [first, second], config()));
});

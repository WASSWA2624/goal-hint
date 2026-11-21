import assert from "node:assert/strict";
import test from "node:test";
import { registeredForecastGoalMarkets } from "../src/domain/goal-market-definitions.ts";
import { assessLocalFeaturedHistory, historyAdjustedFeaturedProbability, localFeaturedHistoryKey, localFeaturedHistoryVersion }
  from "../src/domain/local-featured-history.ts";

const day = 86_400_000;
const at = Date.UTC(2026, 10, 23, 12);
const exactMarket = "goal:full-time:totals:total:1.5:binary";
const halfMarket = "goal:half-time:totals:total:1.5:binary";
const target = (changes = {}) => ({ fixtureId: "target", decisionAt: at, kickoffAt: at + 300_000,
  marketKey: exactMarket, selection: "over", probability: 0.80, ...changes });

function observation(index, changes = {}) {
  const fixtureKickoffAt = at - 12 * day;
  return { fixtureId: `fixture-${index}`, revisionId: `original-${index}`, resultId: `result-${index}`,
    marketKey: exactMarket, selection: "over", source: "local-engine", origin: "original", accepted: true,
    probability: 0.80, grade: "win", fixtureKickoffAt, evidenceCutoffAt: fixtureKickoffAt - 600_000,
    publishedAt: fixtureKickoffAt - 400_000, originalLockedAt: fixtureKickoffAt - 200_000,
    resultObservedAt: fixtureKickoffAt + 6_000_000, resultAvailableAt: fixtureKickoffAt + 6_100_000, ...changes };
}

test("historical reliability keys preserve the exact market, period, side, line, payout convention and outcome", () => {
  const identity = localFeaturedHistoryKey;
  assert.equal(identity("total-goals", "over-2.5"), identity("goal:full-time:totals:total:2.5:binary", "over"));
  assert.equal(identity("double-chance", "home-or-away"), identity("goal:full-time:double-chance", "home-away"));
  assert.notEqual(identity("double-chance", "home-or-draw"), identity("double-chance", "away-or-draw"));
  assert.notEqual(identity("both-teams-to-score", "yes"), identity("both-teams-to-score", "no"));
  for (const other of [halfMarket, "goal:full-time:totals:home:1.5:binary", "goal:full-time:totals:total:4.5:binary"]) {
    assert.ok(identity(other, "over"));
    assert.notEqual(identity(other, "over"), identity(exactMarket, "over"));
  }
  assert.equal(identity("goal:full-time:totals:total:999.5:binary", "over"), null);
  assert.equal(identity(exactMarket, "yes"), null);
});

test("uses the latest verifiable as-of result per accepted original and preserves the earlier read before a correction", () => {
  const first = observation("corrected");
  const later = { ...first, resultId: "corrected-result", grade: "loss", resultObservedAt: at + 1, resultAvailableAt: at + 2 };
  const unreleased = { ...first, resultId: "withdrawn-result", grade: null, resultObservedAt: at + 500, resultAvailableAt: at + 600 };
  const conflict = { ...later, resultId: "same-time-other-seal", grade: "win" };
  const asOf = (decisionAt, rows) => assessLocalFeaturedHistory(target({ decisionAt }), rows);
  assert.equal(asOf(at, [first, later, unreleased]).support.actualWinRate, 1);
  assert.equal(asOf(at + 2, [later, first]).support.actualWinRate, 1, "same-time correction was unavailable strictly before cutoff");
  assert.equal(asOf(at + 3, [later, first, first]).support.actualWinRate, 0);
  assert.equal(asOf(at + 3, [later, first, first]).support.samples, 1);
  assert.equal(asOf(at + 3, [conflict, first, later]).conflictingFixtures, 1);
  assert.equal(asOf(at + 3, [later, first, conflict]).support, null);
  const withdrawn = asOf(at + 601, [first, later, conflict, unreleased]);
  assert.equal(withdrawn.unsettledFixtures, 1);
  assert.equal(withdrawn.conflictingFixtures, 0, "the newer authoritative version supersedes the old conflict");
  assert.equal(withdrawn.support, null);
  const differentOriginal = { ...later, revisionId: "other accepted publication" };
  assert.equal(asOf(at + 3, [first, differentOriginal]).conflictingFixtures, 1);
});

test("excludes own fixture, replay, post-decision commits, invalid originals and unavailable result proofs", () => {
  const before = observation("before");
  const audit = assessLocalFeaturedHistory(target(), [
    before,
    observation("own", { fixtureId: "target" }), observation("replay", { origin: "replay" }),
    observation("provider", { source: "api-football" }), observation("proposal", { accepted: false }),
    observation("published-after-kickoff", { publishedAt: before.fixtureKickoffAt }),
    observation("evidence-after-publication", { evidenceCutoffAt: before.publishedAt + 1 }),
    observation("not-locked-yet", { originalLockedAt: at }),
    observation("invalid-clock", { resultAvailableAt: before.resultObservedAt - 1 }),
    observation("not-played-yet", { resultObservedAt: before.fixtureKickoffAt - 1 }),
    observation("committed-late", { resultAvailableAt: at + 1 }), observation("at-cutoff", { resultAvailableAt: at }),
    observation("invalid-probability", { probability: 1.1 }),
    observation("away", { marketKey: "goal:full-time:totals:away:1.5:binary" }),
    observation("other-half", { marketKey: halfMarket }),
    observation("other-outcome", { selection: "under" }),
  ]);
  assert.equal(audit.version, localFeaturedHistoryVersion);
  assert.equal(audit.status, "sparse");
  assert.equal(audit.comparableFixtures, 1);
  assert.equal(historyAdjustedFeaturedProbability(0.80, audit), 0.80);
  assert.equal(assessLocalFeaturedHistory(target({ kickoffAt: at }), [before]).status, "invalid-target");
});

test("a known occurrence invalidation withdraws history only after its recorded availability", () => {
  const original = observation("same-occurrence", { occurrenceInvalidatedAt: at });
  assert.equal(assessLocalFeaturedHistory(target(), [original]).support.samples, 1);
  const afterCorrection = assessLocalFeaturedHistory(target({ decisionAt: at + 1 }), [original]);
  assert.equal(afterCorrection.comparableFixtures, 0);
  assert.equal(afterCorrection.support, null);
});

test("backoff uses sample support, not observed win rate, and applies signed shrunken reliability only", () => {
  const context = { competitionId: "league", homeTeamId: "home", awayTeamId: "away", neutralVenue: false,
    strength: { basis: "ratings-v1", home: .62, away: .48 } };
  const scope = target({ context });
  const recent = Array.from({ length: 50 }, (_, index) => observation(`similar-${index}`, { context, grade: index < 42 ? "win" : "loss", probability: .71 }));
  const outside = Array.from({ length: 120 }, (_, index) => observation(`different-${index}`, {
    context: { competitionId: "other" }, grade: "loss", probability: .78 }));
  const narrower = recent.map((sample) => ({ ...sample, probability: .78, grade: "win" }));
  const chosen = assessLocalFeaturedHistory(scope, [...outside, ...narrower]);
  assert.equal(chosen.scope, "same-competition-context");
  assert.equal(chosen.support.samples, 50);
  assert.equal(chosen.status, "supported");
  assert.ok(chosen.adjustment > 0 && chosen.adjustment <= .025);
  assert.ok(historyAdjustedFeaturedProbability(.80, chosen) > .80);
  const weak = assessLocalFeaturedHistory(scope, [...outside, ...recent]);
  assert.equal(weak.scope, "cross-competition", "sparse comparable league records permit the broader sample");
  assert.equal(weak.status, "supported");
  assert.ok(weak.adjustment < 0 && weak.adjustment >= -.015);
  assert.deepEqual(assessLocalFeaturedHistory(scope, [...narrower, ...outside].reverse()), chosen);
  const equallyReliable = narrower.map((sample, index) => ({ ...sample, probability: .80, grade: index < 40 ? "win" : "loss" }));
  const inconclusive = assessLocalFeaturedHistory(scope, [...outside, ...equallyReliable]);
  assert.equal(inconclusive.scope, "same-competition-context", "sufficient specific evidence is retained even if its signal is neutral");
  assert.equal(inconclusive.status, "uncertain");
  assert.equal(inconclusive.adjustment, 0);
  assert.equal(historyAdjustedFeaturedProbability(.80, inconclusive), .80);
});

test("never treats easy win frequencies, incompatible known venues or distant strength as comparable", () => {
  const context = { competitionId: "league", neutralVenue: false, strength: { basis: "reviewed", home: .65, away: .45 } };
  const samples = Array.from({ length: 150 }, (_, index) => observation(index, { probability: .98, context }));
  samples.push(observation("venue", { context: { ...context, neutralVenue: true } }));
  samples.push(observation("strength", { context: { ...context, strength: { basis: "reviewed", home: .25, away: .7 } } }));
  samples.push(observation("known-compatible", { context: { ...context, strength: null } }));
  const audit = assessLocalFeaturedHistory(target({ context }), samples);
  assert.equal(audit.comparableFixtures, 1);
  assert.equal(audit.status, "sparse");
  assert.equal(audit.adjustment, 0);
});

test("a high win frequency aligned with original forecasts supplies no positive ranking adjustment", () => {
  const highWins = Array.from({ length: 100 }, (_, index) => observation(index, {
    probability: .90, grade: index < 90 ? "win" : "loss",
  }));
  const history = assessLocalFeaturedHistory(target({ probability: .85 }), highWins);
  assert.equal(history.scope, "cross-competition");
  assert.ok(Math.abs(history.support.actualWinRate - .9) < 1e-12);
  assert.ok(Math.abs(history.support.meanResidual) < 1e-12);
  assert.equal(history.status, "uncertain");
  assert.equal(historyAdjustedFeaturedProbability(.85, history), .85);
});

test("push and partial grades are distinct from an outright win and binary settlement fails closed", () => {
  const { definition } = registeredForecastGoalMarkets(true).find(({ family, definition }) =>
    family === "total-goals" && definition.period === "full-time" && definition.group === "payout");
  const identity = { marketKey: definition.key, selection: definition.selections[0].key };
  const rows = ["win", "loss", "push", "half-win", "half-loss"].map((grade, index) => observation(index, { ...identity, grade }));
  const history = assessLocalFeaturedHistory(target(identity), rows);
  assert.ok(Math.abs(history.support.actualWinRate - .20) < 1e-12);
  const binary = assessLocalFeaturedHistory(target(), [observation(1, { grade: "push" })]);
  assert.equal(binary.unsettledFixtures, 1);
  assert.equal(binary.support, null);
});

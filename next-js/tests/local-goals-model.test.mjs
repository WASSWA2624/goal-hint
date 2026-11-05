import assert from "node:assert/strict";
import test from "node:test";
import { checkMarketConsistency } from "../src/domain/markets.ts";
import { estimateLocalGoals, goalProbabilities } from "../src/server/intelligence/local-goals-model.ts";
import { intelligenceFixture, intelligenceHistory, intelligenceResult, INTELLIGENCE_DAY } from "./helpers/intelligence-fixtures.mjs";

test("Poisson score model produces exact binary marginals and coherent mutually exclusive markets", () => {
  const p = goalProbabilities(1.5, 0.75);
  assert.ok(Math.abs(p["total-goals"]["under-2.5"] - Math.exp(-2.25) * (1 + 2.25 + 2.25 ** 2 / 2)) < 1e-12);
  assert.ok(Math.abs(p["both-teams-to-score"].yes - (1 - Math.exp(-1.5)) * (1 - Math.exp(-0.75))) < 1e-12);
  assert.ok(Math.abs(Object.values(p["match-result"]).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.equal(p["double-chance"]["home-or-draw"], p["match-result"]["home-win"] + p["match-result"].draw);
  assert.deepEqual(checkMarketConsistency(p["match-result"], p["total-goals"], p["both-teams-to-score"]), []);
  const symmetric = goalProbabilities(1.3, 1.3)["match-result"];
  assert.ok(Math.abs(symmetric["home-win"] - symmetric["away-win"]) < 1e-12);
});

test("regularized fit is reproducible regardless of row order and retains compact tail mass", () => {
  const fixture = intelligenceFixture(), history = intelligenceHistory();
  const result = estimateLocalGoals({ fixture, history });
  assert.equal(result.status, "estimated");
  assert.deepEqual(result, estimateLocalGoals({ fixture, history: [...history].reverse() }));
  assert.ok(result.expectedGoals.home > result.expectedGoals.away);
  assert.equal(result.diagnostics.converged, true);
  assert.ok(Math.abs(result.scoreDistribution.states.reduce((sum, state) => sum + state.probability, 0) + result.scoreDistribution.unrepresentedProbability - 1) < 1e-9);
  assert.ok(result.reasons.includes("uncalibrated-shadow-estimate"));
});

test("future, unknown-at-cutoff, foreign league and target results cannot change the forecast", () => {
  const fixture = intelligenceFixture(), history = intelligenceHistory(), control = estimateLocalGoals({ fixture, history });
  const future = intelligenceResult({ ...fixture, fixtureId: "future" });
  const unknown = intelligenceResult({ ...fixture, fixtureId: "late-observed", kickoffAt: fixture.forecastAt - INTELLIGENCE_DAY });
  unknown.availableAt = fixture.forecastAt + 1;
  const foreign = { ...history[0], fixtureId: "foreign", competitionId: "different-league", homeGoals: 20 };
  assert.deepEqual(control, estimateLocalGoals({ fixture, history: [...history, future, unknown, foreign, intelligenceResult(fixture)] }));
});

test("sparse history and unobserved team withhold; stale histories increase uncertainty", () => {
  assert.equal(estimateLocalGoals({ fixture: intelligenceFixture(), history: intelligenceHistory(2) }).status, "withheld");
  assert.equal(estimateLocalGoals({ fixture: intelligenceFixture({ homeTeamId: "new-team" }), history: intelligenceHistory() }).status, "withheld");
  const fixture = intelligenceFixture(), history = intelligenceHistory();
  assert.ok(estimateLocalGoals({ fixture: { ...fixture, forecastAt: fixture.forecastAt + 100 * INTELLIGENCE_DAY,
    kickoffAt: fixture.kickoffAt + 100 * INTELLIGENCE_DAY }, history }).diagnostics.effectiveMatches <
    estimateLocalGoals({ fixture, history }).diagnostics.effectiveMatches);
});

test("the five-minute lock, duplicate result identities and malformed configuration fail safely", () => {
  const fixture = intelligenceFixture(), history = intelligenceHistory();
  assert.equal(estimateLocalGoals({ fixture: { ...fixture, forecastAt: fixture.kickoffAt - 300_000 }, history }).reasons[0], "forecast-locked");
  assert.throws(() => estimateLocalGoals({ fixture, history: [...history, history[0]] }), /duplicate/);
  assert.throws(() => estimateLocalGoals({ fixture, history, configuration: { ridge: -1 } }), /configuration/);
  assert.throws(() => goalProbabilities(0, 1), /rate/);
});

test("model configuration, full fixture identity and historical evidence bind the immutable artifact", () => {
  const fixture = intelligenceFixture(), history = intelligenceHistory();
  const original = estimateLocalGoals({ fixture, history });
  assert.deepEqual(original.fixture, fixture);
  assert.notEqual(original.modelVersion, estimateLocalGoals({ fixture, history, configuration: { ridge: 4 } }).modelVersion);
  const changed = [...history]; changed[0] = { ...changed[0], homeGoals: changed[0].homeGoals + 1 };
  assert.notEqual(original.historyHash, estimateLocalGoals({ fixture, history: changed }).historyHash);
});

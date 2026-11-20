import assert from "node:assert/strict";
import test from "node:test";
import { goalAsianHandicapMarket, goalBothTeamsScoreMarket, goalExactScoreMarket, goalHalfFullMarket,
  goalResultMarket, goalTotalsMarket } from "../src/domain/goal-market-definitions.ts";
import { deriveBoundedGoalMarket, deriveGoalMarket } from "../src/domain/score-distribution-markets.ts";
import { checkMarketConsistency } from "../src/domain/markets.ts";
import { fitCompetitionGoalModel, fittedGoalModelVersion, FITTED_GOALS_TAIL_BOUND,
  parseFittedGoalModel, scoreFittedCompetitionGoals } from "../src/server/intelligence/fitted-goals-model.ts";
import { intelligenceFixture, intelligenceHash, intelligenceHistory, intelligenceResult,
  INTELLIGENCE_DAY, INTELLIGENCE_NOW } from "./helpers/intelligence-fixtures.mjs";

const competitionId = intelligenceFixture().competitionId;
const fit = (history = intelligenceHistory(), overrides = {}) =>
  fitCompetitionGoalModel({ competitionId, asOf: INTELLIGENCE_NOW, history, ...overrides });
const artifact = (history, overrides) => {
  const result = fit(history, overrides);
  assert.equal(result.status, "fitted", JSON.stringify(result));
  return result.artifact;
};
const score = (model, overrides = {}, options) => {
  const result = scoreFittedCompetitionGoals(model, intelligenceFixture(overrides), options);
  assert.equal(result.status, "scored", JSON.stringify(result));
  return result;
};
const close = (left, right, tolerance = 1e-12) =>
  assert.ok(Math.abs(left - right) <= tolerance, `${left} differs from ${right} by more than ${tolerance}`);

test("competition fits have canonical replay identity and can score multiple fixtures without training rows", () => {
  const rows = intelligenceHistory(), model = artifact(rows);
  assert.equal(model.version, fittedGoalModelVersion());
  assert.equal(model.training.matches, rows.length);
  assert.deepEqual(artifact([...rows].reverse()), model);
  assert.notEqual(artifact(rows, { configuration: { ridge: 4 } }).version, model.version);
  const restored = parseFittedGoalModel(JSON.parse(JSON.stringify(model)));
  assert.deepEqual(restored, model);
  assert.ok(Object.isFrozen(restored) && Object.isFrozen(restored.teams[0]));
  assert.deepEqual(score(restored), score(model));
  assert.equal(score(restored, { awayTeamId: "team-4" }).evidence.connectedTeamHistory, true);
  assert.ok(rows.every((row) => ![row.homeTeamId, row.awayTeamId].every((id) => ["team-0", "team-4"].includes(id))));
  assert.equal(parseFittedGoalModel({ ...model, baseline: model.baseline + .1 }), null);
  assert.equal(parseFittedGoalModel({ ...model, unexpected: "not an artifact field" }), null);
});

test("the point-in-time fit counts each played match once and only uses the newest eligible result", () => {
  const rows = intelligenceHistory(), original = artifact(rows);
  const correction = { ...rows[0], availableAt: rows[0].availableAt + 1_000, homeGoals: 4,
    observationHash: intelligenceHash("correction") };
  const futureCorrection = { ...correction, availableAt: INTELLIGENCE_NOW + 1 };
  const foreign = { ...rows[0], fixtureId: "foreign", competitionId: "other" };
  const target = intelligenceResult(intelligenceFixture());
  assert.deepEqual(artifact([...rows, rows[0], futureCorrection, foreign, target]), original);
  const corrected = artifact([...rows, correction]);
  assert.equal(corrected.training.matches, original.training.matches);
  assert.notEqual(corrected.training.historyHash, original.training.historyHash);
  assert.deepEqual(artifact([correction, ...rows].reverse()), corrected);
  const conflict = { ...correction, homeGoals: 5, observationHash: intelligenceHash("contradiction") };
  assert.deepEqual(fit([...rows, correction, conflict]), { status: "withheld", reason: "ambiguous-result-observation" });
});

test("chronology, team coverage and disconnected schedules withhold unless a sparse diagnostic is explicitly requested", () => {
  const model = artifact(), fixture = intelligenceFixture();
  assert.deepEqual(fit(intelligenceHistory(2)), { status: "withheld", reason: "insufficient-competition-history" });
  for (const [input, reason] of [
    [{ ...fixture, competitionId: "foreign" }, "wrong-competition"],
    [{ ...fixture, forecastAt: fixture.kickoffAt - 300_000 }, "forecast-locked"],
    [{ ...fixture, forecastAt: fixture.forecastAt - 1 }, "artifact-from-future"],
    [{ ...fixture, kickoffAt: fixture.kickoffAt + 740 * INTELLIGENCE_DAY, forecastAt: fixture.forecastAt + 740 * INTELLIGENCE_DAY }, "expired-fitted-model"],
    [{ ...fixture, awayTeamId: "unseen-team" }, "insufficient-team-history"],
    [{ ...fixture, awayTeamId: "team-2" }, "disconnected-team-history"],
  ]) {
    assert.deepEqual(scoreFittedCompetitionGoals(model, input), { status: "withheld", reason });
  }
  const prior = score(model, { awayTeamId: "unseen-team" }, { allowSparsePrior: true });
  assert.equal(prior.evidence.awayEffectiveMatches, 0);
  assert.equal(prior.evidence.uncertainty, "high");
  assert.equal(prior.evidence.support, "competition-prior");
  assert.equal(prior.evidence.eligibleForPublication, false);
  assert.ok(!Object.hasOwn(prior.evidence, "confidence"));
  assert.ok(score(model, { forecastAt: fixture.forecastAt + INTELLIGENCE_DAY,
    kickoffAt: fixture.kickoffAt + INTELLIGENCE_DAY }).evidence.competitionEffectiveMatches < model.training.effectiveMatches);
});

test("verified neutral history and forecasts omit the estimated home-venue effect", () => {
  const rows = intelligenceHistory(), model = artifact(rows);
  const designated = score(model);
  const neutral = score(model, { neutralVenue: true });
  assert.equal(designated.evidence.venue, "home-designation");
  assert.equal(neutral.evidence.venue, "verified-neutral");
  assert.equal(neutral.expectedGoals.away, designated.expectedGoals.away);
  close(designated.expectedGoals.home / neutral.expectedGoals.home, Math.exp(model.homeAdvantage));
  assert.equal(model.training.effectiveNeutralMatches, 0);
  const allNeutral = artifact(rows.map((row) => ({ ...row, neutralVenue: true })));
  assert.equal(allNeutral.training.effectiveNeutralMatches, allNeutral.training.effectiveMatches);
  assert.equal(allNeutral.homeAdvantage, 0);
});

test("the fitted correction changes only low scores while exact launch marginals agree with joint score mass", () => {
  const model = artifact(intelligenceHistory().map((row, index) =>
    ({ ...row, homeGoals: index % 3 === 0 ? 1 : 0, awayGoals: index % 3 === 0 ? 1 : 0 })));
  const corrected = score(model), independent = score(model, {}, { lowScoreCorrection: false });
  assert.ok(corrected.rho < 0);
  assert.equal(independent.rho, 0);
  assert.deepEqual(corrected.expectedGoals, independent.expectedGoals);
  const state = (estimate, home, away) => estimate.distribution.states.find((value) => value.home === home && value.away === away).probability;
  assert.ok(state(corrected, 0, 0) > state(independent, 0, 0));
  assert.ok(state(corrected, 1, 0) < state(independent, 1, 0));
  assert.equal(state(corrected, 2, 0), state(independent, 2, 0));
  const probabilities = corrected.probabilities;
  assert.deepEqual(checkMarketConsistency(probabilities["match-result"], probabilities["total-goals"], probabilities["both-teams-to-score"]), []);
  for (const [definition, values] of [
    [goalResultMarket(), { home: probabilities["match-result"]["home-win"], draw: probabilities["match-result"].draw,
      away: probabilities["match-result"]["away-win"] }],
    [goalTotalsMarket(2.5), { over: probabilities["total-goals"]["over-2.5"], under: probabilities["total-goals"]["under-2.5"] }],
    [goalBothTeamsScoreMarket(), probabilities["both-teams-to-score"]],
  ]) {
    const derived = deriveBoundedGoalMarket(corrected.distribution, definition);
    assert.equal(derived.available, true);
    for (const { key, outcomes } of derived.selections) {
      assert.ok(outcomes.win <= values[key] + 1e-12);
      assert.ok(values[key] <= outcomes.win + derived.unrepresentedProbability + 1e-12);
    }
  }
});

test("the supported high-rate grid retains explicit sub-millionth tail and all Asian outcomes separately", () => {
  const model = artifact(intelligenceHistory().map((row, index) => ({
    ...row, homeGoals: index < 8 ? 5 : 6, awayGoals: index < 8 ? 5 : 6,
  })));
  const { expectedGoals, distribution } = score(model);
  assert.ok(expectedGoals.home > 5.9 && expectedGoals.away > 5.9);
  assert.ok(distribution.states.length <= 484);
  assert.ok(distribution.unrepresentedProbability > 0 && distribution.unrepresentedProbability < FITTED_GOALS_TAIL_BOUND);
  assert.deepEqual(deriveGoalMarket(distribution, goalResultMarket()), { available: false, reason: "unrepresented-score-mass" });
  const asian = deriveBoundedGoalMarket(distribution, goalAsianHandicapMarket(.25));
  assert.equal(asian.available, true);
  assert.ok(asian.selections[0].outcomes["half-win"] > 0);
  assert.ok(asian.selections[1].outcomes["half-loss"] > 0);
  for (const selection of asian.selections)
    close(Object.values(selection.outcomes).reduce((sum, value) => sum + value, 0) + asian.unrepresentedProbability, 1);
  for (const definition of [goalExactScoreMarket([{ home: 0, away: 0 }], "full-time", true), goalTotalsMarket(4.5, "home")])
    assert.equal(deriveBoundedGoalMarket(distribution, definition).available, true);
  assert.deepEqual(deriveBoundedGoalMarket(distribution, goalHalfFullMarket()), { available: false, reason: "missing-half-time-distribution" });
  const oversizedTail = { ...distribution, unrepresentedProbability: 2e-6, states: distribution.states.map((state) => ({
    ...state, probability: state.probability * (1 - 2e-6) / (1 - distribution.unrepresentedProbability),
  })) };
  assert.deepEqual(deriveBoundedGoalMarket(oversizedTail, goalResultMarket()), { available: false, reason: "unrepresented-score-mass" });
});

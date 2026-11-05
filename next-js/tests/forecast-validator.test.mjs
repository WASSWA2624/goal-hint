import assert from "node:assert/strict";
import test from "node:test";
import { estimateLocalGoals } from "../src/server/intelligence/local-goals-model.ts";
import { learnEnsembleArtifact, validateIntelligenceForecast } from "../src/server/intelligence/forecast-validator.ts";
import { intelligenceFixture, intelligenceHistory, INTELLIGENCE_NOW, INTELLIGENCE_DAY } from "./helpers/intelligence-fixtures.mjs";

const fixture = intelligenceFixture(), local = estimateLocalGoals({ fixture, history: intelligenceHistory() });
const provider = (overrides = {}) => ({ source: "api-football", modelVersion: "synthetic-provider-v1", fixtureId: fixture.fixtureId,
  observedAt: fixture.forecastAt - 1000, evidenceRef: "synthetic-provider-archive", probabilities: {
    "match-result": local.probabilities["match-result"], "total-goals": local.probabilities["total-goals"],
    "both-teams-to-score": local.probabilities["both-teams-to-score"] }, ...overrides });
const run = (overrides = {}) => validateIntelligenceForecast({ fixture, local, provider: provider(), verifyProvider: () => true, ...overrides });

test("agreement remains provisional and never becomes calibration or publication authority", () => {
  const result = run();
  assert.equal(result.decision, "eligible-shadow");
  assert.equal(result.publish, false); assert.equal(result.calibratedProbability, null);
  assert.equal(result.components.local.source, "local"); assert.equal(result.components.provider.source, "api-football");
  assert.ok(result.reasons.includes("prospective-qualification-required"));
  assert.equal(run({ provider: null }).components.provider, null);
  const absentProbabilities = run({ provider: provider({ probabilities: {} }) });
  assert.equal(absentProbabilities.evidenceReliability, "limited");
  assert.deepEqual(absentProbabilities.components.provider.probabilities, {});
});

test("material disagreement, unverified observations and stale forecasts withhold", () => {
  const disagreement = provider({ probabilities: { "match-result": { "home-win": 0.01, draw: 0.01, "away-win": 0.98 } } });
  assert.equal(run({ provider: disagreement }).decision, "withhold");
  assert.equal(run({ verifyProvider: () => false }).decision, "withhold");
  assert.equal(run({ provider: provider({ observedAt: fixture.forecastAt + 1 }) }).decision, "withhold");
  assert.equal(run({ provider: provider({ observedAt: fixture.forecastAt - INTELLIGENCE_DAY }) }).decision, "withhold");
  assert.equal(run({ fixtureStatus: "postponed" }).decision, "withhold");
  assert.equal(run({ local: { ...local, expectedGoals: { home: 5, away: 1 } } }).decision, "withhold");
  assert.equal(run({ fixture: { ...fixture, homeTeamId: fixture.awayTeamId, awayTeamId: fixture.homeTeamId } }).decision, "withhold");
  assert.equal(run({ fixture: { ...fixture, competitionId: "foreign-league" } }).decision, "withhold");
  const rehydrated = JSON.parse(JSON.stringify(local));
  assert.equal(run({ local: rehydrated }).decision, "withhold");
  assert.equal(run({ local: rehydrated, verifyLocal: () => true }).decision, "eligible-shadow");
});

test("AI facts have provenance and contextual vetoes but no numeric contribution", () => {
  const context = { source: "ai-context", modelVersion: "synthetic-facts-v1", assessedAt: fixture.forecastAt - 100,
    fixtureId: fixture.fixtureId, evidenceHash: "a".repeat(64),
    facts: [{ id: "absence", status: "verified", observedAt: fixture.forecastAt - 200,
      availableAt: fixture.forecastAt - 200, evidenceRef: "synthetic-injury-proof", sourceIds: ["b".repeat(64)], claimIds: ["c".repeat(64)],
      impact: "critical", explanation: "Synthetic confirmed absence." }] };
  assert.equal(run({ context, verifyContext: () => true }).decision, "withhold");
  const rumour = { ...context, facts: [{ ...context.facts[0], status: "rumour", evidenceRef: null }] };
  const result = run({ context: rumour, verifyContext: () => true });
  assert.equal(result.decision, "eligible-shadow"); assert.deepEqual(result.probabilities, local.probabilities);
  assert.ok(result.reasons.includes("unverified-context:absence"));
  assert.equal(run({ context: { ...context, facts: [{ ...context.facts[0], availableAt: fixture.forecastAt + 1 }] }, verifyContext: () => true }).decision, "withhold");
  assert.equal(run({ context: { ...context, source: "unsupported" }, verifyContext: () => true }).decision, "withhold");
  assert.equal(run({ context: { ...context, facts: [{ ...context.facts[0], status: "invented" }] }, verifyContext: () => true }).decision, "withhold");
  assert.equal(run({ context: { ...context, facts: [{ ...context.facts[0], evidenceRef: null }] }, verifyContext: () => true }).decision, "withhold");
  assert.equal(run({ context: { ...rumour, fixtureId: "different-fixture" }, verifyContext: () => true }).decision, "withhold");
  assert.equal(run({ context: { ...rumour, evidenceHash: "unbound" }, verifyContext: () => true }).decision, "withhold");
  assert.equal(run({ context: { ...rumour, facts: [{ ...rumour.facts[0], claimIds: ["invented"] }] }, verifyContext: () => true }).decision, "withhold");
});

test("odds value is separate from evidence reliability and probability", () => {
  const result = run({ quote: { family: "total-goals", selection: "over-2.5", decimalOdds: 2.1, observedAt: fixture.forecastAt - 1000 } });
  assert.equal(result.oddsValue.impliedProbability, 1 / 2.1);
  assert.equal(result.oddsValue.expectedUnitReturn, result.probabilities["total-goals"]["over-2.5"] * 2.1 - 1);
  assert.equal(result.calibratedProbability, null);
});

function oosRows(count = 150) {
  return Array.from({ length: count }, (_, i) => ({ fixtureId: `synthetic-oos-${i}`, competitionId: "synthetic-league",
    family: "match-result", kickoffAt: INTELLIGENCE_NOW - (count - i) * INTELLIGENCE_DAY,
    forecastAt: INTELLIGENCE_NOW - (count - i) * INTELLIGENCE_DAY - 3_600_000,
    trainingEndsAt: INTELLIGENCE_NOW - (count - i + 1) * INTELLIGENCE_DAY,
    resultAvailableAt: INTELLIGENCE_NOW - (count - i) * INTELLIGENCE_DAY + 2 * 3_600_000,
    evidenceRef: `synthetic-oos-proof-${i}`, localModelVersion: local.modelVersion, providerModelVersion: "synthetic-provider-v1",
    local: { "home-win": 0.7, draw: 0.2, "away-win": 0.1 }, provider: { "home-win": 0.2, draw: 0.3, "away-win": 0.5 },
    outcome: i % 5 === 0 ? "away-win" : "home-win" }));
}
const learn = (rows, overrides = {}) => learnEnsembleArtifact({ rows, learnedAt: INTELLIGENCE_NOW,
  competitionId: "synthetic-league", localModelVersion: local.modelVersion, providerModelVersion: "synthetic-provider-v1", verifyRow: () => true, ...overrides });

test("ensemble learns from prior OOS outcomes, shrinks sparse leagues and separates holdout", () => {
  const result = learn(oosRows()), match = result.families["match-result"];
  assert.equal(match.status, "estimated"); assert.ok(match.localWeight > 0.5);
  assert.ok(match.trainingSamples > 0 && match.calibrationSamples > 0 && match.holdoutSamples > 0);
  assert.equal(result.families["total-goals"].status, "insufficient");
  const low = learn(oosRows(10)).families["match-result"];
  assert.equal(low.localWeight, 0.5); assert.equal(low.status, "insufficient");
  const future = { ...oosRows(1)[0], fixtureId: "future-result", resultAvailableAt: INTELLIGENCE_NOW + 1 };
  assert.deepEqual(result, learn([...oosRows(), future]));
  const mutatedHoldout = oosRows().map((row, i) => i >= 120 ? { ...row, outcome: "draw" } : row);
  assert.equal(learn(mutatedHoldout).families["match-result"].localWeight, match.localWeight);
  assert.equal(learn(mutatedHoldout).families["match-result"].temperature, match.temperature);
});

test("ensemble rejects unverified, in-sample, duplicate and post-lock archives", () => {
  const rows = oosRows();
  assert.throws(() => learn(rows, { verifyRow: () => false }), /Unverified/);
  assert.throws(() => learn([...rows, rows[0]]), /Unverified/);
  assert.throws(() => learn([{ ...rows[0], trainingEndsAt: rows[0].forecastAt + 1 }]), /leaking/);
  assert.equal(learn([{ ...rows[0], trainingEndsAt: rows[0].forecastAt }]).families["match-result"].samples, 1);
  assert.throws(() => learn([{ ...rows[0], forecastAt: rows[0].kickoffAt }]), /leaking/);
  const conflictingFamily = { ...rows[0], family: "total-goals", forecastAt: rows[0].forecastAt - 1,
    local: { "over-2.5": 0.5, "under-2.5": 0.5 }, provider: { "over-2.5": 0.5, "under-2.5": 0.5 }, outcome: "over-2.5" };
  assert.throws(() => learn([...rows, conflictingFamily]), /Conflicting/);
  assert.equal(learn(rows.map((row) => ({ ...row, cohort: "women" })), { cohort: "men" }).families["match-result"].samples, 0);
});

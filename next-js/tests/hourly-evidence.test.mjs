import assert from "node:assert/strict";
import test from "node:test";
import { estimateLocalGoals } from "../src/server/intelligence/local-goals-model.ts";
import { createHourlyEvidenceReader, summarizeHourlyLocalEvidence } from "../src/server/selection/hourly-evidence.ts";
import { intelligenceFixture, intelligenceHistory, INTELLIGENCE_DAY, INTELLIGENCE_NOW } from "./helpers/intelligence-fixtures.mjs";

const fixture = { ...intelligenceFixture(), id: "synthetic-target" };
const history = (count) => intelligenceHistory(count).map((row) => ({ ...row, halfTime: null }));

test("hourly evidence follows the local model’s league and team sufficiency rules", () => {
  const rows = history();
  const sparse = history(30);
  const changedSparse = sparse.map((row) => ({ ...row, homeGoals: row.homeGoals + 1 }));
  const unfamiliar = { ...fixture, homeTeamId: "new-team" };
  const sample = (results, target = fixture) => summarizeHourlyLocalEvidence(results, INTELLIGENCE_NOW)(target);
  assert.equal(estimateLocalGoals({ fixture, history: sparse }).status, "withheld");
  assert.equal(sample(sparse).evidenceReady, false);
  assert.equal(sample(sparse).fingerprint, sample(changedSparse).fingerprint);
  assert.equal(estimateLocalGoals({ fixture, history: rows }).status, "estimated");
  assert.equal(sample(rows).evidenceReady, true);
  assert.notEqual(sample(rows).fingerprint, sample(sparse).fingerprint);
  assert.equal(estimateLocalGoals({ fixture: unfamiliar, history: rows }).status, "withheld");
  assert.equal(sample(rows, unfamiliar).evidenceReady, false);
});

test("the evidence fingerprint follows material scores and survives equivalent observations and hour changes", () => {
  const rows = history();
  const current = summarizeHourlyLocalEvidence(rows, INTELLIGENCE_NOW)(fixture);
  const reobserved = rows.map((row) => ({ ...row, availableAt: row.availableAt + 60_000,
    observationHash: "replacement", evidenceRef: "replacement" })).reverse();
  assert.deepEqual(summarizeHourlyLocalEvidence(reobserved, INTELLIGENCE_NOW + 3_600_000)(fixture), current);
  const corrected = [{ ...rows[0], homeGoals: rows[0].homeGoals + 1 }, ...rows.slice(1)];
  assert.notEqual(summarizeHourlyLocalEvidence(corrected, INTELLIGENCE_NOW)(fixture).fingerprint, current.fingerprint);
  const limitedHalfTime = [{ ...rows[0], halfTime: { home: 1, away: 0 } }, ...rows.slice(1)];
  assert.deepEqual(summarizeHourlyLocalEvidence(limitedHalfTime, INTELLIGENCE_NOW)(fixture), current);
  const supportedHalfTime = rows.map((row) => ({ ...row, halfTime: { home: 1, away: 0 } }));
  assert.notEqual(summarizeHourlyLocalEvidence(supportedHalfTime, INTELLIGENCE_NOW)(fixture).fingerprint, current.fingerprint);
});

test("the hourly reader memoizes in-flight league queries and skips cutoff fixtures", async () => {
  const competitions = [];
  const tx = { async $queryRaw(_sql, id) { competitions.push(id); return []; } };
  const read = createHourlyEvidenceReader(tx, INTELLIGENCE_NOW);
  await Promise.all([read(fixture), read({ ...fixture, id: "another-fixture" })]);
  await read({ ...fixture, competitionId: "different-league" });
  await read({ ...fixture, competitionId: "closed-league", kickoffAt: INTELLIGENCE_NOW + 300_000 });
  assert.deepEqual(competitions, [fixture.competitionId, "different-league"]);
  await createHourlyEvidenceReader(tx, INTELLIGENCE_NOW + INTELLIGENCE_DAY)({
    ...fixture, kickoffAt: fixture.kickoffAt + INTELLIGENCE_DAY,
  });
  assert.deepEqual(competitions, [fixture.competitionId, "different-league", fixture.competitionId]);
});

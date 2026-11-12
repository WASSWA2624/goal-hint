import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFixture } from "../src/server/football/api-football-normalize.ts";
import { isReviewedHistoryFixtureScore, projectReviewedHistoryFixture, reviewedHistoryFixtureCorrection } from "../src/server/football/history-fixture-correction.ts";

const correction = reviewedHistoryFixtureCorrection;
const disputed = {
  fixture: { id: correction.fixtureId, date: "2025-07-06T15:00:00+03:00", timezone: "Africa/Kampala",
    timestamp: correction.kickoff / 1000, status: { short: "FT", elapsed: 90 } },
  league: { id: correction.competitionId, season: correction.season, round: "Club Friendlies 3" },
  teams: { home: { id: correction.homeTeamId, name: "SSV Jahn Regensburg" }, away: { id: correction.awayTeamId, name: "Bayreuth" } },
  goals: { home: 7, away: 0 },
  score: { halftime: { home: 3, away: 0 }, fulltime: { home: 3, away: 0 }, extratime: null, penalty: null },
};

test("the reviewed archive projection corrects the verified final score while retaining the raw observation", () => {
  const context = { endpoint: "/fixtures", retrievedAt: Date.parse("2026-11-12T18:46:52.114Z"), verifyRegulationScore: () => true };
  assert.equal(normalizeFixture(disputed, context).valid, false);
  const corrected = projectReviewedHistoryFixture(disputed, correction.pageId);
  assert.deepEqual(corrected, { ...disputed, score: { ...disputed.score, fulltime: { home: 7, away: 0 } } });
  assert.deepEqual(disputed.score.fulltime, { home: 3, away: 0 });
  const normalized = normalizeFixture(corrected, context);
  assert.ok(normalized.valid && normalized.data.regulationScore.verified);
  assert.equal(isReviewedHistoryFixtureScore(normalized.data.regulationScore), true);
  assert.equal(isReviewedHistoryFixtureScore({ ...normalized.data.regulationScore, home: 3 }), false);
});

test("the reviewed correction refuses another archive, fixture, opponent, and source score", () => {
  assert.equal(projectReviewedHistoryFixture(disputed, "a".repeat(64)), null);
  assert.equal(projectReviewedHistoryFixture({ ...disputed, fixture: { ...disputed.fixture, id: 7 } }, correction.pageId), null);
  assert.equal(projectReviewedHistoryFixture({ ...disputed, teams: { ...disputed.teams, away: { id: 7 } } }, correction.pageId), null);
  assert.equal(projectReviewedHistoryFixture({ ...disputed, goals: { home: 8, away: 0 } }, correction.pageId), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { normalizeFixture } from "../src/server/football/api-football-normalize.ts";
import { createReviewedHistoryFixtureRepair, isReviewedHistoryFixtureScore, projectReviewedHistoryFixture, reviewedFixtureMatches,
  reviewedFixtureOmissions, reviewedFixtureReplayMarkerMatches, reviewedHistoryFixtureCorrection } from "../src/server/football/history-fixture-correction.ts";

const correction = reviewedHistoryFixtureCorrection;
const disputed = {
  fixture: { id: correction.fixtureId, date: "2025-07-06T15:00:00+03:00", timezone: "Africa/Kampala",
    timestamp: correction.kickoff / 1000, status: { short: "FT", elapsed: 90 } },
  league: { id: correction.competitionId, season: correction.season, round: "Club Friendlies 3" },
  teams: { home: { id: correction.homeTeamId, name: "SSV Jahn Regensburg" }, away: { id: correction.awayTeamId, name: "Bayreuth" } },
  goals: { home: 7, away: 0 },
  score: { halftime: { home: 3, away: 0 }, fulltime: { home: 3, away: 0 }, extratime: null, penalty: null },
};
const context = { endpoint: "/fixtures", retrievedAt: Date.parse("2026-11-12T18:46:52.114Z"), verifyRegulationScore: () => true };
const score = { home: 7, away: 0 };
const expected = { homeTeamId: correction.homeTeamId, awayTeamId: correction.awayTeamId,
  kickoff: correction.kickoff, providerStatus: "FT", score };
const evidenceRef = "https://league.example/match-report";
const reviewedScope = { receiptId: "9c207ae4-72c5-8f36-9d59-f9e1dbc1a906", pageId: "a".repeat(64),
  competitionId: correction.competitionId, season: correction.season, expectedRows: 1, expectedVerifiedResults: 1,
  reasons: correction.reasons };

test("the reviewed archive projection corrects the verified final score while retaining the raw observation", () => {
  assert.equal(normalizeFixture(disputed, context).valid, false);
  const corrected = projectReviewedHistoryFixture(disputed, correction.pageId);
  assert.deepEqual(corrected, { ...disputed, score: { ...disputed.score, fulltime: { home: 7, away: 0 } } });
  assert.deepEqual(disputed.score.fulltime, { home: 3, away: 0 });
  const normalized = normalizeFixture(corrected, context);
  assert.ok(normalized.valid && normalized.data.regulationScore.verified);
  assert.equal(isReviewedHistoryFixtureScore(normalized.data.regulationScore), true);
  assert.equal(isReviewedHistoryFixtureScore({ ...normalized.data.regulationScore, home: 3 }), false);
});

test("a reviewed repair requires the original fixture digest and matches only its declared normalized identity", () => {
  const entry = { fixtureId: disputed.fixture.id, rawFingerprint: evidenceFingerprint(disputed), expected,
    patch: { score: { fulltime: score } }, evidenceRef };
  const repair = createReviewedHistoryFixtureRepair({ ...reviewedScope, corrections: [entry] });
  const projected = repair.project(disputed);
  assert.ok(projected);
  const result = normalizeFixture(projected.row, context);
  assert.ok(result.valid && reviewedFixtureMatches(repair, entry, result.data));
  assert.equal(reviewedFixtureMatches(repair, entry, { ...result.data, kickoff: result.data.kickoff + 1 }), false);
  assert.equal(reviewedFixtureMatches(repair, entry, { ...result.data, providerStatus: "AET" }), false);
  assert.equal(repair.project({ ...disputed, fixture: { ...disputed.fixture, id: 1 } }), null);
  assert.equal(repair.project({ ...disputed, league: { ...disputed.league, name: "Changed archived bytes" } }), null);
});

test("a duplicate omission needs the exact rejected row and verified replacement in the same raw page", () => {
  const canonical = { ...disputed, fixture: { ...disputed.fixture, id: 23 }, score: { ...disputed.score, fulltime: score } };
  const duplicate = { fixtureId: disputed.fixture.id, rawFingerprint: evidenceFingerprint(disputed), canonicalFixtureId: canonical.fixture.id,
    canonicalRawFingerprint: evidenceFingerprint(canonical), expected, evidenceRef };
  const repair = createReviewedHistoryFixtureRepair({ ...reviewedScope, expectedRows: 2, corrections: [], duplicates: [duplicate] });
  const normalize = (row) => normalizeFixture(row, context);
  const omissions = reviewedFixtureOmissions(repair, [disputed, canonical], normalize);
  assert.deepEqual([...omissions], [[disputed, disputed.fixture.id]]);
  assert.equal(reviewedFixtureOmissions(repair, [disputed], normalize), null);
  assert.equal(reviewedFixtureOmissions(repair, [disputed, { ...canonical, venue: "Different raw bytes" }], normalize), null);
  assert.equal(reviewedFixtureOmissions(repair, [{ ...disputed, extra: true }, canonical], normalize), null);
  assert.equal(omissions.has(canonical), false);
});

test("a reviewed replay marker must match the manifest digest and all archived row counts", () => {
  const entry = { fixtureId: disputed.fixture.id, rawFingerprint: evidenceFingerprint(disputed), expected,
    patch: { score: { fulltime: score } }, evidenceRef };
  const repair = createReviewedHistoryFixtureRepair({ ...reviewedScope, corrections: [entry] });
  const otherEvidence = createReviewedHistoryFixtureRepair({ ...reviewedScope, corrections: [{ ...entry, evidenceRef: "other-source" }] });
  const marker = { subsetEvidenceRef: repair.reference, receivedCount: 1, importedCount: 1, rejectedCount: 0 };
  assert.equal(reviewedFixtureReplayMarkerMatches(repair, marker), true);
  assert.equal(reviewedFixtureReplayMarkerMatches(otherEvidence, marker), false);
  assert.equal(reviewedFixtureReplayMarkerMatches(repair, { ...marker, receivedCount: 2 }), false);
  assert.equal(reviewedFixtureReplayMarkerMatches(repair, { ...marker, importedCount: 0 }), false);
  assert.equal(reviewedFixtureReplayMarkerMatches(repair, { ...marker, rejectedCount: 1 }), false);
});

test("the reviewed correction refuses another archive, fixture, opponent, and source score", () => {
  assert.equal(projectReviewedHistoryFixture(disputed, "a".repeat(64)), null);
  assert.equal(projectReviewedHistoryFixture({ ...disputed, fixture: { ...disputed.fixture, id: 7 } }, correction.pageId), null);
  assert.equal(projectReviewedHistoryFixture({ ...disputed, teams: { ...disputed.teams, away: { id: 7 } } }, correction.pageId), null);
  assert.equal(projectReviewedHistoryFixture({ ...disputed, goals: { home: 8, away: 0 } }, correction.pageId), null);
});

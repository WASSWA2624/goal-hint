import "server-only";

import { z } from "zod";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { NormalizedFixture, RegulationScoreCandidate } from "./api-football-normalize.ts";
import { reviewedHistoryFixtureRepairRecords } from "./history-fixture-correction-records.ts";

type Score = Readonly<{ home: number; away: number }>;
type ScorePatch = Readonly<{ home: number | null; away: number | null }>;
type FixturePatch = Readonly<{
  fixture?: Readonly<{ date?: string; timestamp?: number; timezone?: string;
    status?: Readonly<{ short?: string; elapsed?: number | null; extra?: number | null }> }>;
  teams?: Readonly<{ home?: Readonly<Record<string, unknown>>; away?: Readonly<Record<string, unknown>> }>;
  goals?: ScorePatch;
  score?: Readonly<{ fulltime?: ScorePatch | null; halftime?: ScorePatch | null;
    extratime?: ScorePatch | null; penalty?: ScorePatch | null }>;
}>;
type ReviewedFixture = Readonly<{
  fixtureId: number;
  expected: Readonly<{ homeTeamId: number; awayTeamId: number; kickoff: number | null; providerStatus: string | null; score: Score | null }>;
  evidenceRef: string;
  existingEvidenceRef?: string;
}>;
type ReviewedFixtureRecord = ReviewedFixture & Readonly<{ rawFingerprint: string; patch: FixturePatch }>;
type ReviewedFixtureDuplicate = Readonly<{ fixtureId: number; rawFingerprint: string;
  canonicalFixtureId: number; canonicalRawFingerprint: string; expected: ReviewedFixture["expected"] & Readonly<{ score: Score }>;
  evidenceRef: string }>;
type ReviewedFixtureScope = Readonly<{
  receiptId: string; pageId: string; competitionId: number; season: number; round?: string;
  expectedRows: number; expectedVerifiedResults: number; reasons: readonly string[];
}>;
export type ReviewedHistoryFixtureRepairRecord = ReviewedFixtureScope & Readonly<{
  corrections: readonly ReviewedFixtureRecord[]; duplicates?: readonly ReviewedFixtureDuplicate[];
}>;
type ReviewedHistoryFixtureRepair = ReviewedFixtureScope & Readonly<{
  corrections: readonly ReviewedFixture[];
  duplicates: readonly ReviewedFixtureDuplicate[];
  reference: string;
  project(raw: unknown): Readonly<{ row: unknown; correction: ReviewedFixture }> | null;
}>;

const regensburgReport = "https://www.ssv-jahn.de/aktuelles/detail/weiterer-torreicher-testspielsieg";
const bayreuthSchedule = "https://www.spvgg-bayreuth.de/1-mannschaft/spielplan-2025-26-archiv/";

/** Both clubs record a 7–0 final. Regensburg explicitly records a 3–0 halftime. */
export const reviewedHistoryFixtureCorrection = Object.freeze({
  receiptId: "762e74a0-a234-8c57-9e95-839f260d4f00",
  pageId: "0e86a23f408732d16f6ae598fcde8e602f917962a0b68281714d943ec9e36363",
  competitionId: 667,
  season: 2025,
  fixtureId: 1377649,
  homeTeamId: 177,
  awayTeamId: 9325,
  kickoff: 1751803200000,
  home: 7,
  away: 0,
  expectedVerifiedResults: 4915,
  evidenceRef: `reviewed-score:api-football:1377649:${regensburgReport}|${bayreuthSchedule}`,
  reasons: Object.freeze(["invalid-rows", "retrieval-incomplete", "schema-error"]),
});
const correction = reviewedHistoryFixtureCorrection;
export const reviewedHistoryFixtureReplayReference = `history-source:${correction.pageId}:import:${correction.receiptId}:review:${correction.evidenceRef}`;

const inconsistentScore = z.object({ home: z.literal(3), away: z.literal(0) });
const correctedScore = z.object({ home: z.literal(correction.home), away: z.literal(correction.away) });
const recordedFixture = z.looseObject({
  fixture: z.object({ id: z.literal(correction.fixtureId), date: z.literal("2025-07-06T15:00:00+03:00"),
    timezone: z.literal("Africa/Kampala"), timestamp: z.literal(correction.kickoff / 1000),
    status: z.object({ short: z.literal("FT"), elapsed: z.literal(90) }) }),
  league: z.object({ id: z.literal(correction.competitionId), season: z.literal(correction.season), round: z.literal("Club Friendlies 3") }),
  teams: z.object({ home: z.object({ id: z.literal(correction.homeTeamId) }), away: z.object({ id: z.literal(correction.awayTeamId) }) }),
  goals: correctedScore,
  score: z.looseObject({ halftime: inconsistentScore, fulltime: inconsistentScore }),
});

export function projectReviewedHistoryFixture(raw: unknown, pageId: string) {
  if (pageId !== correction.pageId || !recordedFixture.safeParse(raw).success) return null;
  const fixture = raw as z.infer<typeof recordedFixture>;
  return { ...fixture, score: { ...fixture.score, fulltime: { home: correction.home, away: correction.away } } };
}

export function isReviewedHistoryFixtureScore(candidate: RegulationScoreCandidate) {
  return candidate.fixtureId === correction.fixtureId && candidate.providerStatus === "FT" &&
    candidate.sourceField === "score.fulltime" && candidate.period === "regulation-including-stoppage-time" &&
    candidate.home === correction.home && candidate.away === correction.away;
}

const originalReview: ReviewedFixture = {
  fixtureId: correction.fixtureId, evidenceRef: correction.evidenceRef,
  expected: { homeTeamId: correction.homeTeamId, awayTeamId: correction.awayTeamId, kickoff: correction.kickoff,
    providerStatus: "FT", score: { home: correction.home, away: correction.away } },
};
const identifiedRow = z.looseObject({ fixture: z.looseObject({ id: z.number().int().positive() }) });

function fields(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function applyFixturePatch(raw: z.infer<typeof identifiedRow>, patch: FixturePatch) {
  const teams = fields(raw.teams);
  return { ...raw,
    ...(patch.fixture && { fixture: { ...raw.fixture, ...patch.fixture,
      ...(patch.fixture.status && { status: { ...fields(raw.fixture.status), ...patch.fixture.status } }) } }),
    ...(patch.teams && { teams: { ...teams,
      ...(patch.teams.home && { home: { ...fields(teams.home), ...patch.teams.home } }),
      ...(patch.teams.away && { away: { ...fields(teams.away), ...patch.teams.away } }) } }),
    ...(patch.goals && { goals: patch.goals }),
    ...(patch.score && { score: { ...fields(raw.score), ...patch.score } }),
  };
}

function reviewedRepair(record: ReviewedHistoryFixtureRepairRecord): ReviewedHistoryFixtureRepair {
  return { ...record, duplicates: record.duplicates ?? [],
    reference: `history-source:${record.pageId}:import:${record.receiptId}:review:v2:${evidenceFingerprint(record)}`,
    project(raw) {
      const parsed = identifiedRow.safeParse(raw);
      if (!parsed.success) return null;
      const match = record.corrections.find((entry) => entry.fixtureId === parsed.data.fixture.id);
      if (!match || evidenceFingerprint(raw) !== match.rawFingerprint) return null;
      return { row: applyFixturePatch(parsed.data, match.patch), correction: match };
    } };
}

const originalRepair: ReviewedHistoryFixtureRepair = {
  receiptId: correction.receiptId, pageId: correction.pageId, competitionId: correction.competitionId, season: correction.season,
  expectedRows: 5360, expectedVerifiedResults: correction.expectedVerifiedResults, reasons: correction.reasons,
  corrections: [originalReview], duplicates: [], reference: reviewedHistoryFixtureReplayReference,
  project(raw) {
    const row = projectReviewedHistoryFixture(raw, correction.pageId);
    return row === null ? null : { row, correction: originalReview };
  },
};

export const reviewedHistoryFixtureRepairs: readonly ReviewedHistoryFixtureRepair[] = Object.freeze([
  originalRepair, ...reviewedHistoryFixtureRepairRecords.map(reviewedRepair),
]);

export function reviewedHistoryFixtureRepair(receiptId: string) {
  return reviewedHistoryFixtureRepairs.find((repair) => repair.receiptId === receiptId);
}

export function reviewedFixtureRejectionCount(repair: ReviewedHistoryFixtureRepair) {
  return repair.corrections.length + repair.duplicates.length;
}

export function rawReviewedFixtureId(raw: unknown) {
  const parsed = identifiedRow.safeParse(raw);
  return parsed.success ? parsed.data.fixture.id : null;
}

export function reviewedDuplicateReplacement(duplicate: ReviewedFixtureDuplicate): ReviewedFixture {
  return { fixtureId: duplicate.canonicalFixtureId, expected: duplicate.expected, evidenceRef: duplicate.evidenceRef };
}

export function reviewedFixtureScoreMatches(entry: ReviewedFixture, candidate: RegulationScoreCandidate) {
  const { score, providerStatus } = entry.expected;
  return score !== null && candidate.fixtureId === entry.fixtureId && candidate.providerStatus === providerStatus &&
    candidate.sourceField === "score.fulltime" && candidate.period === "regulation-including-stoppage-time" &&
    candidate.home === score.home && candidate.away === score.away;
}

export function reviewedFixtureMatches(repair: ReviewedHistoryFixtureRepair, entry: ReviewedFixture, fixture: NormalizedFixture) {
  const { expected } = entry;
  return fixture.id === entry.fixtureId && fixture.competition.id === repair.competitionId && fixture.competition.season === repair.season &&
    (repair.round === undefined || fixture.competition.round === repair.round) && fixture.homeTeam.id === expected.homeTeamId &&
    fixture.awayTeam.id === expected.awayTeamId && fixture.kickoff === expected.kickoff && fixture.providerStatus === expected.providerStatus &&
    (expected.score === null ? fixture.regulationScore === null : fixture.regulationScore?.verified === true &&
      reviewedFixtureScoreMatches(entry, fixture.regulationScore));
}

export function reviewedFixtureReplayMarkerMatches(repair: ReviewedHistoryFixtureRepair, marker: Readonly<{
  subsetEvidenceRef: string | null; receivedCount: number; importedCount: number; rejectedCount: number;
}>) {
  return marker.subsetEvidenceRef === repair.reference && marker.receivedCount === repair.expectedRows &&
    marker.importedCount === repair.expectedVerifiedResults && marker.rejectedCount === 0;
}

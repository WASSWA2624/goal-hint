import "server-only";

import { calendarRules } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { localGoalFirstHalfShare, readLiveLocalGoalHistory, type LocalGoalHistoryReader } from "../intelligence/live-local-history.ts";
import { hasLocalGoalSamples, localGoalModelVersion, weightLocalGoalHistory } from "../intelligence/local-goals-model.ts";

type HourlyEvidenceFixture = Readonly<{ id: string; competitionId: string; homeTeamId: string; awayTeamId: string; kickoffAt: number }>;
type LocalHistory = Awaited<ReturnType<typeof readLiveLocalGoalHistory>>;

const modelVersion = localGoalModelVersion();
const insufficient = Object.freeze({ evidenceReady: false, fingerprint: evidenceFingerprint({ modelVersion, evidenceReady: false }) });

/** Evidence that would change the local model, independently of archive and fetch metadata. */
export function summarizeHourlyLocalEvidence(rows: LocalHistory, forecastAt: number) {
  const { ordered, effectiveMatches, teamEffectiveMatches } = weightLocalGoalHistory(rows, forecastAt);
  const fingerprint = evidenceFingerprint({
    modelVersion, evidenceReady: true,
    regulation: ordered.map(({ fixtureId, kickoffAt, homeTeamId, awayTeamId, homeGoals, awayGoals }) =>
      [fixtureId, kickoffAt, homeTeamId, awayTeamId, homeGoals, awayGoals]),
    firstHalfShare: localGoalFirstHalfShare(ordered) ?? null,
  });
  return (fixture: HourlyEvidenceFixture) => hasLocalGoalSamples(effectiveMatches,
    teamEffectiveMatches.get(fixture.homeTeamId) ?? 0, teamEffectiveMatches.get(fixture.awayTeamId) ?? 0)
    ? { evidenceReady: true, fingerprint }
    : insufficient;
}

/** Use one reader per selection and fixed point in time. Fixtures in the
 * same competition share one query and one material fingerprint calculation. */
export function createHourlyEvidenceReader(tx: LocalGoalHistoryReader, forecastAt: number) {
  const competitions = new Map<string, Promise<ReturnType<typeof summarizeHourlyLocalEvidence>>>();
  return async (fixture: HourlyEvidenceFixture) => {
    if (forecastAt >= fixture.kickoffAt - calendarRules.cutoffSecondsBeforeKickoff * 1_000) return insufficient;
    let competition = competitions.get(fixture.competitionId);
    if (!competition) {
      competition = readLiveLocalGoalHistory(tx, fixture.competitionId, forecastAt)
        .then((rows) => summarizeHourlyLocalEvidence(rows, forecastAt));
      competitions.set(fixture.competitionId, competition);
    }
    return (await competition)(fixture);
  };
}

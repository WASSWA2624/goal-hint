import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { marketRules } from "../../domain/markets.ts";
import type { HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow } from "../results/result-read.ts";
import type { LocalGoalInput } from "./intelligence-contract.ts";
import { localGoalDefaults } from "./local-goals-model.ts";

export type LocalGoalHistoryReader = { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };

type LocalGoalTarget = Readonly<{ fixtureId: string; externalFixtureId: number; homeTeamId: string; awayTeamId: string; kickoffAt: number }>;
type LocalGoalHistoryRow = LocalGoalInput["history"][number] & Readonly<{ halfTime: { home: number; away: number } | null }>;

/** The hourly scan and the local forecast use the same bounded, sealed regulation result corpus. */
export async function readLiveLocalGoalHistory(tx: LocalGoalHistoryReader, competitionId: string | null, cutoffAt: number,
  target?: LocalGoalTarget): Promise<LocalGoalHistoryRow[]> {
  const cutoff = new Date(cutoffAt), targetId = target?.fixtureId ?? null;
  // Sort and cap the narrow result identities before reading and hashing their sealed bodies.
  const rows = await tx.$queryRaw<HistoryRow[]> `
    SELECT /*+ MAX_EXECUTION_TIME(2500) */ r.*, recent.competitionId, recent.homeTeamId, recent.awayTeamId, recent.kickoff,
      r.integrity = SHA2(CAST(r.body AS CHAR), 256) AS validIntegrity
    FROM (
      SELECT r.id, f.id AS fixtureId, s.competitionId, f.homeTeamId, f.awayTeamId, f.kickoff
      FROM FootballSeason s
      JOIN FootballFixture f ON f.seasonId=s.id
      JOIN FixtureResultState state ON state.fixtureId=f.id
      JOIN FixtureResult r FORCE INDEX (PRIMARY) ON r.id=state.resultId AND r.fixtureId=f.id
      LEFT JOIN FixtureLifecycleState life ON life.fixtureId=f.id
      WHERE s.competitionId=COALESCE(${competitionId}, (
          SELECT ts.competitionId FROM FootballFixture target
          JOIN FootballSeason ts ON ts.id=target.seasonId
          WHERE target.id=${targetId} AND target.provider='api-football'
            AND target.externalId=${target ? BigInt(target.externalFixtureId) : null}
            AND target.homeTeamId=${target?.homeTeamId ?? null} AND target.awayTeamId=${target?.awayTeamId ?? null}
            AND target.kickoff=${target ? new Date(target.kickoffAt) : null}
        ))
        AND f.provider='api-football' AND (${targetId} IS NULL OR f.id<>${targetId})
        AND f.kickoff>=${new Date(cutoffAt - localGoalDefaults.lookbackMs)} AND f.kickoff<${cutoff}
        AND f.retrievedAt<=${cutoff} AND r.observedAt<=${cutoff} AND r.observedAt>=f.kickoff
        AND f.status IN ('finished-regulation','finished-extra-time','finished-penalties') AND r.status=f.status
        AND r.regulationVerified=TRUE AND r.regulationHome=f.regulationHome AND r.regulationAway=f.regulationAway
        AND f.regulationVerifiedAt<=${cutoff} AND life.issue IS NULL
        AND f.regulationEvidenceRef=JSON_UNQUOTE(JSON_EXTRACT(r.body,'$.regulation.evidenceRef'))
      ORDER BY f.kickoff DESC, f.id DESC LIMIT 1500
    ) recent
    JOIN FixtureResult r ON r.id=recent.id AND r.fixtureId=recent.fixtureId`;
  if (rows.length < localGoalDefaults.minimumMatches) return [];
  return rows.map((row) => {
    const result = fixtureResultFromRow(row);
    return {
      fixtureId: result.fixtureId, competitionId: String(row.competitionId),
      homeTeamId: String(row.homeTeamId), awayTeamId: String(row.awayTeamId),
      kickoffAt: utcInstantFromEpochMilliseconds((row.kickoff as Date).getTime()), availableAt: result.observedAt,
      homeGoals: result.regulation.home!, awayGoals: result.regulation.away!, period: marketRules.period,
      observationHash: result.id, evidenceRef: result.regulation.evidenceRef!,
      halfTime: result.halfTime ? { home: result.halfTime.home, away: result.halfTime.away } : null,
    };
  });
}

/** Only a sufficiently supported first-half sample contributes to goal market estimates. */
export function localGoalFirstHalfShare(rows: readonly LocalGoalHistoryRow[]) {
  const sample = { matches: 0, home: 0, away: 0, fullHome: 0, fullAway: 0 };
  for (const row of rows) {
    if (row.halfTime === null) continue;
    sample.matches++;
    sample.home += row.halfTime.home;
    sample.away += row.halfTime.away;
    sample.fullHome += row.homeGoals;
    sample.fullAway += row.awayGoals;
  }
  return sample.matches >= localGoalDefaults.minimumMatches && sample.fullHome > 0 && sample.fullAway > 0
    ? { home: (sample.home + 0.5) / (sample.fullHome + 1), away: (sample.away + 0.5) / (sample.fullAway + 1) }
    : undefined;
}

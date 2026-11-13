import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { marketRules, validateMarketSnapshot } from "../../domain/markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { LIVE_FORECAST_CASCADE, type FallbackContext, type ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";
import { fixtureResultFromRow } from "../results/result-read.ts";
import type { HistoryRow } from "../predictions/history-read.ts";
import { estimateLocalGoals, localGoalDefaults } from "./local-goals-model.ts";

/** Read only point-in-time regulation results for the target's canonical league.
 * No fixture needs a prediction cycle to be useful as historical evidence. */
export function createLiveLocalEngine(database: DatabaseRuntime) {
  return async (expected: FallbackContext, ai: Pick<ResolvedForecastCandidate["audit"], "aiStatus" | "aiReason">, clock: () => UtcInstant,
    check: () => void): Promise<ResolvedForecastCandidate | null> => {
    const context = expected.context, cutoff = new Date(context.cutoffAt);
    check();
    // Sort and cap the narrow result identities before reading and hashing their sealed bodies.
    const rows = await database.query((tx) => tx.$queryRaw<HistoryRow[]> `
      SELECT /*+ MAX_EXECUTION_TIME(2500) */ r.*, recent.competitionId, recent.homeTeamId, recent.awayTeamId, recent.kickoff,
        r.integrity = SHA2(CAST(r.body AS CHAR), 256) AS validIntegrity
      FROM (
        SELECT r.id, f.id AS fixtureId, s.competitionId, f.homeTeamId, f.awayTeamId, f.kickoff
        FROM FootballFixture target
        JOIN FootballSeason ts ON ts.id=target.seasonId
        JOIN FootballSeason s ON s.competitionId=ts.competitionId
        JOIN FootballFixture f ON f.seasonId=s.id
        JOIN FixtureResultState state ON state.fixtureId=f.id
        JOIN FixtureResult r FORCE INDEX (PRIMARY) ON r.id=state.resultId AND r.fixtureId=f.id
        LEFT JOIN FixtureLifecycleState life ON life.fixtureId=f.id
        WHERE target.id=${context.fixtureId} AND target.provider='api-football'
          AND target.externalId=${BigInt(context.externalFixtureId)} AND target.homeTeamId=${context.home.teamId}
          AND target.awayTeamId=${context.away.teamId} AND target.kickoff=${new Date(context.kickoffAt)}
          AND f.provider='api-football' AND f.id<>target.id
          AND f.kickoff>=${new Date(context.cutoffAt - localGoalDefaults.lookbackMs)} AND f.kickoff<${cutoff}
          AND f.retrievedAt<=${cutoff} AND r.observedAt<=${cutoff} AND r.observedAt>=f.kickoff
          AND f.status IN ('finished-regulation','finished-extra-time','finished-penalties') AND r.status=f.status
          AND r.regulationVerified=TRUE AND r.regulationHome=f.regulationHome AND r.regulationAway=f.regulationAway
          AND f.regulationVerifiedAt<=${cutoff} AND life.issue IS NULL
          AND f.regulationEvidenceRef=JSON_UNQUOTE(JSON_EXTRACT(r.body,'$.regulation.evidenceRef'))
        ORDER BY f.kickoff DESC, f.id DESC LIMIT 1500
      ) recent
      JOIN FixtureResult r ON r.id=recent.id AND r.fixtureId=recent.fixtureId`);
    check();
    if (rows.length < localGoalDefaults.minimumMatches) return null;
    const halfTimeSample = { matches: 0, home: 0, away: 0, fullHome: 0, fullAway: 0 };
    const history = rows.map((row) => {
      const result = fixtureResultFromRow(row);
      if (result.halfTime?.verified) {
        halfTimeSample.matches++;
        halfTimeSample.home += result.halfTime.home;
        halfTimeSample.away += result.halfTime.away;
        halfTimeSample.fullHome += result.regulation.home!;
        halfTimeSample.fullAway += result.regulation.away!;
      }
      return {
        fixtureId: result.fixtureId, competitionId: String(row.competitionId),
        homeTeamId: String(row.homeTeamId), awayTeamId: String(row.awayTeamId),
        kickoffAt: utcInstantFromEpochMilliseconds((row.kickoff as Date).getTime()), availableAt: result.observedAt,
        homeGoals: result.regulation.home!, awayGoals: result.regulation.away!, period: marketRules.period,
        observationHash: result.id, evidenceRef: result.regulation.evidenceRef!,
      };
    });
    const forecast = estimateLocalGoals({ fixture: { fixtureId: context.fixtureId, competitionId: history[0]!.competitionId,
      homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, forecastAt: context.cutoffAt, kickoffAt: context.kickoffAt }, history });
    check();
    const at = clock();
    if (!forecast.expectedGoals || !forecast.probabilities || at < context.analysisAt) return null;
    const result = validateMarketSnapshot({
      "match-result": { source: "local-engine", period: marketRules.period, probabilities: forecast.probabilities["match-result"] },
      "total-goals": { source: "local-engine", period: marketRules.period, line: marketRules.totalGoalsLine,
        probabilities: forecast.probabilities["total-goals"] },
      "both-teams-to-score": { source: "local-engine", period: marketRules.period, probabilities: forecast.probabilities["both-teams-to-score"] },
    });
    if (!Object.values(result.markets).every((entry) => entry.available)) return null;
    const { matches, homeEffectiveMatches, awayEffectiveMatches } = forecast.diagnostics;
    const firstHalfShare = halfTimeSample.matches >= localGoalDefaults.minimumMatches && halfTimeSample.fullHome > 0 && halfTimeSample.fullAway > 0
      ? { home: (halfTimeSample.home + 0.5) / (halfTimeSample.fullHome + 1), away: (halfTimeSample.away + 0.5) / (halfTimeSample.fullAway + 1) }
      : undefined;
    const provenance = { kind: "local-engine" as const, modelVersion: forecast.modelVersion,
      historyHash: forecast.historyHash, evidenceHash: expected.evidenceHash,
      rates: { ...forecast.expectedGoals, ...(firstHalfShare === undefined ? {} : { firstHalfShare }) },
      sample: { matches, homeEffectiveMatches, awayEffectiveMatches } };
    const markets = Object.fromEntries(Object.entries(result.markets).map(([family, market]) => [family, market.available ? {
      ...market, fallback: null, timestamps: { generatedAt: at, retrievedAt: at, providerUpdatedAt: null },
      provenance, flags: ["unknown-provider-update-time"],
    } : market])) as ResolvedForecastCandidate["markets"];
    return freezeEvidence({ context: expected, markets, issues: result.issues, audit: {
      ...ai,
      providerStatus: "not-requested", providerReason: null, sourceCascade: LIVE_FORECAST_CASCADE, localStatus: "candidate",
    }, reasons: [
      { text: "The local engine estimates regulation-time scores from verified results for this league and both teams.", sourceUrls: [] },
      { text: "Double chance is derived from the same home, draw and away probability group.", sourceUrls: [] },
    ], uncertainty: { text: "This local estimate is provisional. Player availability and context effects are outside the fitted score model.", sourceUrls: [] } });
  };
}

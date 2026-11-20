import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import { marketRules, validateMarketSnapshot } from "../../domain/markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { readArchivedFixtureContext } from "../evidence/fixture-context-evidence.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { buildFixtureModelEvidence } from "../evidence/fixture-model-evidence.ts";
import { LIVE_FORECAST_CASCADE, type FallbackContext, type ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";
import { localGoalFirstHalfShare, readLiveLocalGoalHistory } from "./live-local-history.ts";
import { estimateLocalGoals } from "./local-goals-model.ts";

const archiveContextBudgetMs = 300;

/** Read only point-in-time regulation results for the target's canonical league.
 * No fixture needs a prediction cycle to be useful as historical evidence. */
export function createLiveLocalEngine(database: DatabaseRuntime, options: Readonly<{ verifyPrivateUse?: () => boolean }> = {}) {
  const { verifyPrivateUse } = options;
  return async (expected: FallbackContext, ai: Pick<ResolvedForecastCandidate["audit"], "aiStatus" | "aiReason">, clock: () => UtcInstant,
    check: () => void): Promise<ResolvedForecastCandidate | null> => {
    const context = expected.context;
    check();
    const rows = await database.query((tx) => readLiveLocalGoalHistory(tx, null, context.cutoffAt, {
      fixtureId: context.fixtureId, externalFixtureId: context.externalFixtureId, homeTeamId: context.home.teamId,
      awayTeamId: context.away.teamId, kickoffAt: context.kickoffAt,
    }));
    check();
    if (rows.length === 0) return null;
    const archivedContext = verifyPrivateUse ? await boundedArchivedContext(verifyPrivateUse) : null;
    async function boundedArchivedContext(verify: () => boolean) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([readArchivedFixtureContext(database, context, verify, controller.signal).catch(() => null),
          new Promise<null>((resolve) => { timer = setTimeout(resolve, archiveContextBudgetMs, null); })]);
      } finally { clearTimeout(timer); controller.abort(); }
    }
    check();
    const evidence = buildFixtureModelEvidence({ fixture: { fixtureId: context.fixtureId, competitionId: rows[0]!.competitionId,
      homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, forecastAt: context.cutoffAt, kickoffAt: context.kickoffAt },
    history: rows, ...(archivedContext?.competitionId === rows[0]!.competitionId ? { archivedContext } : {}) });
    const history = evidence.history.map(({ halfTime, ...result }) => {
      void halfTime;
      return result;
    });
    const forecast = estimateLocalGoals({ fixture: evidence.fixture, history });
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
    const firstHalfShare = localGoalFirstHalfShare(evidence.history);
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

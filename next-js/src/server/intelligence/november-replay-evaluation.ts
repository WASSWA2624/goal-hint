import "server-only";

import { isPlayedFinalStatus, type SettlementContext, type SettlementStatus } from "../../domain/market-settlement.ts";
import { marketRules, marketSelections, validateMarketSnapshot, type MarketFamily } from "../../domain/markets.ts";
import { settleGoalSelection, type GoalMarketDefinition } from "../../domain/score-distribution-markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMarketMetricsAccumulator } from "../evaluation/evaluation-metrics.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { storedRevision, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow } from "../results/result-read.ts";
import type { IntelligenceProbabilities } from "./intelligence-contract.ts";
import type { auditNovemberReplay } from "./november-replay-audit.ts";

type Audit = Awaited<ReturnType<typeof auditNovemberReplay>>;
export type NovemberReplayPrediction = Readonly<{ fixtureId: string; kickoffAt: number; probabilities: IntelligenceProbabilities | null;
  featured?: { definition: GoalMarketDefinition; selection: string } }>;
const families = Object.keys(marketSelections) as MarketFamily[];
const bands = [0, 0.2, 0.4, 0.6, 0.8, 1];

function reportMetrics(metrics: ReturnType<ReturnType<typeof createMarketMetricsAccumulator>["snapshot"]>) {
  if (metrics.logLoss === Infinity) return { ...metrics, logLoss: null, infiniteLogLoss: true };
  return metrics;
}

/** Result references are joined to the exact audited occurrence only after decisions have been checkpointed. */
export async function evaluateNovemberReplay(database: Pick<DatabaseRuntime, "query">, audit: Audit,
  predictions: readonly NovemberReplayPrediction[]) {
  const qualified = new Map(predictions.map((value) => [`${value.fixtureId}:${value.kickoffAt}`, value]));
  const occurrences = audit.occurrences.filter((row) => isPlayedFinalStatus(row.status as SettlementStatus) && row.kickoffAt < audit.auditedAt);
  const counts = { finished: occurrences.length, verified: 0, readable: 0, unreadable: 0, featuredGrades: {} as Record<string, number> };
  const metrics = families.map((family) => ({ family, allLocal: createMarketMetricsAccumulator(family, bands, 1.96),
    matchedLocal: createMarketMetricsAccumulator(family, bands, 1.96), matchedPrior: createMarketMetricsAccumulator(family, bands, 1.96) }));
  const asOf = new Date(audit.auditedAt);
  for (let offset = 0; offset < occurrences.length; offset += 100) {
    const page = occurrences.slice(offset, offset + 100);
    const identity = Prisma.join(page.map(({ fixtureId, kickoffAt, teams, status }) =>
      Prisma.sql`(${fixtureId},${new Date(kickoffAt)},${teams[0]},${teams[1]},${status})`));
    const rows = await database.query((tx) => tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
      r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity
      FROM FootballFixture f JOIN FixtureResultState rs ON rs.fixtureId=f.id
      JOIN FixtureResult r ON r.id=rs.resultId AND r.fixtureId=f.id AND r.status=f.status
      LEFT JOIN FixtureLifecycleState life ON life.fixtureId=f.id
      LEFT JOIN PredictionChangeEvent changeEvent ON changeEvent.fixtureResultId=r.id
      LEFT JOIN FootballFixtureAudit resultAudit ON resultAudit.fixtureId=r.fixtureId AND resultAudit.dataVersion=r.fixtureVersion
      LEFT JOIN FootballImport resultImport ON resultImport.id=resultAudit.importId AND resultImport.provider='api-football'
      WHERE (f.id,f.kickoff,f.homeTeamId,f.awayTeamId,f.status) IN (${identity}) AND life.issue IS NULL
        AND r.regulationVerified=TRUE AND r.observedAt>f.kickoff AND r.observedAt<=${asOf}
        AND COALESCE(changeEvent.at,resultImport.recordedAt)<=${asOf}`));
    const results = new Map(rows.map((row) => [row.fixtureId, row]));
    for (const item of page) {
      const row = results.get(item.fixtureId);
      if (!row) continue;
      let result;
      try { result = fixtureResultFromRow(row); }
      catch { counts.unreadable++; continue; }
      if (result.fixtureId !== item.fixtureId || result.observedAt <= item.kickoffAt || result.observedAt > audit.auditedAt ||
        !isPlayedFinalStatus(result.status) || !result.regulation.verified || result.regulation.home === null || result.regulation.away === null) {
        counts.unreadable++; continue;
      }
      counts.verified++;
      const prediction = qualified.get(`${item.fixtureId}:${item.kickoffAt}`);
      if (!prediction) continue;
      counts.readable++;
      const truth: SettlementContext = { status: result.status, cycleEligibility: { eligible: true },
        regulationScore: { verified: true, period: marketRules.period, home: result.regulation.home, away: result.regulation.away } };
      const { probabilities, featured } = prediction;
      if (featured) {
        const { status } = settleGoalSelection(featured.definition, featured.selection, { ...truth, halfTimeScore: result.halfTime ?? null });
        counts.featuredGrades[status] = (counts.featuredGrades[status] ?? 0) + 1;
      }
      if (!probabilities) continue;
      const local = validateMarketSnapshot({
        "match-result": { source: "local-engine", period: marketRules.period, probabilities: probabilities["match-result"] },
        "total-goals": { source: "local-engine", period: marketRules.period, line: marketRules.totalGoalsLine, probabilities: probabilities["total-goals"] },
        "both-teams-to-score": { source: "local-engine", period: marketRules.period, probabilities: probabilities["both-teams-to-score"] },
      });
      const prior = item.sourceRevisionId && item.sourcePublishedAt !== null && item.sourcePublishedAt < item.effectiveCutoffAt
        ? await database.query((tx) => storedRevision(tx, item.sourceRevisionId!)).catch(() => null) : null;
      const eligiblePrior = prior && prior.fixtureId === item.fixtureId && prior.candidate.context.context.kickoffAt === item.kickoffAt ? prior : null;
      for (const { family, allLocal, matchedLocal, matchedPrior } of metrics) {
        const market = local.markets[family];
        if (!market.available) continue;
        allLocal.add([{ market: market.market, result: truth }]);
        const original = eligiblePrior?.candidate.markets[family];
        if (!original?.available || original.market.source === "api-football" && !item.markets.some((market) =>
          market.family === family && market.preCutoffProviderReceipt)) continue;
        matchedLocal.add([{ market: market.market, result: truth }]);
        matchedPrior.add([{ market: original.market, result: truth }]);
      }
    }
  }
  return { ...counts, coverage: counts.verified ? counts.readable / counts.verified : null,
    markets: Object.fromEntries(metrics.map(({ family, allLocal, matchedLocal, matchedPrior }) => [family,
      { local: reportMetrics(allLocal.snapshot()), matchedLocal: reportMetrics(matchedLocal.snapshot()), matchedPrior: reportMetrics(matchedPrior.snapshot()) }])) };
}

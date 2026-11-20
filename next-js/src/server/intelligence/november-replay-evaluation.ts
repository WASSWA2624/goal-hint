import "server-only";

import { isPlayedFinalStatus, type SettlementContext } from "../../domain/market-settlement.ts";
import { marketRules, marketSelections, validateMarketSnapshot, type MarketFamily } from "../../domain/markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMarketMetricsAccumulator } from "../evaluation/evaluation-metrics.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { storedRevision, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow } from "../results/result-read.ts";
import type { IntelligenceProbabilities } from "./intelligence-contract.ts";
import type { auditNovemberReplay } from "./november-replay-audit.ts";

type Audit = Awaited<ReturnType<typeof auditNovemberReplay>>;
export type NovemberReplayPrediction = Readonly<{ fixtureId: string; kickoffAt: number; probabilities: IntelligenceProbabilities }>;
const families = Object.keys(marketSelections) as MarketFamily[];
const bands = [0, 0.2, 0.4, 0.6, 0.8, 1];
const blocks = [{ name: "november-01-13", from: "2026-11-01", to: "2026-11-14" },
  { name: "november-14-30", from: "2026-11-14", to: "2026-12-01" }] as const;

function reportMetrics(metrics: ReturnType<ReturnType<typeof createMarketMetricsAccumulator>["snapshot"]>) {
  if (metrics.logLoss === Infinity) return { ...metrics, logLoss: null, infiniteLogLoss: true };
  return metrics;
}

/** Labels are read from the immutable result identities pinned by the audit and used only here. */
export async function evaluateNovemberReplay(database: Pick<DatabaseRuntime, "query">, audit: Audit,
  predictions: readonly NovemberReplayPrediction[]) {
  const qualified = new Map(predictions.map((value) => [`${value.fixtureId}:${value.kickoffAt}`, value]));
  const occurrences = audit.occurrences.filter((row) => row.verifiedResult && row.resultId !== null && row.kickoffAt < audit.auditedAt);
  const cohorts = blocks.map(({ name, from, to }) => ({ name, from, to, labeled: 0, localEligible: 0, readable: 0, unreadable: 0,
    families: families.map((family) => ({ family, allLocal: createMarketMetricsAccumulator(family, bands, 1.96),
      matchedLocal: createMarketMetricsAccumulator(family, bands, 1.96), matchedPrior: createMarketMetricsAccumulator(family, bands, 1.96) })) }));
  for (const { date } of occurrences) cohorts.find(({ from, to }) => date >= from && date < to)!.labeled++;
  const comparable = occurrences.filter(({ fixtureId, kickoffAt }) => qualified.has(`${fixtureId}:${kickoffAt}`));
  for (let offset = 0; offset < comparable.length; offset += 100) {
    const page = comparable.slice(offset, offset + 100);
    const rows = await database.query((tx) => tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
      r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity FROM FixtureResult r WHERE r.id IN (${Prisma.join(page.map(({ resultId }) => resultId))})`));
    const results = new Map(rows.map((row) => [row.id, row]));
    for (const item of page) {
      const cohort = cohorts.find(({ from, to }) => item.date >= from && item.date < to)!;
      cohort.localEligible++;
      let result;
      try { result = fixtureResultFromRow(results.get(item.resultId)!); }
      catch { cohort.unreadable++; continue; }
      if (result.fixtureId !== item.fixtureId || result.observedAt <= item.kickoffAt || result.observedAt > audit.auditedAt ||
        !isPlayedFinalStatus(result.status) || !result.regulation.verified || result.regulation.home === null || result.regulation.away === null) {
        cohort.unreadable++; continue;
      }
      cohort.readable++;
      const truth: SettlementContext = { status: result.status, cycleEligibility: { eligible: true },
        regulationScore: { verified: true, period: marketRules.period, home: result.regulation.home, away: result.regulation.away } };
      const { probabilities } = qualified.get(`${item.fixtureId}:${item.kickoffAt}`)!;
      const local = validateMarketSnapshot({
        "match-result": { source: "local-engine", period: marketRules.period, probabilities: probabilities["match-result"] },
        "total-goals": { source: "local-engine", period: marketRules.period, line: marketRules.totalGoalsLine, probabilities: probabilities["total-goals"] },
        "both-teams-to-score": { source: "local-engine", period: marketRules.period, probabilities: probabilities["both-teams-to-score"] },
      });
      const prior = item.sourceRevisionId && item.sourcePublishedAt !== null && item.sourcePublishedAt < item.effectiveCutoffAt
        ? await database.query((tx) => storedRevision(tx, item.sourceRevisionId!)).catch(() => null) : null;
      const eligiblePrior = prior && prior.fixtureId === item.fixtureId && prior.candidate.context.context.kickoffAt === item.kickoffAt ? prior : null;
      for (const { family, allLocal, matchedLocal, matchedPrior } of cohort.families) {
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
  return cohorts.map(({ families, ...sums }) => ({ ...sums, coverage: sums.labeled ? sums.readable / sums.labeled : null,
    markets: Object.fromEntries(families.map(({ family, allLocal, matchedLocal, matchedPrior }) => [family,
      { local: reportMetrics(allLocal.snapshot()), matchedLocal: reportMetrics(matchedLocal.snapshot()), matchedPrior: reportMetrics(matchedPrior.snapshot()) }])) }));
}

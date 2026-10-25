import { aggregatePerformance } from "../../src/server/performance/performance-service.ts";
import { parsePerformanceQuery } from "../../src/server/performance/performance-query.ts";
import { parseReportingDate } from "../../src/domain/calendar.ts";
import { summarizeSlipPerformance } from "../../src/domain/slip-performance.ts";
import { performanceRecord, performanceSnapshot, performanceProtocol, withQuotes } from "./performance-fixtures.mjs";
import { slipForecastFixture } from "./slip-forecast-fixtures.mjs";
import { modelVersion } from "./predictor-fixtures.mjs";

// Isolated synthetic display evidence only. This is never a production evaluation policy or publication.
const today = parseReportingDate("2026-10-09"), at = Date.parse("2026-10-09T12:00:00Z");
const filters = { from: "2026-10-01", to: today, market: "all", source: "combined", model: null, version: null };
const query = parsePerformanceQuery(new URLSearchParams({ from: filters.from, to: filters.to }), today);
const records = [performanceRecord(), performanceRecord({ score: [0, 1] })];
const report = (protocol = null) => aggregatePerformance(performanceSnapshot(records), query, at, protocol);
const publications = ["won", "lost", "void"].map((outcome, index) => {
  const original = slipForecastFixture({ at: at - 86_400_000 }), quote = index === 0 ? "2.35" : "9.20";
  return { id: `synthetic-publication-${index}`, savedAt: new Date(at - (3 - index) * 3_600_000).toISOString(),
    publishedAt: new Date(at - (3 - index) * 3_600_000).toISOString(), publicationDay: today, rank: index + 1,
    modelId: "synthetic-reviewed-model", estimatedProbability: .7, outcome,
    slip: { ...original.slip, id: `synthetic-slip-${index}`, totalOdds: quote,
      selections: original.slip.selections.map((item) => ({ ...item, odds: quote })) },
    results: [{ fixtureId: original.slip.selections[0].fixtureId, home: outcome === "void" ? null : outcome === "won" ? 2 : 0,
      away: outcome === "void" ? null : 1, outcome: outcome === "won" ? "correct" : outcome === "lost" ? "incorrect" : "void" }],
  };
});
const statistics = summarizeSlipPerformance([...publications.map((row) => ({ id: row.id, publishedAt: Date.parse(row.publishedAt),
  totalOdds: row.slip.totalOdds, outcome: row.outcome })),
  ...[1, 2].map((id) => ({ id: `private-pending-${id}`, publishedAt: at + id, totalOdds: "999999.99", outcome: "pending" }))]);
const history = { records: publications.slice(0, 2), page: 1, pageSize: 2, total: 3, asOf: at, statistics };
const leagueRecords = [...Array.from({ length: 12 }, (_, index) => performanceRecord({
  competitionId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  competitionName: `Synthetic League ${String(index).padStart(2, "0")}${index === 11 ? " <script>synthetic-league-marker</script>" : ""}`,
})), performanceRecord({ competitionId: null }), performanceRecord({ competitionId: null, score: [0, 1] })];
const leagueReport = (leaguePage) => aggregatePerformance(performanceSnapshot(leagueRecords),
  parsePerformanceQuery(new URLSearchParams({ from: filters.from, to: filters.to, leaguePage: String(leaguePage) }), today), at, null);
// Synthetic captured publication quotes: won 2.60, lost 1.50, one missing, one unavailable; pending/void prices (987.65) never enter.
const quoted = [[{}, 260], [{ score: [0, 1] }, 150], [{ score: [0, 1] }, null], [{}, "unavailable"], [{ score: null }, 98_765], [{ state: "void" }, 98_765]]
  .map(([options, quote], index) => {
    const record = performanceRecord(options);
    record.cycle.kickoffAt += index; record.revision.publishedAt += index;
    return withQuotes(record, quote === null ? {} : { "match-result": quote });
  });
export const performancePageScenarios = {
  unapproved: { locale: "en", filters, report: report(), history },
  reviewed: { locale: "en", filters, report: report(performanceProtocol()), history },
  second: { locale: "en", filters, report: report(), history: { ...history, page: 2, records: publications.slice(2) } },
  outside: { locale: "en", filters, report: report(), history: { ...history, page: 3, records: [] } },
  empty: { locale: "en", filters, report: aggregatePerformance(performanceSnapshot(), query, at, null),
    history: { ...history, records: [], total: 0, statistics: summarizeSlipPerformance([]) } },
  unavailable: { locale: "en", filters, report: null, history: null },
  pinned: { locale: "en", filters: { ...filters, source: "ai", model: modelVersion().id, version: "synthetic-version" }, report: report(), history },
  leagues: { locale: "en", filters: { ...filters, leaguePage: 2 }, report: leagueReport(2), history },
  "league-outside": { locale: "en", filters: { ...filters, leaguePage: 3 }, report: leagueReport(3), history },
  returns: { locale: "en", filters: { ...filters, market: "match-result" }, history,
    report: aggregatePerformance(performanceSnapshot(quoted, { quotesEnabled: true }), parsePerformanceQuery(new URLSearchParams({
      from: filters.from, to: filters.to, market: "match-result" }), today), at, null) },
};

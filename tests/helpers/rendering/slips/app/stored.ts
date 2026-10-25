import { addReportingDays, getReportingDate, parseUtcInstant } from "@/domain/calendar";
import { parseFeedQuery, resolveFeedDates, type FeedParameters } from "@/domain/feed-query";
import { storedMatchFeedRecordSchema, storedMatchFeedResponseSchema } from "@/domain/match-feed";
import { marketRules, validateMarketSnapshot, type MarketFamily } from "@/domain/markets";
import { buildSlips, defaultSlipCriteria, hasJointProbabilityBounds, type SlipCriteria, type SlipMatchRecord } from "@/domain/slip-builder";
import { jointSlipBuilder } from "@/domain/joint-slip-model";
import type { SlipBuildPageResult } from "@/server/slips/slip-service";

/** Isolated rendering data only: no database, provider, cache, approval or visitor state. */
export const now = parseUtcInstant("2026-10-13T08:00:00Z"), today = getReportingDate(now);
export const criteria: SlipCriteria = { ...defaultSlipCriteria(today), dateTo: addReportingDays(today, 6),
  markets: ["match-result", "double-chance", "total-goals"], totalMin: 300, totalMax: 600, oddsMin: 125, oddsMax: 260,
  probMin: 70, probMax: 100, teamsMin: 2, teamsMax: 4, slips: 3, reuse: true };
export function syntheticRecord(index: number, longNames = false, manualHome = false): SlipMatchRecord {
  const family = (["match-result", "total-goals", "both-teams-to-score"] as const)[index % 3]!;
  const probability = [0.91, 0.89, 0.87, 0.85, 0.82, 0.80][index % 6]!;
  const group = family === "match-result" ? { source: "ai", period: marketRules.period,
    probabilities: manualHome ? { "home-win": 0.2, draw: 0.1, "away-win": 0.7 }
      : { "home-win": probability, draw: 0.04, "away-win": 1 - probability - 0.04 } }
    : family === "total-goals" ? { source: "ai", period: marketRules.period, line: 2.5,
      probabilities: { "over-2.5": probability, "under-2.5": 1 - probability } }
      : { source: "ai", period: marketRules.period, probabilities: { yes: probability, no: 1 - probability } };
  const snapshot = validateMarketSnapshot({ [family]: group });
  const fixtureId = `synthetic-slip-${index + 1}`, cycleId = `${fixtureId}-cycle`, revisionId = `${fixtureId}-revision`;
  const markets = Object.values(snapshot.markets).filter((entry) => entry.available).map((entry) => ({
    market: entry.market, reasons: [], uncertainty: null,
    outcome: { cycleId, revisionId, selection: entry.market.selection, status: "pending", explanation: null },
  }));
  const pick = markets.find((item) => item.market.family === family)!;
  const home = longNames ? `Synthetic Metropolitan International Athletic Football Club ${index + 1}` : `Synthetic Home ${index + 1}`;
  const away = longNames ? `Synthetic Coastal Union Championship Sporting Association ${index + 1}` : `Synthetic Away ${index + 1}`;
  const selectedPrice = manualHome ? "1.30" : ["1.70", "1.80", "2.00", "2.20", "2.40", "2.50"][index % 6]!;
  const record = storedMatchFeedRecordSchema.parse({ fixtureId, dataVersion: "9", homeTeam: { id: `${fixtureId}-home`, name: home },
    awayTeam: { id: `${fixtureId}-away`, name: away },
    competition: { id: "synthetic-league", name: longNames ? "Synthetic International Championship of Metropolitan Associations" : "Synthetic League", country: "Synthetic Country" },
    kickoffAt: now + (index + 1) * 3600000, syncedAt: now - 1000, status: "scheduled", score: null, cycleId,
    cycle: { state: "open", mode: "current", ordinal: 1, lockedAt: null, voidReason: null },
    forecast: { runId: "synthetic-run", runSequence: "1", revisionId, publishedAt: now - 60000,
      updateDelayed: false, provisional: false, markets },
    unavailableMarkets: Object.keys(snapshot.markets).filter((key) => !snapshot.markets[key as MarketFamily].available)
      .map((key) => ({ family: key, reason: "insufficient-data" })),
    update: { prediction: "current", result: "untracked" }, availabilityMessage: null, scorePeriod: null,
    prices: [{ family, selection: pick.market.selection, price: selectedPrice,
      basis: "bookmaker", retrievedAt: now - 1000, providerUpdatedAt: null }],
  });
  const selectionPrices = markets.flatMap(({ market }) => Object.keys(market.probabilities).map((selection) => ({
    family: market.family, selection, basis: "bookmaker" as const, retrievedAt: record.prices[0]!.retrievedAt, providerUpdatedAt: null,
    price: market.family === "double-chance" ? "1.10" : manualHome
      ? ({ "home-win": "2.00", draw: "3.00", "away-win": "1.30" } as Record<string, string>)[selection]!
      : selection === market.selection ? selectedPrice : "4.50",
  })));
  return { ...record, selectionPrices };
}
export const records = [...Array.from({ length: 6 }, (_, index) => syntheticRecord(index)), syntheticRecord(6, false, true)];
export function syntheticFeed(parameters: FeedParameters, asOf = now) {
  const query = parseFeedQuery(parameters, { today }), range = resolveFeedDates(query, today), total = records.length;
  const totalPages = Math.ceil(total / query.pageSize), nextPage = query.page < totalPages ? query.page + 1 : null;
  const previousPage = query.page > 1 ? query.page - 1 : null;
  return storedMatchFeedResponseSchema.parse({ paginationVersion: "a".repeat(64),
    records: records.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((record) => {
      const metadata = { ...record }; delete metadata.selectionPrices; return metadata;
    }),
    page: query.page, pageSize: query.pageSize, total, totalPages, nextPage, previousPage,
    links: { next: nextPage ? `/api/matches?page=${nextPage}` : null, previous: previousPage ? `/api/matches?page=${previousPage}` : null },
    asOf, today, range: { from: range.startDate, to: range.endDate, ...range.window }, state: "ready", message: null,
    coverage: { partial: false, knownFixtures: total, matchingWithMarket: total,
      dates: Array.from({ length: range.dayCount }, (_, day) => ({ date: addReportingDays(range.startDate, day),
        status: "complete", observedAt: asOf, authoritative: true })) }, run: null });
}
export function syntheticPricePage(parameters: FeedParameters, asOf = now) {
  const feed = syntheticFeed(parameters, asOf), byId = new Map(records.map((record) => [record.fixtureId, record]));
  return { feed, selectionPrices: Object.fromEntries(feed.records.map((record) => [record.fixtureId, byId.get(record.fixtureId)!.selectionPrices!])) };
}
export function syntheticBuild(input: SlipCriteria = criteria, longNames = false, manualHome = false, joint = false): SlipBuildPageResult {
  if (hasJointProbabilityBounds(input) && !joint) return failure("model-unavailable");
  const available = manualHome ? [syntheticRecord(6, false, true)] : longNames ? Array.from({ length: 6 }, (_, index) => syntheticRecord(index, true)) : records;
  const builder = joint ? jointSlipBuilder({ calibrationReference: "synthetic-rendering-calibration", correlationReference: "synthetic-rendering-correlation",
    validFrom: now - 1, validUntil: now + 1000, estimate: (selections) => Math.min(...selections.map((selection) => selection.probability)) - 0.05 }) : buildSlips;
  const data = builder(input, available, now);
  return { state: data.slips.length ? "generated" : data.qualifyingMatches ? "no-combinations" : "no-qualifying", data,
    asOf: now, examined: available.length, partialCoverage: false, searchLimited: data.searchLimited, retryAfterSeconds: null };
}
const manualCriteria: SlipCriteria = { ...criteria, markets: ["match-result"], outcomes: { "match-result": ["home-win"] },
  totalMin: 101, totalMax: 10000000, oddsMin: 101, oddsMax: 100000, probMin: 0, teamsMin: 1, teamsMax: 1, slips: 1 };
function failure(state: SlipBuildPageResult["state"]): SlipBuildPageResult {
  return { state, data: null, asOf: now, examined: 0, partialCoverage: false, searchLimited: false,
    retryAfterSeconds: state === "rate-limited" ? 11 : null };
}
export const cases: Readonly<Record<string, { criteria: SlipCriteria; result: SlipBuildPageResult | null }>> = {
  generated: { criteria, result: syntheticBuild() },
  idle: { criteria, result: null },
  "no-qualifying": { criteria: { ...criteria, probMin: 95 }, result: syntheticBuild({ ...criteria, probMin: 95 }) },
  "no-combinations": { criteria: { ...criteria, totalMin: 9000000, totalMax: 10000000 },
    result: syntheticBuild({ ...criteria, totalMin: 9000000, totalMax: 10000000 }) },
  "odds-unavailable": { criteria, result: failure("odds-unavailable") },
  "model-unavailable": { criteria: { ...criteria, totalProbMin: 70 }, result: failure("model-unavailable") },
  "joint-generated": { criteria: { ...criteria, totalProbMin: 60, totalProbMax: 90 },
    result: syntheticBuild({ ...criteria, totalProbMin: 60, totalProbMax: 90 }, false, false, true) },
  "data-unavailable": { criteria, result: failure("data-unavailable") },
  "rate-limited": { criteria, result: failure("rate-limited") },
  limited: { criteria, result: { ...syntheticBuild(), searchLimited: true, partialCoverage: true } },
  "long-names": { criteria, result: syntheticBuild(criteria, true) },
  "manual-home-win": { criteria: manualCriteria, result: syntheticBuild(manualCriteria, false, true) },
};

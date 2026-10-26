import { parseReportingDate, utcInstantFromEpochMilliseconds } from "../../src/domain/calendar.ts";
import { parseFeedQuery } from "../../src/domain/feed-query.ts";
import { parseFixtureSnapshot } from "../../src/domain/fixture-snapshot.ts";
import { marketRules, validateMarketSnapshot } from "../../src/domain/markets.ts";

export const today = parseReportingDate("2026-10-09");
export const now = utcInstantFromEpochMilliseconds(Date.parse("2026-10-09T09:00:00Z"));
export function query(parameters = "", context = {}) {
  return parseFeedQuery(new URLSearchParams(parameters), { today, locale: "en", ...context });
}
export function fixture(overrides = {}, source = "ai", probabilities = { "home-win": 0.6, draw: 0.25, "away-win": 0.15 }) {
  const snapshot = validateMarketSnapshot({
    "match-result": { source, period: marketRules.period, probabilities },
  });
  return parseFixtureSnapshot({
    fixtureId: "fixture-a", dataVersion: "9",
    homeTeam: { id: "team-a", name: "Synthetic A" }, awayTeam: { id: "team-b", name: "Synthetic B" },
    competition: { id: "league-a", name: "Synthetic league", country: null },
    kickoffAt: now, syncedAt: now, status: "scheduled", score: null, cycleId: "cycle-z",
    forecast: { runId: "run-z", revisionId: "revision-z", publishedAt: now,
      markets: Object.values(snapshot.markets).filter((entry) => entry.available).map((entry) => ({
        market: entry.market, reasons: ["Synthetic explanation"], uncertainty: "Synthetic uncertainty",
      })),
    }, ...overrides,
  });
}
export function bootstrap(parameters = "", records = [fixture()]) {
  return { today, query: query(parameters), data: { records, page: query(parameters).page, nextPage: null } };
}

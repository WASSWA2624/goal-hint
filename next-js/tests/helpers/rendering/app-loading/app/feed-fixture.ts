import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { feedPageApiHref } from "@/domain/feed-pagination";
import { resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { storedMatchFeedResponseSchema } from "@/domain/match-feed";
import scenarios from "./scenarios.json";

/** Stable synthetic pages let browser checks exercise real filters and the 50-row boundary. */
export function feedFixture(query: FeedQuery) {
  const at = utcInstantFromEpochMilliseconds(Date.now()), today = getReportingDate(at), range = resolveFeedDates(query, today);
  const { access, ...stored } = scenarios.feed; void access;
  const leagues = [{ id: "england", name: "Premier League", country: "England", logoUrl: null, fixtures: 20 },
    { id: "egypt", name: "Egyptian Premier League", country: "Egypt", logoUrl: null, fixtures: 20 },
    { id: "france", name: "Ligue 1", country: "France", logoUrl: null, fixtures: 15 }];
  const records = Array.from({ length: 55 }, (_, index) => ({ ...stored.records[0]!, fixtureId: `fixture-${index + 1}`,
    homeTeam: { id: `home-${index}`, name: `Synthetic Home ${index + 1}` }, awayTeam: { id: `away-${index}`, name: `Synthetic Away ${index + 1}` },
    competition: { id: leagues[index % 3]!.id, name: leagues[index % 3]!.name, country: leagues[index % 3]!.country }, status: "live", score: { home: 2, away: 1 }, scorePeriod: "live",
    kickoffAt: range.window.startInclusive + 60_000 * (index + 1) }));
  const selected = records.filter(record => (!query.leagues.length || query.leagues.includes(record.competition.id))
    && (!query.countries.length || query.countries.includes(record.competition.country)));
  const total = selected.length, totalPages = Math.ceil(total / query.pageSize), nextPage = query.page < totalPages ? query.page + 1 : null;
  const previousPage = query.page > 1 ? query.page - 1 : null;
  return storedMatchFeedResponseSchema.parse({ ...stored, records: selected.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    leagues, today, asOf: at, page: query.page, pageSize: query.pageSize, total, totalPages, nextPage, previousPage,
    links: { next: nextPage ? feedPageApiHref(query, today, nextPage) : null, previous: previousPage ? feedPageApiHref(query, today, previousPage) : null },
    range: { from: range.startDate, to: range.endDate, ...range.window }, performance: null,
    coverage: { ...stored.coverage, knownFixtures: 55, matchingWithMarket: total }, run: null });
}

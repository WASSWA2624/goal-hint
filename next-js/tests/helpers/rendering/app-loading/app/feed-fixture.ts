import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { feedPageApiHref } from "@/domain/feed-pagination";
import { getFeedToday, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { feedPerformanceReplySchema } from "@/domain/feed-performance-summary";
import { storedMatchFeedResponseSchema } from "@/domain/match-feed";
import scenarios from "./scenarios.json";

/** Stable synthetic pages let browser checks exercise real filters and the 50-row boundary. */
function fixtureCohort(query: FeedQuery) {
  const at = utcInstantFromEpochMilliseconds(Date.now()), today = getFeedToday(query, at), range = resolveFeedDates(query, today);
  const leagues = [{ id: "england", name: "Premier League", country: "England", logoUrl: null, fixtures: 20 },
    { id: "egypt", name: "Egyptian Premier League", country: "Egypt", logoUrl: null, fixtures: 20 },
    { id: "france", name: "Ligue 1", country: "France", logoUrl: null, fixtures: 15 }];
  const records = Array.from({ length: 55 }, (_, index) => {
    const status = (["live", "scheduled", "finished-regulation"] as const)[Math.floor(index / 3) % 3]!;
    const won = index < 34;
    return { ...scenarios.feed.records[0]!, fixtureId: `fixture-${index + 1}`, status,
      homeTeam: { id: `home-${index}`, name: `Synthetic Home ${index + 1}` }, awayTeam: { id: `away-${index}`, name: `Synthetic Away ${index + 1}` },
      competition: { id: leagues[index % 3]!.id, name: leagues[index % 3]!.name, country: leagues[index % 3]!.country },
      score: status === "scheduled" ? null : status === "live" || won ? { home: 2, away: 1 } : { home: 1, away: 2 },
      scorePeriod: status === "scheduled" ? null : status === "live" ? "live" : "regulation",
      kickoffAt: range.window.startInclusive + 60_000 * index };
  });
  const selected = records.filter(record => record.kickoffAt < range.window.endExclusive
    && (!query.leagues.length || query.leagues.includes(record.competition.id))
    && (!query.countries.length || query.countries.includes(record.competition.country))
    && (query.status === "all" || query.status === record.status || (query.status === "finished" && record.status === "finished-regulation"))
    && (!query.result || query.result === fixtureResult(record)));
  return { at, today, range, leagues, selected };
}

function fixtureResult(record: { status: string; score: { home: number; away: number } | null }) {
  return record.status !== "finished-regulation" ? "pending" : record.score!.home > record.score!.away ? "won" : "lost";
}

export function summaryFixture(query: FeedQuery) {
  const { at, selected } = fixtureCohort(query);
  const performance = { total: selected.length, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0, unavailable: 0 };
  for (const record of selected) performance[fixtureResult(record)]++;
  return feedPerformanceReplySchema.parse({ performance, asOf: at, access: scenarios.feed.access, paginationVersion: scenarios.feed.paginationVersion });
}

export function feedFixture(query: FeedQuery) {
  const { at, today, range, leagues, selected } = fixtureCohort(query);
  const { access, ...stored } = scenarios.feed; void access;
  const total = selected.length, totalPages = Math.ceil(total / query.pageSize), nextPage = query.page < totalPages ? query.page + 1 : null;
  const previousPage = query.page > 1 ? query.page - 1 : null;
  return storedMatchFeedResponseSchema.parse({ ...stored, records: selected.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    leagues, today, asOf: at, page: query.page, pageSize: query.pageSize, total, totalPages, nextPage, previousPage,
    links: { next: nextPage ? feedPageApiHref(query, today, nextPage) : null, previous: previousPage ? feedPageApiHref(query, today, previousPage) : null },
    range: { from: range.startDate, to: range.endDate, ...range.window }, performance: null,
    coverage: { ...stored.coverage, knownFixtures: 55, matchingWithMarket: total }, run: null });
}

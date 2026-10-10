import type { ReportingDate } from "./calendar.ts";
import { feedQueryHref, resolveFeedDates, serializeFeedQuery, type FeedQuery } from "./feed-query.ts";
import { fixtureAdvance, mergeFixtureObservation } from "./fixture-reconciliation.ts";
import { matchFeedResponseSchema, type MatchFeedRecord, type MatchFeedResponse } from "./match-feed.ts";

export const feedPaginationRules = Object.freeze({ maximumLoadedPages: 10 });
export type LoadedFeed = Readonly<{ data: MatchFeedResponse; records: readonly MatchFeedRecord[]; firstPage: number; lastPage: number; pages: number }>;
export class FeedPaginationError extends Error {
  readonly code: "changed" | "invalid-response" | "stale-data" | "unavailable" | "rate-limited";
  constructor(code: FeedPaginationError["code"]) {
    super("Match pagination could not be completed."); this.name = "FeedPaginationError"; this.code = code;
  }
}
export function pinnedFeedQuery(query: FeedQuery, today: ReportingDate): FeedQuery {
  const range = resolveFeedDates(query, today);
  return { ...query, dates: range.dayCount === 1 ? { kind: "date", date: range.startDate }
    : { kind: "range", from: range.startDate, to: range.endDate } };
}
export function feedPageHref(query: FeedQuery, today: ReportingDate, page: number): string {
  return feedQueryHref({ ...pinnedFeedQuery(query, today), page }, today);
}
export function feedPageApiHref(query: FeedQuery, today: ReportingDate, page: number): string {
  return `/api/matches?${serializeFeedQuery({ ...pinnedFeedQuery(query, today), page }, today)}`;
}
export function checkedFeedPage(value: unknown, query: FeedQuery, today: ReportingDate, page: number): MatchFeedResponse {
  const parsed = matchFeedResponseSchema.safeParse(value), range = resolveFeedDates(query, today);
  if (!parsed.success || parsed.data.page !== page || parsed.data.pageSize !== query.pageSize ||
      parsed.data.range.from !== range.startDate || parsed.data.range.to !== range.endDate ||
      parsed.data.range.startInclusive !== range.window.startInclusive || parsed.data.range.endExclusive !== range.window.endExclusive) {
    throw new FeedPaginationError("invalid-response");
  }
  return parsed.data;
}
export function initialLoadedFeed(data: MatchFeedResponse): LoadedFeed {
  return { data, records: data.records, firstPage: data.page, lastPage: data.page, pages: 1 };
}
/** All membership and whole-record replacements commit together, never partially. */
export function appendFeedPage(view: LoadedFeed, page: MatchFeedResponse): LoadedFeed {
  if (view.pages >= feedPaginationRules.maximumLoadedPages || page.page !== view.data.nextPage || page.page !== view.lastPage + 1) {
    throw new FeedPaginationError("invalid-response");
  }
  if (view.data.paginationVersion === null || page.paginationVersion !== view.data.paginationVersion || page.total !== view.data.total) {
    throw new FeedPaginationError("changed");
  }
  const known = new Set(view.records.map((record) => record.fixtureId));
  // Overlap under an allegedly stable cohort is unsafe: dedup alone could hide a gap.
  if (page.records.some((record) => known.has(record.fixtureId))) throw new FeedPaginationError("changed");
  return { ...view, data: page, records: [...view.records, ...page.records], lastPage: page.page, pages: view.pages + 1 };
}
export function replaceFeedPages(previous: LoadedFeed, pages: readonly MatchFeedResponse[]): LoadedFeed {
  if (pages.some((page) => page.asOf < previous.data.asOf)) throw new FeedPaginationError("stale-data");
  const first = pages[0];
  if (!first || first.page !== previous.firstPage) throw new FeedPaginationError("invalid-response");
  let next = initialLoadedFeed(first);
  for (const page of pages.slice(1)) next = appendFeedPage(next, page);
  const known = new Map(previous.records.map((record) => [record.fixtureId, record]));
  const records = next.records.map((record) => {
    const old = known.get(record.fixtureId);
    if (!old) return record;
    const order = fixtureAdvance(old, record);
    if (order < 0) throw new FeedPaginationError("stale-data");
    return order === 0 ? mergeFixtureObservation(old, record) : record;
  });
  return { ...next, records };
}

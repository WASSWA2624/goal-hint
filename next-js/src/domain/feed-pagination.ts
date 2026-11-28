import type { ReportingDate } from "./calendar.ts";
import { feedDiscovery } from "./discovery.ts";
import type { FeedContinuationPrefix } from "./feed-continuation.ts";
import { FeedPaginationError } from "./feed-pagination-error.ts";
import { defaultFeedDatePreset, FeedQueryError, feedQueryHref, feedQueryRules, pinnedDateSelection, resolveFeedDates, serializeFeedQuery, type FeedQuery } from "./feed-query.ts";
import { fixtureAdvance, mergeFixtureObservation } from "./fixture-reconciliation.ts";
import { matchFeedResponseSchema, type MatchFeedRecord, type MatchFeedResponse } from "./match-feed.ts";
import { maximumFeedWindowRecords } from "./match-feed-rules.ts";

export { FeedPaginationError } from "./feed-pagination-error.ts";

export type LoadedFeed = Readonly<{ data: MatchFeedResponse; records: readonly MatchFeedRecord[]; firstPage: number; lastPage: number; pages: number }>;
export function pinnedFeedQuery(query: FeedQuery, today: ReportingDate): FeedQuery {
  const range = resolveFeedDates(query, today);
  return { ...query, dates: pinnedDateSelection(range) };
}
export function feedPageHref(query: FeedQuery, today: ReportingDate, page: number): string {
  if (!Number.isInteger(page) || page < 1 || page > feedQueryRules.maximumPage) throw new FeedQueryError();
  const discovery = feedDiscovery({ ...query, page }, today);
  if (discovery.eligible) return discovery.path;
  // Ordinary navigation re-resolves the rolling collection at the next request,
  // including midnight. API appends keep the pinned cohort for safe reconciliation.
  const collection = query.dates.kind === defaultFeedDatePreset ? query : pinnedFeedQuery(query, today);
  return feedQueryHref({ ...collection, page }, today);
}
export function feedPageApiHref(query: FeedQuery, today: ReportingDate, page: number): string {
  return `/api/matches?${serializeFeedQuery({ ...pinnedFeedQuery(query, today), page }, today)}`;
}
export function feedContinuationApiHref(query: FeedQuery, today: ReportingDate, page: number, prefix: FeedContinuationPrefix): string {
  return `${feedPageApiHref(query, today, page)}&leagues=0&prefix=${prefix.firstPage}%3A${prefix.hash}`;
}
export function supportsFeedWindow(firstPage: number, through: number, pageSize: number): boolean {
  return Number.isSafeInteger(firstPage) && firstPage >= 1 && Number.isSafeInteger(through)
    && through > firstPage && through <= feedQueryRules.maximumPage
    && Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= feedQueryRules.maximumPageSize
    && (through - firstPage + 1) * pageSize <= maximumFeedWindowRecords;
}
export function feedWindowApiHref(query: FeedQuery, today: ReportingDate, firstPage: number, through: number): string {
  return `${feedPageApiHref(query, today, firstPage)}&leagues=0&through=${through}`;
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
/** A stored window is complete through the requested page or the verified end of its cohort. */
export function checkedFeedWindow(value: unknown, query: FeedQuery, today: ReportingDate, firstPage: number, through: number): readonly MatchFeedResponse[] {
  if (!supportsFeedWindow(firstPage, through, query.pageSize) || !value || typeof value !== "object"
    || Object.keys(value).length !== 1 || !("pages" in value) || !Array.isArray(value.pages)
    || value.pages.length === 0 || value.pages.length > through - firstPage + 1) {
    throw new FeedPaginationError("invalid-response");
  }
  const first = checkedFeedPage(value.pages[0], query, today, firstPage);
  if (first.state === "data-unavailable") throw new FeedPaginationError("unavailable");
  const last = Math.max(firstPage, Math.min(through, first.totalPages));
  if (first.paginationVersion === null || value.pages.length !== last - firstPage + 1) {
    throw new FeedPaginationError("invalid-response");
  }
  const seen = new Set<string>();
  return value.pages.map<MatchFeedResponse>((raw, index) => {
    const page = index === 0 ? first : checkedFeedPage(raw, query, today, firstPage + index);
    if (page.state === "data-unavailable" || page.paginationVersion !== first.paginationVersion || page.total !== first.total
      || page.today !== first.today || page.asOf !== first.asOf || page.search?.exact !== first.search?.exact
      || page.performanceVersion !== first.performanceVersion || page.performanceScope !== first.performanceScope
      || page.access.tier !== first.access.tier || page.access.signedIn !== first.access.signedIn
      || page.nextPage !== (page.page < Math.min(first.totalPages, feedQueryRules.maximumPage) ? page.page + 1 : null)
      || page.previousPage !== (page.page > 1 ? Math.max(1, Math.min(page.page - 1, first.totalPages)) : null)) {
      throw new FeedPaginationError("invalid-response");
    }
    for (const record of page.records) {
      if (seen.has(record.fixtureId)) throw new FeedPaginationError("invalid-response");
      seen.add(record.fixtureId);
    }
    return page;
  });
}
export function initialLoadedFeed(data: MatchFeedResponse): LoadedFeed {
  return { data, records: data.records, firstPage: data.page, lastPage: data.page, pages: 1 };
}
/** All membership and whole-record replacements commit together, never partially. */
export function appendFeedPage(view: LoadedFeed, page: MatchFeedResponse, prefixVerified = false): LoadedFeed {
  if (view.data.access.tier !== page.access.tier || view.data.access.signedIn !== page.access.signedIn) throw new FeedPaginationError("changed");
  if (page.page !== view.data.nextPage || page.page !== view.lastPage + 1) {
    throw new FeedPaginationError("invalid-response");
  }
  if (page.paginationVersion === null || !prefixVerified && (view.data.paginationVersion === null
    || page.paginationVersion !== view.data.paginationVersion || page.total !== view.data.total || page.search?.exact !== view.data.search?.exact)) {
    throw new FeedPaginationError("changed");
  }
  const known = new Set(view.records.map((record) => record.fixtureId));
  // Overlap under an allegedly stable cohort is unsafe: dedup alone could hide a gap.
  for (const record of page.records) {
    if (known.has(record.fixtureId)) throw new FeedPaginationError("changed");
    known.add(record.fixtureId);
  }
  const data = page.asOf >= view.data.asOf ? page : { ...page, asOf: view.data.asOf, run: view.data.run };
  return { ...view, data, records: [...view.records, ...page.records], lastPage: page.page, pages: view.pages + 1 };
}
export function replaceFeedPages(previous: LoadedFeed, pages: readonly MatchFeedResponse[]): LoadedFeed {
  if (pages.some((page) => page.access.tier !== previous.data.access.tier || page.access.signedIn !== previous.data.access.signedIn)) throw new FeedPaginationError("changed");
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

/** Recover one transient read and rebase a changed window without publishing partial membership. */
export async function continueFeedPages(view: LoadedFeed, read: (page: number) => Promise<MatchFeedResponse>,
  waitForRetry: (delayMs: number) => Promise<boolean>, { rebase = false, readWindow, readContinuation }: {
    rebase?: boolean;
    readWindow?: (() => Promise<readonly MatchFeedResponse[]>) | undefined;
    readContinuation?: (() => Promise<MatchFeedResponse>) | undefined;
  } = {}): Promise<LoadedFeed> {
  const nextPage = view.data.nextPage;
  if (nextPage === null) return view;
  let retried = false;
  const recover = async <T>(verified: () => Promise<T>) => {
    try { return await verified(); }
    catch (error) {
      if (retried || !(error instanceof FeedPaginationError) || error.code !== "unavailable") throw error;
      const delay = error.retryAfterMs ?? 500;
      if (delay > 5_000 || !await waitForRetry(delay)) throw error;
      retried = true;
      return verified();
    }
  };
  const readPage = (page: number, load = () => read(page)) => recover(async () => {
    const result = await load();
    if (result.state === "data-unavailable") throw new FeedPaginationError("unavailable");
    return result;
  });
  if (!rebase && (readContinuation || !readWindow)) {
    try { return appendFeedPage(view, await readPage(nextPage, readContinuation), Boolean(readContinuation)); }
    catch (error) {
      if (!(error instanceof FeedPaginationError) || error.code !== "changed") throw error;
    }
  }
  if (readWindow) return replaceFeedPages(view, await recover(readWindow));
  const pages = [await readPage(view.firstPage)];
  for (let page = view.firstPage + 1; page <= nextPage && pages.at(-1)?.nextPage === page; page++) {
    pages.push(await readPage(page));
  }
  return replaceFeedPages(view, pages);
}

/** One observation updates matching fixtures without applying partial offset membership. */
export function observeFeedPage(previous: LoadedFeed, page: MatchFeedResponse): LoadedFeed {
  if (page.page < previous.firstPage || page.page > previous.lastPage || page.asOf < previous.data.asOf
    || page.access.tier !== previous.data.access.tier || page.access.signedIn !== previous.data.access.signedIn) return previous;
  const observed = new Map(page.records.map((record) => [record.fixtureId, record]));
  const records = previous.records.map((record) => {
    const next = observed.get(record.fixtureId);
    if (!next) return record;
    const order = fixtureAdvance(record, next);
    return order > 0 ? next : order === 0 ? mergeFixtureObservation(record, next) : record;
  });
  return { ...previous, data: { ...previous.data, asOf: page.asOf, run: page.run },
    records: records.some((record, index) => record !== previous.records[index]) ? records : previous.records };
}

/** A single server page cannot replace an appended cohort. */
export function applyServerFeedPage(previous: LoadedFeed, page: MatchFeedResponse): LoadedFeed {
  if (page === previous.data || page.page !== previous.firstPage) return previous;
  if (page.access.tier !== previous.data.access.tier || page.access.signedIn !== previous.data.access.signedIn) return initialLoadedFeed(page);
  if (previous.pages > 1) return previous;
  try { return replaceFeedPages(previous, [page]); }
  catch (error) { if (error instanceof FeedPaginationError && error.code === "stale-data") return previous; throw error; }
}

import "server-only";

import { getPublicationDeadline, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock } from "../../domain/calendar.ts";
import { feedQueryRules, type FeedParameters } from "../../domain/feed-query.ts";
import { matchFeedResponseSchema, type MatchFeedResponse } from "../../domain/match-feed.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { buildSlips, slipBuilderRules, type SlipCriteria, type SlipMatchRecord } from "../../domain/slip-builder.ts";
import { slipPricePageSchema, type SlipPricePage } from "../../domain/slip-price-page.ts";
import type { SlipBuildPageResult } from "../../domain/slip-page.ts";
import { MatchFeedError } from "../matches/feed-error.ts";

export const slipReadRules = Object.freeze({ pageSize: feedQueryRules.maximumPageSize, maximumRecords: 500 });
export type { SlipBuildPageResult, SlipBuildState } from "../../domain/slip-page.ts";
export type SlipFeedReader = (parameters: FeedParameters, context: Readonly<{ locale?: string }>, clock: Clock) => Promise<MatchFeedResponse | SlipPricePage>;

/** One bounded stored cohort, never a provider request. Feed bounds apply to its best displayed family;
 * per-selection odds/probability bounds therefore belong to the builder, which considers every chosen family. */
export function createSlipBuildService(options: Readonly<{
  read: SlipFeedReader;
  consume: () => Promise<void>;
  clock?: Clock;
  /** Effective public odds policy. Tests alone override it to exercise priced stored projections. */
  providerOdds?: boolean;
}>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  return Object.freeze({ async query(criteria: SlipCriteria, locale = "en"): Promise<SlipBuildPageResult> {
    const asOf = clock.now(), pinnedClock: Clock = { now: () => asOf };
    const base: SlipBuildPageResult = { state: "data-unavailable", data: null, asOf, examined: 0,
      searchLimited: false, partialCoverage: false, retryAfterSeconds: null };
    // Check before any database, cache or limiter access: private prices cannot bypass the public policy.
    if (!(options.providerOdds ?? publicPolicy.features.providerOdds)) return { ...base, state: "odds-unavailable" };
    try {
      await options.consume();
      const today = getReportingDate(asOf), range = validateReportingDateRange(criteria.dateFrom, criteria.dateTo, slipBuilderRules.maximumDays);
      const parameters = new URLSearchParams({ from: criteria.dateFrom, to: criteria.dateTo,
        status: "scheduled", market: criteria.markets.join(","), sort: "probability", dir: "desc", pageSize: String(slipReadRules.pageSize) });
      if (criteria.timeFrom !== "" || criteria.timeTo !== "") {
        parameters.set("timeFrom", criteria.timeFrom); parameters.set("timeTo", criteria.timeTo); parameters.set("tz", publicPolicy.reportingTimeZone);
      }
      const records: SlipMatchRecord[] = [], pages: SlipPricePage[] = [], seen = new Set<string>();
      let first: MatchFeedResponse | null = null, partialCoverage = false, searchLimited = false;
      const checked = async (pageNumber: number) => {
        const query = new URLSearchParams(parameters); query.set("page", String(pageNumber));
        const value = await options.read(query, { locale }, pinnedClock);
        // Production supplements the ordinary feed with full approved outcome prices. Legacy injected
        // readers remain useful with only selected-pick prices; the regular feed contract is unchanged.
        const source = "feed" in value ? slipPricePageSchema.parse(value) : (() => {
          const feed = matchFeedResponseSchema.parse(value);
          return slipPricePageSchema.parse({ feed, selectionPrices: Object.fromEntries(feed.records.map((record) => [record.fixtureId, record.prices])) });
        })();
        const page = source.feed;
        if (page.page !== pageNumber || page.pageSize !== slipReadRules.pageSize || page.paginationVersion === null ||
          page.asOf !== asOf || page.today !== today || page.range.from !== range.startDate || page.range.to !== range.endDate ||
          page.range.startInclusive !== range.window.startInclusive || page.range.endExclusive !== range.window.endExclusive ||
          first && (page.paginationVersion !== first.paginationVersion || page.total !== first.total) || page.state === "data-unavailable") {
          throw new MatchFeedError("unavailable");
        }
        return source;
      };
      let pageNumber = 1;
      while (records.length < slipReadRules.maximumRecords) {
        const source = await checked(pageNumber), page = source.feed;
        first ??= page;
        pages.push(source);
        partialCoverage ||= page.coverage.partial;
        for (const record of page.records) {
          if (seen.has(record.fixtureId)) throw new MatchFeedError("unavailable");
          seen.add(record.fixtureId); records.push({ ...record, selectionPrices: source.selectionPrices[record.fixtureId]! });
        }
        if (page.nextPage === null) break;
        if (records.length >= slipReadRules.maximumRecords) { searchLimited = true; break; }
        pageNumber = page.nextPage;
      }
      // Generation stamps cover catalog, publication and public-price changes. Progress-only flags can
      // change without moving that stamp, so re-probe every loaded page and reject any record drift.
      // At most five pages are loaded and five rechecked. These sequential reads are deliberately not
      // claimed to be one atomic global snapshot; a changing cohort produces no partial output.
      for (const source of pages) {
        const latest = await checked(source.feed.page);
        if (JSON.stringify(latest.feed.records) !== JSON.stringify(source.feed.records)
          || JSON.stringify(latest.selectionPrices) !== JSON.stringify(source.selectionPrices)) throw new MatchFeedError("unavailable");
      }
      const completedAt = clock.now();
      if (completedAt < asOf || getReportingDate(completedAt) !== today) throw new MatchFeedError("unavailable");
      // The scan can take time. Retain the original observation cutoff, but exclude matches that
      // have entered the publication/kickoff cutoff by completion, even if their first page was valid.
      const current = records.filter((record) => record.kickoffAt === null || completedAt < getPublicationDeadline(record.kickoffAt));
      const data = buildSlips(criteria, current, asOf);
      return { ...base, state: data.slips.length > 0 ? "generated" : data.qualifyingMatches === 0 ? "no-qualifying" : "no-combinations",
        data, asOf: completedAt, examined: records.length, searchLimited: searchLimited || data.searchLimited, partialCoverage };
    } catch (error) {
      return { ...base, state: error instanceof MatchFeedError && error.code === "rate-limited" ? "rate-limited" : "data-unavailable",
        retryAfterSeconds: error instanceof MatchFeedError ? error.retryAfterSeconds : null };
    }
  } });
}

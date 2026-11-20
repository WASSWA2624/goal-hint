import "server-only";

import { getReportingDate, type Clock } from "../../domain/calendar.ts";
import { matchFeedPageDefaults, parseFeedQuery, resolveFeedDates, type PicksFilter } from "../../domain/feed-query.ts";
import { performanceFeedQuery } from "../../domain/feed-performance-summary.ts";
import { feedPerformanceSchema } from "../../domain/match-feed.ts";
import { feedPerformanceCacheKey } from "../matches/feed-performance.ts";
import { feedSql } from "../matches/feed-read.ts";
import { publicMatchProjection, readPublicMatchFeedSummary } from "../matches/public-feed.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";

/** Validate the ordinary page/API summaries before the demo server opens.
 * One captured clock keeps later preparation from invalidating earlier fills. */
export async function warmDemoFeedSummaries(clock: Clock, competitionIds: readonly number[],
  read: typeof readPublicMatchFeedSummary = readPublicMatchFeedSummary,
  pagePicks: PicksFilter = matchFeedPageDefaults.picks): Promise<void> {
  const asOf = clock.now(), today = getReportingDate(asOf), warmClock = { now: () => asOf }, seen = new Set<string>();
  const providerOdds = publicOddsEnabled();
  for (const parameters of [new URLSearchParams({ picks: pagePicks }), new URLSearchParams()]) {
    const query = performanceFeedQuery(parseFeedQuery(parameters, { today, asOf, providerOdds }));
    const key = feedPerformanceCacheKey(feedSql(query, resolveFeedDates(query, today), competitionIds,
      providerOdds, null, false, publicMatchProjection.publishedOnly, null, publicMatchProjection.publishedForecasts), query.locale, providerOdds);
    if (seen.has(key)) continue;
    const result = await read(parameters, { locale: query.locale }, warmClock);
    const performance = feedPerformanceSchema.safeParse(result.performance);
    if (!performance.success || performance.data.total !== result.total) throw new Error("The validated default match summary is not ready.");
    seen.add(key);
  }
}

import "server-only";

import { getReportingDate, type Clock } from "../../domain/calendar.ts";
import { defaultPagePicks, parseFeedQuery, resolveFeedDates } from "../../domain/feed-query.ts";
import { feedPerformanceSchema } from "../../domain/match-feed.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { feedPerformanceCacheKey } from "../matches/feed-performance.ts";
import { feedSql } from "../matches/feed-read.ts";
import { readPublicMatchFeedSummary } from "../matches/public-feed.ts";

/** Validate the ordinary page/API summaries before the demo server opens.
 * One captured clock keeps later preparation from invalidating earlier fills. */
export async function warmDemoFeedSummaries(clock: Clock, competitionIds: readonly number[],
  read: typeof readPublicMatchFeedSummary = readPublicMatchFeedSummary,
  pagePicks = defaultPagePicks("all")): Promise<void> {
  const asOf = clock.now(), today = getReportingDate(asOf), warmClock = { now: () => asOf }, seen = new Set<string>();
  for (const parameters of [new URLSearchParams({ picks: pagePicks }), new URLSearchParams()]) {
    const query = parseFeedQuery(parameters, { today, asOf, providerOdds: publicPolicy.features.providerOdds });
    const key = feedPerformanceCacheKey(feedSql(query, resolveFeedDates(query, today), competitionIds), query.locale, publicPolicy.features.providerOdds);
    if (seen.has(key)) continue;
    const result = await read(parameters, { locale: query.locale }, warmClock);
    const performance = feedPerformanceSchema.safeParse(result.performance);
    if (!performance.success || performance.data.total !== result.total) throw new Error("The validated default match summary is not ready.");
    seen.add(key);
  }
}

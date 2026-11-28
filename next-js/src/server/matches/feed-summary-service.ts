import "server-only";

import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock } from "../../domain/calendar.ts";
import { getDayBoundsInTimeZone } from "../../domain/device-calendar.ts";
import { feedPerformanceReplySchema, performanceFeedQuery } from "../../domain/feed-performance-summary.ts";
import { activeFeedFilterCount, feedQueryRules, getFeedToday, maximumCompetitionScope, resolveFeedDates, type FeedParameters } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { prepareDemoRange } from "../demo/read-seed.ts";
import { timedRequestPhase } from "../http/request-timing.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { isDefaultFeaturedScope } from "./default-featured-scope.ts";
import { MatchFeedError } from "./feed-error.ts";
import { feedPerformanceCacheKey, readFeedPerformance } from "./feed-performance.ts";
import { feedSql, historicalFeedCutoff } from "./feed-read.ts";
import { readFeedResultOverrides } from "./feed-result-filter.ts";
import { storedFeedSearch } from "./feed-search.ts";
import { parseMatchFeedQuery, storedFeedVersions, type MatchFeedReadContext } from "./feed-service.ts";
import { createMysqlPublicSearchLimiter } from "./search-limit.ts";

const storedSummarySchema = feedPerformanceReplySchema.omit({ access: true }).extend({
  total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).refine((value) => value.performance.total === value.total);
const todaySummaryLeaseMs = 30_000;

/** Aggregate reads share the feed's scope, ranking, audit and invalidation rules, without hydrating a discarded page. */
export function createMatchFeedSummaryService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[];
  clock?: Clock; cache?: PublicResponseCache; providerOdds?: boolean }>) {
  const configured = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(maximumCompetitionScope).safeParse(options.competitionIds);
  if (!configured.success || new Set(configured.data).size !== configured.data.length) throw new MatchFeedError("unavailable");
  const { cache, database } = options, competitionIds = Object.freeze(configured.data);
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const providerOdds = options.providerOdds ?? publicPolicy.features.providerOdds;
  return Object.freeze({ async query(input: FeedParameters, context: MatchFeedReadContext = {}) {
    const publishedOnly = context.publishedOnly === true;
    const publishedForecasts = context.publishedForecasts ?? publishedOnly;
    const asOf = clock.now(), reportingToday = getReportingDate(asOf);
    const query = performanceFeedQuery(parseMatchFeedQuery(input, reportingToday, { ...context, providerOdds, asOf }));
    const today = getFeedToday(query, asOf), range = resolveFeedDates(query, today);
    const historyBefore = publishedOnly ? historicalFeedCutoff(query, range, today) : null;
    const sourceRange = validateReportingDateRange(getReportingDate(range.window.startInclusive),
      getReportingDate(utcInstantFromEpochMilliseconds(range.window.endExclusive - 1)), feedQueryRules.maximumDays + 2);
    try {
      await prepareDemoRange(database, sourceRange, asOf);
      if (query.search) await createMysqlPublicSearchLimiter(database).consume();
      const read = () => timedRequestPhase("summary-transaction", () => database.transaction(async (tx) => {
        const { performanceVersion: paginationVersion, performanceScope } = await timedRequestPhase("summary-generation",
          () => storedFeedVersions(tx, query, today, sourceRange, competitionIds, context.completedOnly,
            publishedOnly, historyBefore, providerOdds, publishedForecasts));
        const search = await storedFeedSearch(tx, query.search, range, competitionIds, query.locale, context.completedOnly);
        const sql = feedSql(query, range, competitionIds, providerOdds, search, context.completedOnly, publishedOnly, historyBefore, publishedForecasts);
        const overrides = await timedRequestPhase("summary-membership",
          () => readFeedResultOverrides(tx, sql, { publishedForecasts, useDefaultFeatured: isDefaultFeaturedScope(query) }));
        const [matching] = await timedRequestPhase("summary-count", () => tx.$queryRaw<{ total: bigint; available: bigint | Prisma.Decimal | null; void: bigint | Prisma.Decimal | null; cancelled: bigint | Prisma.Decimal | null }[]>(Prisma.sql`
          SELECT STRAIGHT_JOIN COUNT(*) AS total, SUM(CASE WHEN ${sql.pickAvailable} THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN ${sql.pickAvailable} AND c.state='void' AND f.status<>'canceled' THEN 1 ELSE 0 END) AS void,
            SUM(CASE WHEN ${sql.pickAvailable} AND c.state='void' AND f.status='canceled' THEN 1 ELSE 0 END) AS cancelled
          ${sql.countJoins} ${sql.searchJoin} WHERE ${sql.where}`));
        if (!matching) throw new MatchFeedError("unavailable");
        const total = Number(matching.total);
        const performance = await timedRequestPhase("summary-settlements", () => readFeedPerformance(tx, sql,
          { total, available: Number(matching.available ?? 0), void: Number(matching.void ?? 0), cancelled: Number(matching.cancelled ?? 0) },
          cache ? { key: feedPerformanceCacheKey(sql, query.locale, providerOdds), nowMs: asOf } : undefined, undefined, overrides));
        return freezeEvidence(storedSummarySchema.parse({ performance, total, paginationVersion, performanceScope, asOf }));
      }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 90_000 }));
      if (!cache) return await read();
      const descriptor = publicCacheDescriptor({ kind: "feed", locale: query.locale, now: asOf, range: sourceRange,
        deadlineAt: getDayBoundsInTimeZone(today, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone).endExclusive,
        query: { ...query, projection: "feed-summary-v15", providerOdds, completedOnly: context.completedOnly === true,
          publishedOnly, publishedForecasts, today, dates: { from: range.startDate, to: range.endDate } },
        scope: [...competitionIds].sort((a, b) => a - b), parse: (value) => storedSummarySchema.parse(value) });
      // The public Today audit is shared by the busiest entry point. Keep its
      // original clock, generation checks, and reporting-day cutoff.
      const publicToday = publishedForecasts && !publishedOnly && !context.completedOnly && !query.zone && !query.summary &&
        range.dayCount === 1 && range.startDate === reportingToday && activeFeedFilterCount(query) === 0;
      return await timedRequestPhase("summary-cache",
        () => cache.read(publicToday ? { ...descriptor, lifetimeMs: todaySummaryLeaseMs } : descriptor, read));
    } catch (error) {
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  } });
}

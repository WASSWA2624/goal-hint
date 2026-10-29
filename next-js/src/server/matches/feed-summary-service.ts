import "server-only";

import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock } from "../../domain/calendar.ts";
import { getDayBoundsInTimeZone } from "../../domain/device-calendar.ts";
import { feedPerformanceReplySchema } from "../../domain/feed-performance-summary.ts";
import { feedQueryRules, getFeedToday, maximumCompetitionScope, resolveFeedDates, type FeedParameters } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { prepareDemoRange } from "../demo/read-seed.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { MatchFeedError } from "./feed-error.ts";
import { feedPerformanceCacheKey, readFeedPerformance } from "./feed-performance.ts";
import { feedSql } from "./feed-read.ts";
import { storedFeedSearch } from "./feed-search.ts";
import { parseMatchFeedQuery, storedFeedPaginationVersion } from "./feed-service.ts";
import { createMysqlPublicSearchLimiter } from "./search-limit.ts";

const storedSummarySchema = feedPerformanceReplySchema.omit({ access: true }).extend({
  total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).refine((value) => value.performance.total === value.total);

/** Aggregate reads share the feed's scope, ranking, audit and invalidation rules, without hydrating a discarded page. */
export function createMatchFeedSummaryService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[];
  clock?: Clock; cache?: PublicResponseCache; providerOdds?: boolean }>) {
  const configured = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(maximumCompetitionScope).safeParse(options.competitionIds);
  if (!configured.success || new Set(configured.data).size !== configured.data.length) throw new MatchFeedError("unavailable");
  const { database } = options, competitionIds = Object.freeze(configured.data);
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const providerOdds = options.providerOdds ?? publicPolicy.features.providerOdds;
  return Object.freeze({ async query(input: FeedParameters, context: Readonly<{ locale?: string; routeDate?: string }> = {}) {
    const asOf = clock.now(), reportingToday = getReportingDate(asOf);
    const query = parseMatchFeedQuery(input, reportingToday, { ...context, providerOdds, asOf });
    const today = getFeedToday(query, asOf), range = resolveFeedDates(query, today);
    const sourceRange = validateReportingDateRange(getReportingDate(range.window.startInclusive),
      getReportingDate(utcInstantFromEpochMilliseconds(range.window.endExclusive - 1)), feedQueryRules.maximumDays + 2);
    try {
      await prepareDemoRange(database, sourceRange, asOf);
      if (query.search) await createMysqlPublicSearchLimiter(database).consume();
      const read = () => database.transaction(async (tx) => {
        const paginationVersion = await storedFeedPaginationVersion(tx, query, today, sourceRange, competitionIds);
        const search = await storedFeedSearch(tx, query.search, range, competitionIds, query.locale);
        const sql = feedSql(query, range, competitionIds, providerOdds, search);
        const [matching] = await tx.$queryRaw<{ total: bigint; available: bigint | Prisma.Decimal | null; void: bigint | Prisma.Decimal | null }[]>(Prisma.sql`
          SELECT STRAIGHT_JOIN COUNT(*) AS total, SUM(CASE WHEN m.available=TRUE THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN m.available=TRUE AND c.state='void' THEN 1 ELSE 0 END) AS void
          ${sql.countJoins} ${sql.searchJoin} WHERE ${sql.where}`);
        if (!matching) throw new MatchFeedError("unavailable");
        const total = Number(matching.total);
        const performance = await readFeedPerformance(tx, sql, { total, available: Number(matching.available ?? 0), void: Number(matching.void ?? 0) },
          options.cache ? { key: feedPerformanceCacheKey(sql, query.locale, providerOdds), nowMs: asOf } : undefined);
        return freezeEvidence(storedSummarySchema.parse({ performance, total, paginationVersion, asOf }));
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 90_000 });
      return options.cache ? await options.cache.read(publicCacheDescriptor({ kind: "feed", locale: query.locale, now: asOf, range: sourceRange,
        deadlineAt: getDayBoundsInTimeZone(today, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone).endExclusive,
        query: { ...query, page: 1, projection: "feed-summary-v1", today, dates: { from: range.startDate, to: range.endDate } },
        scope: [...competitionIds].sort((a, b) => a - b), parse: (value) => storedSummarySchema.parse(value) }), read) : await read();
    } catch (error) {
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  } });
}

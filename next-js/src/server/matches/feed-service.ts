import "server-only";

import { z } from "zod";
import { getDayBoundsInTimeZone } from "../../domain/device-calendar.ts";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock, type ReportingDate } from "../../domain/calendar.ts";
import { feedQueryKey, getFeedToday, parseFeedQuery, resolveFeedDates, serializeFeedQuery, feedQueryRules, maximumCompetitionScope, type FeedParameters, type FeedQuery } from "../../domain/feed-query.ts";
import { matchFeedRules, storedMatchFeedResponseSchema, type StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import { createMessages, type TextKey } from "../../i18n/messages.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { MatchFeedError } from "./feed-error.ts";
import { createMysqlPublicSearchLimiter } from "./search-limit.ts";
import { feedSql, storedFeedCoverage, storedFeedRunContext } from "./feed-read.ts";
import { storedFeedSearch } from "./feed-search.ts";
import { storedFeedFixture } from "./fixture-read.ts";
import { readFeedPerformance } from "./feed-performance.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import { readPublicCacheGenerations } from "../cache/mysql-public-cache.ts";
import { prepareDemoRange } from "../demo/read-seed.ts";

export function parseMatchFeedQuery(input: FeedParameters, today: ReportingDate,
  context: Readonly<{ locale?: string; routeDate?: string; providerOdds?: boolean; asOf?: number }> = {}) {
  try {
    if (input instanceof URLSearchParams && Buffer.byteLength(input.toString(), "utf8") > matchFeedRules.maximumQueryBytes) throw new Error();
    const query = parseFeedQuery(input, { ...context, today }), range = resolveFeedDates(query, today, context.asOf);
    if (new Date(range.window.startInclusive).getUTCFullYear() < 1000) throw new Error();
    return query;
  } catch { throw new MatchFeedError("invalid-query"); }
}
function pageLink(query: FeedQuery, today: ReportingDate, number: number | null): string | null {
  if (number === null) return null;
  const dates = resolveFeedDates(query, today);
  // Pin relative dates so next/previous links keep their range across midnight.
  return `/api/matches?${serializeFeedQuery({ ...query, page: number, dates: dates.dayCount === 1
    ? { kind: "date", date: dates.startDate } : { kind: "range", from: dates.startDate, to: dates.endDate } }, today)}`;
}

/** `providerOdds` defaults to publicPolicy.features.providerOdds (off until odds display rights are recorded);
 * isolated tests may enable it to exercise the odds filter and prices. */
export function createMatchFeedService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[]; clock?: Clock; cache?: PublicResponseCache;
  providerOdds?: boolean }>) {
  const parsedIds = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(maximumCompetitionScope).safeParse(options.competitionIds);
  if (!parsedIds.success || new Set(parsedIds.data).size !== parsedIds.data.length) throw new MatchFeedError("unavailable");
  const { database } = options, competitionIds = Object.freeze(parsedIds.data), limiter = createMysqlPublicSearchLimiter(database);
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const providerOdds = options.providerOdds ?? publicPolicy.features.providerOdds;
  return Object.freeze({ async query(input: FeedParameters, context: Readonly<{ locale?: string; routeDate?: string }> = {}): Promise<StoredMatchFeedResponse> {
    const asOf = clock.now(), reportingToday = getReportingDate(asOf);
    const query = parseMatchFeedQuery(input, reportingToday, { ...context, providerOdds, asOf });
    const today = getFeedToday(query, asOf), range = resolveFeedDates(query, today);
    const messages = createMessages(query.locale);
    // Provider receipts and invalidations are keyed by EAT dates, which can straddle local dates.
    const sourceRange = validateReportingDateRange(getReportingDate(range.window.startInclusive),
      getReportingDate(utcInstantFromEpochMilliseconds(range.window.endExclusive - 1)), feedQueryRules.maximumDays + 2);
    try {
      await prepareDemoRange(database, sourceRange, asOf);
      if (query.search) await limiter.consume();
      const read = () => database.transaction(async (tx) => {
        // Source writes and these generations commit atomically. Progress-only
        // changes do not reorder a cohort; catalog/date changes conservatively do.
        const tags = ["global:catalog", ...Array.from({ length: sourceRange.dayCount }, (_, day) => `date:${addReportingDays(sourceRange.startDate, day)}`)];
        const paginationVersion = evidenceFingerprint({ contract: "feed-pagination-v4", query: feedQueryKey(query, today),
          scope: [...competitionIds].sort((a, b) => a - b), generations: await readPublicCacheGenerations(tx, tags) });
        const search = await storedFeedSearch(tx, query.search, range, competitionIds, query.locale);
        const sql = feedSql(query, range, competitionIds, providerOdds, search);
        const [known] = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${sql.cohortJoins} WHERE ${sql.scope}`);
        // Options cover the entire date cohort, independently of applied filters/page.
        const leagueRows = await tx.$queryRaw<{ id: string; name: string | null; country: string | null; logoUrl: string | null; fixtures: bigint }[]>(Prisma.sql`
          SELECT l.id, l.name, l.country, l.logoUrl, COUNT(*) AS fixtures ${sql.cohortJoins} WHERE ${sql.scope}
          GROUP BY l.id, l.name, l.country, l.logoUrl ORDER BY l.name, l.country, l.id LIMIT 1001`);
        const leagues = leagueRows.map((row) => ({ id: row.id, name: row.name, country: row.country,
          logoUrl: isSafeRemoteImageUrl(row.logoUrl) ? row.logoUrl : null, fixtures: Number(row.fixtures) }));
        const [matching] = await tx.$queryRaw<{ total: bigint; available: bigint | Prisma.Decimal | null; void: bigint | Prisma.Decimal | null; exact: bigint | Prisma.Decimal | null }[]>(Prisma.sql`
          SELECT COUNT(*) AS total, SUM(CASE WHEN m.available=TRUE THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN m.available=TRUE AND c.state='void' THEN 1 ELSE 0 END) AS void,
            ${sql.exact ? Prisma.sql`SUM(CASE WHEN ${sql.exact} THEN 1 ELSE 0 END)` : Prisma.sql`NULL`} AS exact
          ${sql.joins} ${sql.searchJoin} WHERE ${sql.where}`);
        if (!known || !matching) throw new MatchFeedError("unavailable");
        const total = Number(matching.total), knownFixtures = Number(known.total), matchingWithMarket = Number(matching.available ?? 0);
        const performance = await readFeedPerformance(tx, sql, { total, available: matchingWithMarket, void: Number(matching.void ?? 0) });
        // Exact matches precede similar results, so a record's position on its page tells which kind it is.
        const exactMatches = sql.exact ? Number(matching.exact ?? 0) : null;
        const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT f.id ${sql.joins} ${sql.searchJoin} WHERE ${sql.where}
          ORDER BY ${sql.order} LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
        const dates = await storedFeedCoverage(tx, sourceRange), partial = dates.some((date) => !date.authoritative);
        const { run, window } = await storedFeedRunContext(tx, reportingToday, range);
        if (run?.phase === "updating") run.message = messages.text("feed.updating");
        // Independent fixture reads share this one repeatable-read snapshot.
        // Starting them together also lets Prisma coalesce matching unique lookups.
        const records = await Promise.all(rows.map(async ({ id }) => {
          const record = await storedFeedFixture(tx, id, false, window, query.locale, { prices: providerOdds });
          const date = record.kickoffAt === null ? null : getReportingDate(record.kickoffAt);
          record.partialCoverage = dates.find((entry) => entry.date === date)?.authoritative !== true;
          return record;
        }));
        const totalPages = Math.ceil(total / query.pageSize);
        const nextPage = query.page < totalPages && query.page < feedQueryRules.maximumPage ? query.page + 1 : null;
        const previousPage = query.page > 1 ? Math.max(1, Math.min(query.page - 1, totalPages)) : null;
        const state = knownFixtures === 0 ? partial ? "data-unavailable" : "no-fixtures"
          : total === 0 ? "no-filter-matches" : records.length === 0 ? "page-out-of-range" : matchingWithMarket === 0 ? "insufficient-data" : "ready";
        const keys: Partial<Record<typeof state, TextKey>> = { "data-unavailable": "feed.dataUnavailable", "no-fixtures": "feed.noFixtures",
          "no-filter-matches": "feed.noFilterMatches", "page-out-of-range": "feed.pageOutOfRange", "insufficient-data": "feed.insufficientData" };
        const response = storedMatchFeedResponseSchema.parse({ performance, paginationVersion, leagues, records, page: query.page, nextPage, previousPage, pageSize: query.pageSize, total, totalPages,
          links: { next: pageLink(query, today, nextPage), previous: pageLink(query, today, previousPage) }, asOf, today,
          range: { from: range.startDate, to: range.endDate, ...range.window }, state, message: keys[state] ? messages.text(keys[state]!) : null,
          coverage: { partial, knownFixtures, matchingWithMarket, dates }, run,
          search: query.search ? { exact: exactMatches ?? 0, similar: total - (exactMatches ?? 0) } : null });
        if (Buffer.byteLength(JSON.stringify(response), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
        return freezeEvidence(response);
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
      return options.cache ? await options.cache.read(publicCacheDescriptor({ kind: "feed", locale: query.locale, now: asOf, range: sourceRange,
        deadlineAt: getDayBoundsInTimeZone(today, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone).endExclusive,
        query: { ...query, projection: 15, today, dates: { from: range.startDate, to: range.endDate } }, scope: [...competitionIds].sort((a, b) => a - b),
        parse: (value) => storedMatchFeedResponseSchema.parse(value) }), read) : await read();
    } catch (error) {
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  } });
}

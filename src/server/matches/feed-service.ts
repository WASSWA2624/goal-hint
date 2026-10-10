import "server-only";

import { z } from "zod";
import { addReportingDays, createPredictionWindow, getReportingDate, utcInstantFromEpochMilliseconds, type Clock, type ReportingDate } from "../../domain/calendar.ts";
import { feedQueryKey, parseFeedQuery, resolveFeedDates, serializeFeedQuery, feedQueryRules, type FeedParameters, type FeedQuery } from "../../domain/feed-query.ts";
import { matchFeedRules, matchFeedResponseSchema, type MatchFeedResponse } from "../../domain/match-feed.ts";
import { createMessages, type TextKey } from "../../i18n/messages.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { MatchFeedError } from "./feed-error.ts";
import { createMysqlPublicSearchLimiter } from "./search-limit.ts";
import { feedSql, storedFeedCoverage, storedFeedRun } from "./feed-read.ts";
import { storedFeedFixture } from "./fixture-read.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import { readPublicCacheGenerations } from "../cache/mysql-public-cache.ts";

export function parseMatchFeedQuery(input: FeedParameters, today: ReportingDate, context: Readonly<{ locale?: string; routeDate?: string }> = {}) {
  try {
    if (input instanceof URLSearchParams && Buffer.byteLength(input.toString(), "utf8") > matchFeedRules.maximumQueryBytes) throw new Error();
    const query = parseFeedQuery(input, { ...context, today }), range = resolveFeedDates(query, today);
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

export function createMatchFeedService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[]; clock?: Clock; cache?: PublicResponseCache }>) {
  const parsedIds = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(1000).safeParse(options.competitionIds);
  if (!parsedIds.success || new Set(parsedIds.data).size !== parsedIds.data.length) throw new MatchFeedError("unavailable");
  const { database } = options, competitionIds = Object.freeze(parsedIds.data), limiter = createMysqlPublicSearchLimiter(database);
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  return Object.freeze({ async query(input: FeedParameters, context: Readonly<{ locale?: string; routeDate?: string }> = {}): Promise<MatchFeedResponse> {
    const asOf = clock.now(), today = getReportingDate(asOf), query = parseMatchFeedQuery(input, today, context);
    const range = resolveFeedDates(query, today), window = createPredictionWindow(today), messages = createMessages(query.locale);
    try {
      if (query.search) await limiter.consume();
      const read = () => database.transaction(async (tx) => {
        // Source writes and these generations commit atomically. Progress-only
        // changes do not reorder a cohort; catalog/date changes conservatively do.
        const tags = ["global:catalog", ...Array.from({ length: range.dayCount }, (_, day) => `date:${addReportingDays(range.startDate, day)}`)];
        const paginationVersion = evidenceFingerprint({ contract: "feed-pagination-v1", query: feedQueryKey(query, today),
          scope: [...competitionIds].sort((a, b) => a - b), generations: await readPublicCacheGenerations(tx, tags) });
        const sql = feedSql(query, range, competitionIds);
        const [known] = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${sql.joins} WHERE ${sql.scope}`);
        // Options cover the entire date cohort, independently of applied filters/page.
        const leagues = await tx.$queryRaw<MatchFeedResponse["leagues"]>(Prisma.sql`
          SELECT DISTINCT l.id, l.name, l.country ${sql.joins} WHERE ${sql.scope}
          ORDER BY l.name, l.country, l.id LIMIT 1001`);
        const [matching] = await tx.$queryRaw<{ total: bigint; available: bigint | Prisma.Decimal | null }[]>(Prisma.sql`
          SELECT COUNT(*) AS total, SUM(CASE WHEN m.available=TRUE THEN 1 ELSE 0 END) AS available ${sql.joins} WHERE ${sql.where}`);
        if (!known || !matching) throw new MatchFeedError("unavailable");
        const total = Number(matching.total), knownFixtures = Number(known.total), matchingWithMarket = Number(matching.available ?? 0);
        const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT f.id ${sql.joins} WHERE ${sql.where}
          ORDER BY ${sql.order} LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
        const dates = await storedFeedCoverage(tx, range), partial = dates.some((date) => !date.authoritative);
        const run = await storedFeedRun(tx, today, range);
        if (run?.phase === "updating") run.message = messages.text("feed.updating");
        const records = [];
        for (const { id } of rows) {
          const record = await storedFeedFixture(tx, id, false, window, query.locale);
          const date = record.kickoffAt === null ? null : getReportingDate(record.kickoffAt);
          record.partialCoverage = dates.find((entry) => entry.date === date)?.authoritative !== true;
          records.push(record);
        }
        const totalPages = Math.ceil(total / query.pageSize);
        const nextPage = query.page < totalPages && query.page < feedQueryRules.maximumPage ? query.page + 1 : null;
        const previousPage = query.page > 1 ? Math.max(1, Math.min(query.page - 1, totalPages)) : null;
        const state = knownFixtures === 0 ? partial ? "data-unavailable" : "no-fixtures"
          : total === 0 ? "no-filter-matches" : records.length === 0 ? "page-out-of-range" : matchingWithMarket === 0 ? "insufficient-data" : "ready";
        const keys: Partial<Record<typeof state, TextKey>> = { "data-unavailable": "feed.dataUnavailable", "no-fixtures": "feed.noFixtures",
          "no-filter-matches": "feed.noFilterMatches", "page-out-of-range": "feed.pageOutOfRange", "insufficient-data": "feed.insufficientData" };
        const response = matchFeedResponseSchema.parse({ paginationVersion, leagues, records, page: query.page, nextPage, previousPage, pageSize: query.pageSize, total, totalPages,
          links: { next: pageLink(query, today, nextPage), previous: pageLink(query, today, previousPage) }, asOf, today,
          range: { from: range.startDate, to: range.endDate, ...range.window }, state, message: keys[state] ? messages.text(keys[state]!) : null,
          coverage: { partial, knownFixtures, matchingWithMarket, dates }, run });
        if (Buffer.byteLength(JSON.stringify(response), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
        return freezeEvidence(response);
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
      return options.cache ? await options.cache.read(publicCacheDescriptor({ kind: "feed", locale: query.locale, now: asOf, range,
        query: { ...query, projection: 4, dates: { from: range.startDate, to: range.endDate } }, scope: [...competitionIds].sort((a, b) => a - b),
        parse: (value) => matchFeedResponseSchema.parse(value) }), read) : await read();
    } catch (error) {
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  } });
}

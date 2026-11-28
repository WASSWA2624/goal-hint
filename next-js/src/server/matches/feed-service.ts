import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { getDayBoundsInTimeZone } from "../../domain/device-calendar.ts";
import { feedContinuationEvidence, supportsFeedContinuation, type FeedContinuationPrefix, type FeedContinuationResult } from "../../domain/feed-continuation.ts";
import { isLocalFootballDevelopment } from "../../domain/development-demo.ts";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock, type ReportingDate, type ReportingDateRange } from "../../domain/calendar.ts";
import { activeFeedFilterCount, feedQueryKey, getFeedToday, parseFeedQuery, resolveFeedDates, serializeFeedQuery, feedQueryRules, maximumCompetitionScope, type FeedParameters, type FeedQuery } from "../../domain/feed-query.ts";
import { matchFeedRules, storedMatchFeedResponseSchema, type StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import { maximumFeedWindowRecords } from "../../domain/match-feed-rules.ts";
import { createMessages, type TextKey } from "../../i18n/messages.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { MatchFeedError } from "./feed-error.ts";
import { createMysqlPublicSearchLimiter } from "./search-limit.ts";
import { feedSql, historicalFeedCutoff, storedFeedCoverage, storedFeedRunContext } from "./feed-read.ts";
import { storedFeedSearch } from "./feed-search.ts";
import { storedFeedFixtures } from "./fixture-read.ts";
import { feedPerformanceCacheKey, readFeedPerformance, restrictFeedPredictionSql } from "./feed-performance.ts";
import { adjustPerformanceAvailability, filterFeedResult, readFeedResultOverrides, resultOverridesFor } from "./feed-result-filter.ts";
import { withFeedOdds, withUpcomingFeaturedOutcomes } from "./feed-odds.ts";
import { performanceFeedQuery } from "../../domain/feed-performance-summary.ts";
import { publicCacheDescriptor, publicCacheRules, type PublicResponseCache } from "../cache/public-cache.ts";
import { readPublicCacheGenerations } from "../cache/mysql-public-cache.ts";
import { prepareDemoRange } from "../demo/read-seed.ts";
import { timedRequestPhase } from "../http/request-timing.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { readNovemberReplayProjections } from "../intelligence/november-replay-store.ts";
import { displayFeedSelectedPick, lacksRetrospectiveFeaturedPick, projectRetrospectiveForecast } from "./retrospective-picks.ts";
import { selectedFeedPickColumns, type FeedSelectedPick } from "./feed-selected-picks.ts";
import { isDefaultFeaturedScope } from "./default-featured-scope.ts";
import { toFeaturedLocalDecision } from "./featured-pick-presentation.ts";
import { readFeaturedSettlements, type FeaturedSettlementPick } from "./featured-settlement.ts";
import { eligibleFrozenFeaturedStatus, readFrozenLocalFeaturedPicks } from "./frozen-featured-picks.ts";

const storedFeedWindowSchema = z.array(storedMatchFeedResponseSchema).min(1).max(maximumFeedWindowRecords);

export function parseMatchFeedQuery(input: FeedParameters, today: ReportingDate,
  context: Readonly<{ locale?: string; routeDate?: string; providerOdds?: boolean; asOf?: number }> = {}) {
  try {
    if (input instanceof URLSearchParams && Buffer.byteLength(input.toString(), "utf8") > matchFeedRules.maximumQueryBytes) throw new Error();
    const query = parseFeedQuery(input, { ...context, providerOdds: context.providerOdds ?? publicOddsEnabled(), today });
    const range = resolveFeedDates(query, today, context.asOf);
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

/** Derive list and aggregate revisions from one source snapshot and identify the aggregate cohort across revisions. */
export async function storedFeedVersions(tx: Prisma.TransactionClient, query: FeedQuery, today: ReportingDate,
  sourceRange: ReportingDateRange, competitionIds: readonly number[], completedOnly = false, publishedOnly = false,
  historyBefore: number | null = null, providerOdds = publicPolicy.features.providerOdds, publishedForecasts = publishedOnly, predictedMatchesOnly = false) {
  const tags = ["global:catalog", ...Array.from({ length: sourceRange.dayCount }, (_, day) => `date:${addReportingDays(sourceRange.startDate, day)}`)];
  const generations = await readPublicCacheGenerations(tx, tags);
  const projection = { completedOnly, publishedOnly, historyBefore, providerOdds, publishedForecasts,
    scope: [...competitionIds].sort((a, b) => a - b) };
  const performance = { ...projection, query: feedQueryKey(performanceFeedQuery(query), today) };
  return {
    paginationVersion: evidenceFingerprint({ contract: "feed-pagination-v13", ...projection, query: feedQueryKey(query, today),
      ...(predictedMatchesOnly ? { predictedOnly: true } : {}), generations }),
    performanceVersion: evidenceFingerprint({ contract: "feed-pagination-v13", ...performance, generations }),
    performanceScope: evidenceFingerprint({ contract: "feed-performance-scope-v1", ...performance }),
  };
}

export type MatchFeedReadContext = Readonly<{ locale?: string; routeDate?: string; completedOnly?: boolean;
  publishedOnly?: boolean; publishedForecasts?: boolean; predictedMatchesOnly?: boolean; continuation?: FeedContinuationPrefix }>;

/** Public readers supply their verified odds permission. */
export function createMatchFeedService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[]; clock?: Clock; cache?: PublicResponseCache;
  providerOdds?: boolean; includePerformance?: boolean; allowInPlayOdds?: boolean }>) {
  const parsedIds = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(maximumCompetitionScope).safeParse(options.competitionIds);
  if (!parsedIds.success || new Set(parsedIds.data).size !== parsedIds.data.length) throw new MatchFeedError("unavailable");
  const { cache, database } = options, competitionIds = Object.freeze(parsedIds.data), limiter = createMysqlPublicSearchLimiter(database);
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const providerOdds = options.providerOdds ?? publicPolicy.features.providerOdds;
  const allowInPlayOdds = options.allowInPlayOdds ?? isLocalFootballDevelopment();
  async function readPages(input: FeedParameters, context: MatchFeedReadContext, through?: number, rebaseOnDrift = false): Promise<StoredMatchFeedResponse[]> {
    const publishedOnly = context.publishedOnly === true;
    const publishedForecasts = context.publishedForecasts ?? publishedOnly;
    const predictedMatchesOnly = context.predictedMatchesOnly === true;
    const asOf = clock.now(), reportingToday = getReportingDate(asOf);
    const query = parseMatchFeedQuery(input, reportingToday, { ...context, providerOdds, asOf });
    const recordLimit = ((through ?? query.page) - query.page + 1) * query.pageSize;
    if (through !== undefined && (!Number.isSafeInteger(through) || through <= query.page || through > feedQueryRules.maximumPage ||
      recordLimit > maximumFeedWindowRecords)) throw new MatchFeedError("invalid-query");
    const offset = (query.page - 1) * query.pageSize;
    const continuation = context.continuation;
    if (continuation && (through !== undefined || !/^[a-f0-9]{64}$/u.test(continuation.hash)
      || !supportsFeedContinuation(continuation.firstPage, query.page, query.pageSize))) throw new MatchFeedError("invalid-query");
    const firstOffset = continuation ? (continuation.firstPage - 1) * query.pageSize : offset;
    const prefixLength = offset - firstOffset;
    const today = getFeedToday(query, asOf), range = resolveFeedDates(query, today);
    const historyBefore = publishedOnly ? historicalFeedCutoff(query, range, today) : null;
    const messages = createMessages(query.locale);
    // Provider receipts and invalidations are keyed by EAT dates, which can straddle local dates.
    const sourceRange = validateReportingDateRange(getReportingDate(range.window.startInclusive),
      getReportingDate(utcInstantFromEpochMilliseconds(range.window.endExclusive - 1)), feedQueryRules.maximumDays + 2);
    try {
      await prepareDemoRange(database, sourceRange, asOf);
      if (query.search) await limiter.consume();
      const readStoredPages = () => timedRequestPhase("list-transaction", () => database.transaction(async (tx) => {
        // Source writes (including live clock updates) and the generations commit atomically.
        const versions = await timedRequestPhase("list-generation", () => storedFeedVersions(tx, query, today, sourceRange,
          competitionIds, context.completedOnly, publishedOnly, historyBefore, providerOdds, publishedForecasts, predictedMatchesOnly));
        const search = await storedFeedSearch(tx, query.search, range, competitionIds, query.locale, context.completedOnly);
        const baseSql = feedSql(query, range, competitionIds, providerOdds, search, context.completedOnly, publishedOnly, historyBefore, publishedForecasts);
        const useDefaultFeatured = isDefaultFeaturedScope(query);
        const includeSettlements = Boolean(query.result || options.includePerformance !== false);
        let overrides = predictedMatchesOnly || includeSettlements ? await timedRequestPhase("list-membership",
          () => readFeedResultOverrides(tx, baseSql, { publishedForecasts, useDefaultFeatured, includeSettlements },
            cache ? { database, version: versions.performanceVersion, locale: query.locale, providerOdds } : undefined)) : new Map();
        const predictionSql = predictedMatchesOnly ? restrictFeedPredictionSql(baseSql, overrides) : baseSql;
        if (predictedMatchesOnly) overrides = new Map([...overrides].filter(([, value]) => value.hasPrediction));
        const resultFilter = query.result;
        const sql = resultFilter ? await timedRequestPhase("list-outcome-filter",
          () => filterFeedResult(tx, predictionSql, resultFilter, undefined, overrides)) : predictionSql;
        // Start with the indexed date cohort. Choosing the competition/season
        // join first scans its entire archive before applying the date window.
        // Options cover the entire date cohort, independently of applied filters/page.
        // The window total is evaluated before LIMIT, so it also gives the exact
        // known count without reading the whole cohort a second time.
        const leagueRows = await tx.$queryRaw<{ id: string; name: string | null; country: string | null; logoUrl: string | null; fixtures: bigint; knownFixtures: bigint | Prisma.Decimal }[]>(Prisma.sql`
          SELECT STRAIGHT_JOIN l.id, l.name, l.country, l.logoUrl, COUNT(*) AS fixtures,SUM(COUNT(*)) OVER () AS knownFixtures ${sql.cohortJoins} WHERE ${sql.scope}
          GROUP BY l.id, l.name, l.country, l.logoUrl ORDER BY l.name, l.country, l.id LIMIT 1001`);
        const leagues = leagueRows.map((row) => ({ id: row.id, name: row.name, country: row.country,
          logoUrl: isSafeRemoteImageUrl(row.logoUrl) ? row.logoUrl : null, fixtures: Number(row.fixtures) }));
        const [matching] = await timedRequestPhase("list-count", () => tx.$queryRaw<{ total: bigint; available: bigint | Prisma.Decimal | null; performanceAvailable: bigint | Prisma.Decimal | null;
          void: bigint | Prisma.Decimal | null; exact: bigint | Prisma.Decimal | null }[]>(Prisma.sql`
          SELECT STRAIGHT_JOIN COUNT(*) AS total, SUM(CASE WHEN ${sql.displayAvailable} THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN ${sql.pickAvailable} THEN 1 ELSE 0 END) AS performanceAvailable,
            SUM(CASE WHEN ${sql.pickAvailable} AND c.state='void' THEN 1 ELSE 0 END) AS void,
            ${sql.exact ? Prisma.sql`SUM(CASE WHEN ${sql.exact} THEN 1 ELSE 0 END)` : Prisma.sql`NULL`} AS exact
          ${sql.countJoins} ${sql.searchJoin} WHERE ${sql.where}`));
        if (!matching) throw new MatchFeedError("unavailable");
        const total = Number(matching.total), knownFixtures = Number(leagueRows[0]?.knownFixtures ?? 0);
        const matchingWithMarket = predictedMatchesOnly ? total : Number(matching.available ?? 0);
        const legacyPerformanceAvailable = Number(matching.performanceAvailable ?? 0);
        // Only a true zero may skip the separate summary read. Replay can add a
        // displayed selection to fixtures without an original publication.
        if (!predictedMatchesOnly && total > 0 && legacyPerformanceAvailable === 0 && !query.result && options.includePerformance === false)
          overrides = await readFeedResultOverrides(tx, baseSql, { publishedForecasts, useDefaultFeatured },
            cache ? { database, version: versions.performanceVersion, locale: query.locale, providerOdds } : undefined);
        const visibleOverrides = resultOverridesFor(overrides, query.result);
        const matchingWithPerformancePick = adjustPerformanceAvailability(legacyPerformanceAvailable, visibleOverrides);
        const performance = options.includePerformance === false ? null
          : await readFeedPerformance(tx, sql, { total, available: legacyPerformanceAvailable, void: Number(matching.void ?? 0) }, cache ? {
            key: feedPerformanceCacheKey(sql, query.locale, providerOdds), nowMs: asOf } : undefined, undefined, visibleOverrides);
        // Exact matches precede similar results, so a record's position on its page tells which kind it is.
        const exactMatches = sql.exact ? Number(matching.exact ?? 0) : null;
        type SelectedRow = { id: string; projected?: number | bigint | boolean } &
          Partial<{ [Field in keyof FeedSelectedPick]: FeedSelectedPick[Field] | null }>;
        const selected = await timedRequestPhase(continuation ? "list-continuation-order" : "list-order",
          () => tx.$queryRaw<SelectedRow[]>(Prisma.sql`SELECT STRAIGHT_JOIN f.id
          ${sql.projectPick ? Prisma.sql`,(${sql.displayUsesProjection}) AS projected,${selectedFeedPickColumns}` : Prisma.empty}
          ${sql.pageJoins} ${sql.searchJoin} WHERE ${sql.where}
          ORDER BY ${sql.order} LIMIT ${prefixLength + recordLimit} OFFSET ${firstOffset}`));
        let firstPage = query.page;
        if (continuation) {
          const prefix = selected.slice(0, prefixLength).map(({ id }) => id);
          const actual = createHash("sha256").update(feedContinuationEvidence(continuation.firstPage, prefix)).digest("hex");
          if (prefix.length !== prefixLength || actual !== continuation.hash) {
            if (!rebaseOnDrift || prefixLength + recordLimit > maximumFeedWindowRecords) return null;
            firstPage = continuation.firstPage;
          }
        }
        const rebased = firstPage !== query.page;
        const rows = continuation && !rebased ? selected.slice(prefixLength) : selected;
        const effectiveOffset = rebased ? firstOffset : offset, effectiveLimit = rebased ? prefixLength + recordLimit : recordLimit;
        if (rows.length !== Math.min(effectiveLimit, Math.max(0, total - effectiveOffset)) || new Set(rows.map(({ id }) => id)).size !== rows.length)
          throw new MatchFeedError("unavailable");
        const dates = await storedFeedCoverage(tx, sourceRange), partial = dates.some((date) => !date.authoritative);
        const { run, window } = await storedFeedRunContext(tx, reportingToday, range);
        if (run?.phase === "updating") run.message = messages.text("feed.updating");
        const records = await timedRequestPhase("list-hydration", async () => {
          const hydrated: Awaited<ReturnType<typeof storedFeedFixtures>> = [];
          for (let index = 0; index < rows.length; index += feedQueryRules.maximumPageSize) {
            const ids = rows.slice(index, index + feedQueryRules.maximumPageSize).map(({ id }) => id);
            hydrated.push(...await storedFeedFixtures(tx, ids, false, window, query.locale,
              { prices: providerOdds, preferRecommendation: !publishedForecasts, asOf }));
          }
          return hydrated;
        });
        const replayIds = publishedForecasts ? records.filter(({ kickoffAt, status, forecast, cycle }) =>
          kickoffAt !== null && (status === "live" || isPlayedFinalStatus(status)) && (!forecast || cycle?.state === "closed"))
          .map(({ fixtureId }) => fixtureId) : [];
        const replays = await readNovemberReplayProjections(tx, replayIds);
        const frozen = publishedForecasts && useDefaultFeatured
          ? await readFrozenLocalFeaturedPicks(tx, records.filter(({ fixtureId, status, forecast, cycle }) =>
            !replays.has(fixtureId) && forecast && eligibleFrozenFeaturedStatus(status, cycle?.state)).map(({ fixtureId }) => fixtureId))
          : null;
        const pageRows = new Map(rows.map((row) => [row.id, row]));
        for (const record of records) {
          const date = record.kickoffAt === null ? null : getReportingDate(record.kickoffAt);
          record.partialCoverage = dates.find((entry) => entry.date === date)?.authoritative !== true;
          const { projected, marketKey, selection, probability, source, priceHundredths } = pageRows.get(record.fixtureId)!;
          const shown = marketKey != null && selection != null && probability != null && source != null
            ? { marketKey, selection, probability, source, priceHundredths: priceHundredths ?? null } : null;
          const replay = replays.get(record.fixtureId);
          const frozenPick = frozen?.get(record.fixtureId);
          if (replay && (!projected || shown || useDefaultFeatured)) {
            const display = projectRetrospectiveForecast(record, replay, query.locale, useDefaultFeatured ? undefined : shown ?? undefined, providerOdds);
            if (!display) throw new MatchFeedError("unavailable");
            if (display.card) record.retrospective = display.card;
            else record.retrospectiveSuppression = display.metadata;
          } else if (frozenPick) {
            record.featuredDecisionFrozen = true;
            record.featuredPrediction = toFeaturedLocalDecision(frozenPick, query.locale, providerOdds);
          } else if (publishedForecasts && useDefaultFeatured && lacksRetrospectiveFeaturedPick(record)) {
            record.featuredPrediction = null;
          } else if (projected) {
            const display = shown ? displayFeedSelectedPick(shown, query.locale) : null;
            if (shown && !display) throw new MatchFeedError("unavailable");
            record.filteredPrediction = display;
          }
        }
        const finalPicks = new Map<string, FeaturedSettlementPick>();
        for (const record of records) {
          const pick = record.retrospective?.pick ?? record.filteredPrediction ?? record.featuredPrediction;
          if (pick && (isPlayedFinalStatus(record.status) || record.featuredDecisionFrozen && record.cycle?.state === "void"))
            finalPicks.set(record.fixtureId, pick);
        }
        const exactSettlements = await readFeaturedSettlements(tx, finalPicks);
        for (const record of records) {
          const settlementStatus = exactSettlements.get(record.fixtureId)?.status;
          if (!settlementStatus) continue;
          if (record.retrospective) record.retrospective = { ...record.retrospective, pick: { ...record.retrospective.pick, settlementStatus } };
          else if (record.filteredPrediction) record.filteredPrediction = { ...record.filteredPrediction, settlementStatus };
          else if (record.featuredPrediction) record.featuredPrediction = { ...record.featuredPrediction, settlementStatus };
        }
        const totalPages = Math.ceil(total / query.pageSize), lastPage = Math.max(firstPage, Math.min(through ?? query.page, totalPages));
        const snapshotAt = Math.max(asOf, ...records.map((record) => (record.retrospective ?? record.retrospectiveSuppression)?.activatedAt ?? asOf));
        const keys: Partial<Record<StoredMatchFeedResponse["state"], TextKey>> = { "data-unavailable": "feed.dataUnavailable", "no-fixtures": "feed.noFixtures",
          "no-filter-matches": "feed.noFilterMatches", "page-out-of-range": "feed.pageOutOfRange", "insufficient-data": "feed.insufficientData" };
        return Array.from({ length: lastPage - firstPage + 1 }, (_, index) => {
          const page = firstPage + index, start = index * query.pageSize, pageRecords = records.slice(start, start + query.pageSize);
          const nextPage = page < totalPages && page < feedQueryRules.maximumPage ? page + 1 : null;
          const previousPage = page > 1 ? Math.max(1, Math.min(page - 1, totalPages)) : null;
          const state = knownFixtures === 0 ? partial ? "data-unavailable" : "no-fixtures"
            : total === 0 ? "no-filter-matches" : pageRecords.length === 0 ? "page-out-of-range" : matchingWithMarket === 0 ? "insufficient-data" : "ready";
          return { performance, ...versions, leagues, records: pageRecords, page, nextPage, previousPage, pageSize: query.pageSize, total, totalPages,
            links: { next: pageLink(query, today, nextPage), previous: pageLink(query, today, previousPage) }, asOf: snapshotAt, today,
            range: { from: range.startDate, to: range.endDate, ...range.window }, state, message: keys[state] ? messages.text(keys[state]!) : null,
            coverage: { partial, knownFixtures, matchingWithMarket, matchingWithPerformancePick, dates }, run,
            search: query.search ? { exact: exactMatches ?? 0, similar: total - (exactMatches ?? 0) } : null };
        });
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 }));
      const read = async () => {
        const pages = await readStoredPages();
        // The database boundary wraps thrown transaction errors as unavailable.
        if (pages === null) throw new MatchFeedError("changed");
        // The snapshot is complete. Release the connection before response-only validation and serialization.
        return timedRequestPhase("list-response", async () => pages.map((page) => {
          const response = storedMatchFeedResponseSchema.parse(page);
          if (Buffer.byteLength(JSON.stringify(response), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
          return freezeEvidence(response);
        }));
      };
      const useCompleteForecast = publishedForecasts && isDefaultFeaturedScope(query);
      const decorate = async (response: StoredMatchFeedResponse) => {
        const current = providerOdds ? await timedRequestPhase("list-odds",
          () => withFeedOdds(database, response, asOf, allowInPlayOdds, !publishedForecasts)) : response;
        return useCompleteForecast ? timedRequestPhase("list-featured",
          () => withUpcomingFeaturedOutcomes(database, current, asOf, providerOdds)) : current;
      };
      const todayList = predictedMatchesOnly && publishedForecasts && !publishedOnly && !context.completedOnly
        && options.includePerformance === false && !query.zone && query.pageSize === feedQueryRules.pageSize
        && range.dayCount === 1 && range.startDate === reportingToday
        && (query.result === undefined || query.result === "pending")
        && activeFeedFilterCount(query) === Number(query.result === "pending");
      const readCached = <T>(load: () => Promise<T>, parse: (value: unknown) => T) => cache && !continuation ? timedRequestPhase("list-cache", () => {
        const descriptor = publicCacheDescriptor({ kind: "feed", locale: query.locale, now: asOf, range: sourceRange,
          deadlineAt: getDayBoundsInTimeZone(today, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone).endExclusive,
          query: { ...query, ...(through === undefined ? {} : { through }), projection: 34, providerOdds, completedOnly: context.completedOnly === true,
            publishedOnly, publishedForecasts, predictedMatchesOnly, includePerformance: options.includePerformance !== false, today, dates: { from: range.startDate, to: range.endDate } },
          scope: [...competitionIds].sort((a, b) => a - b), parse });
        // Keep a normal live-refresh window for busy Today pages. The same
        // date, catalog and progress generations still invalidate immediately.
        return cache.read(todayList ? { ...descriptor, lifetimeMs: publicCacheRules.todayFeedListMs } : descriptor, load);
      }) : load();
      if (through !== undefined || rebaseOnDrift) {
        const pages = through === undefined ? await read() : await readCached(read, (value) => {
          const window = storedFeedWindowSchema.parse(value), first = window[0]!;
          if (!first.paginationVersion || window.length !== Math.max(1, Math.min(through, first.totalPages) - query.page + 1)
            || window.some((page, index) => page.page !== query.page + index || page.pageSize !== query.pageSize
              || page.paginationVersion !== first.paginationVersion || page.performanceVersion !== first.performanceVersion
              || page.asOf !== first.asOf || page.total !== first.total)
            || new Set(window.flatMap((page) => page.records.map((record) => record.fixtureId))).size
              !== window.reduce((total, page) => total + page.records.length, 0)) throw new MatchFeedError("unavailable");
          return window;
        });
        // Display overlays use their independent clocks and preserve the audited order and membership.
        const decorated = await decorate({ ...pages[0]!, records: pages.flatMap((page) => page.records) });
        return freezeEvidence(pages.map((page, index) => ({ ...page, asOf: decorated.asOf,
          records: decorated.records.slice(index * query.pageSize, (index + 1) * query.pageSize) })));
      }
      const readPage = async () => (await read())[0]!;
      return [await decorate(await readCached(readPage, (value) => storedMatchFeedResponseSchema.parse(value)))];
    } catch (error) {
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  }
  return Object.freeze({
    async query(input: FeedParameters, context: MatchFeedReadContext = {}) { return (await readPages(input, context))[0]!; },
    queryWindow(input: FeedParameters, through: number, context: MatchFeedReadContext = {}) { return readPages(input, context, through); },
    async queryContinuation(input: FeedParameters, prefix: FeedContinuationPrefix, context: MatchFeedReadContext = {}):
      Promise<FeedContinuationResult<StoredMatchFeedResponse>> {
      const pages = await readPages(input, { ...context, continuation: prefix }, undefined, true);
      return pages[0]!.page === prefix.firstPage ? { pages } : { page: pages[0]! };
    },
  });
}

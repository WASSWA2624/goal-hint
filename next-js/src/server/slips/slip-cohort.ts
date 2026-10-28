import "server-only";

import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { feedQueryRules, getFeedToday, maximumCompetitionScope, resolveFeedDates, type FeedParameters } from "../../domain/feed-query.ts";
import { storedMatchFeedRecordSchema, type StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { slipCohortRules, slipCohortSchema, type SlipCohort } from "../../domain/slip-cohort.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { prepareDemoRange } from "../demo/read-seed.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { feedSql, storedFeedCoverage, storedFeedRunContext } from "../matches/feed-read.ts";
import { storedFeedSearch } from "../matches/feed-search.ts";
import { parseMatchFeedQuery } from "../matches/feed-service.ts";
import { storedFeedFixtures } from "../matches/fixture-read.ts";
import { storedSlipPricePools } from "./price-read.ts";

export type SlipCohortReader = (parameters: FeedParameters, context: Readonly<{ locale?: string }>, clock: Clock) => Promise<SlipCohort>;

/** Reuses the production feed's exact filtering, order, record projection and approved price rules.
 * One repeatable-read snapshot covers ordered IDs, forecasts and all prices. No page re-probes or
 * full-period totals/league/performance scans are needed for a decision limited to 500 matches. */
export function createStoredSlipCohort(options: Readonly<{
  database(): DatabaseRuntime; competitionIds(): readonly number[]; providerOdds?: boolean;
}>): SlipCohortReader {
  return async (parameters, context, clock) => {
    const enabled = options.providerOdds ?? publicPolicy.features.providerOdds;
    if (!enabled) throw new MatchFeedError("unavailable");
    const configured = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(maximumCompetitionScope).parse(options.competitionIds());
    if (new Set(configured).size !== configured.length) throw new MatchFeedError("unavailable");
    const asOf = clock.now(), reportingToday = getReportingDate(asOf);
    const query = parseMatchFeedQuery(parameters, reportingToday, { ...context, providerOdds: enabled, asOf });
    const today = getFeedToday(query, asOf), range = resolveFeedDates(query, today);
    const sourceRange = validateReportingDateRange(getReportingDate(range.window.startInclusive),
      getReportingDate(utcInstantFromEpochMilliseconds(range.window.endExclusive - 1)), feedQueryRules.maximumDays + 2);
    const database = options.database();
    if (isDevelopmentDemo()) await prepareDemoRange(database, sourceRange, asOf);
    return database.transaction(async (tx) => {
      const search = await storedFeedSearch(tx, query.search, range, configured, query.locale);
      const sql = feedSql(query, range, configured, enabled, search);
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT f.id ${sql.joins} ${sql.searchJoin} WHERE ${sql.where}
        ORDER BY ${sql.order} LIMIT ${slipCohortRules.maximumRecords + 1}`);
      if (rows.length > slipCohortRules.maximumRecords + 1 || new Set(rows.map((row) => row.id)).size !== rows.length) {
        throw new MatchFeedError("unavailable");
      }
      const dates = await storedFeedCoverage(tx, sourceRange), partialCoverage = dates.some((entry) => !entry.authoritative);
      // The ordinary feed rejects an unknown empty catalog, but permits an ordinary
      // empty filtered cohort. A one-row existence probe preserves that distinction.
      if (!rows.length && partialCoverage) {
        const known = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT f.id ${sql.cohortJoins} WHERE ${sql.scope} LIMIT 1`);
        if (!known.length) throw new MatchFeedError("unavailable");
      }
      const { window } = await storedFeedRunContext(tx, reportingToday, range);
      const selected = rows.slice(0, slipCohortRules.maximumRecords), records: StoredMatchFeedRecord[] = [];
      const selectionPrices: SlipCohort["selectionPrices"] = {};
      for (let offset = 0; offset < selected.length; offset += slipCohortRules.hydrationBatchSize) {
        const ids = selected.slice(offset, offset + slipCohortRules.hydrationBatchSize).map(({ id }) => id);
        const hydrated = await storedFeedFixtures(tx, ids, false, window, query.locale, { prices: enabled });
        const batch = hydrated.map((record, index) => {
          if (record.fixtureId !== ids[index]) throw new MatchFeedError("unavailable");
          const date = record.kickoffAt === null ? null : getReportingDate(record.kickoffAt);
          record.partialCoverage = dates.find((entry) => entry.date === date)?.authoritative !== true;
          return storedMatchFeedRecordSchema.parse(record);
        });
        records.push(...batch);
        Object.assign(selectionPrices, await storedSlipPricePools(tx, batch, enabled));
      }
      return freezeEvidence(slipCohortSchema.parse({ records, selectionPrices, asOf, today,
        range: { from: range.startDate, to: range.endDate, ...range.window }, searchLimited: rows.length > selected.length, partialCoverage }));
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60_000 });
  };
}

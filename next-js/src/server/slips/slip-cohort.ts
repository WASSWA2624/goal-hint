import "server-only";

import { z } from "zod";
import { calendarRules, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { feedQueryRules, getFeedToday, maximumCompetitionScope, resolveFeedDates, type FeedParameters } from "../../domain/feed-query.ts";
import { storedMatchFeedRecordSchema, type StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { slipCohortRules, slipCohortSchema, type SlipCohort } from "../../domain/slip-cohort.ts";
import type { AdditionalSlipGoalMarketKey } from "../../domain/slip-markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { prepareDemoRange } from "../demo/read-seed.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { feedSql, storedFeedCoverage, storedFeedRunContext } from "../matches/feed-read.ts";
import { storedFeedSearch } from "../matches/feed-search.ts";
import { parseMatchFeedQuery } from "../matches/feed-service.ts";
import { storedFeedFixtures } from "../matches/fixture-read.ts";
import { readFeaturedSlipSelections } from "./best-slip-recommendations.ts";
import { storedSlipPricePools } from "./price-read.ts";
import { storedSlipGoalForecasts } from "./slip-goal-forecast.ts";

export type SlipCohortReader = (parameters: FeedParameters,
  context: Readonly<{ locale?: string; primaryBookmakerOnly?: boolean; featured?: boolean; total15?: "include" | "only";
    minimumKickoffLeadMs?: number; includeAdditionalFeaturedGoals?: boolean;
    additionalGoals?: Readonly<{ keys: readonly AdditionalSlipGoalMarketKey[]; only: boolean }> }>, clock: Clock) => Promise<SlipCohort>;

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
      const featured = context.featured === true;
      const primaryOnly = !featured && context.primaryBookmakerOnly === true;
      const manualPrices = !featured && !primaryOnly;
      const sql = feedSql(query, range, configured, primaryOnly && enabled, search, false, !primaryOnly);
      const total15 = manualPrices ? context.total15 : undefined;
      const additionalGoals = manualPrices ? context.additionalGoals : undefined;
      const hasExtendedGoals = !!(total15 || additionalGoals?.keys.length);
      const extendedOnly = total15 === "only" || additionalGoals?.only;
      const goals = hasExtendedGoals ? Prisma.sql`LEFT JOIN GoalMarketExtension goal ON goal.revisionId=rp.id` : Prisma.empty;
      const extended = Prisma.sql`goal.revisionId IS NOT NULL AND ${sql.cohortWhere}`;
      const where = extendedOnly ? extended : hasExtendedGoals ? Prisma.sql`((${sql.where}) OR (${extended}))` : sql.where;
      const minimumKickoffLeadMs = Math.max(context.minimumKickoffLeadMs ?? 0, calendarRules.cutoffSecondsBeforeKickoff * 1000 + 1);
      const openDeadline = featured ? Prisma.sql`AND f.kickoff>=${new Date(asOf + minimumKickoffLeadMs)}
        AND NOT EXISTS (SELECT 1 FROM PredictionPublicationBarrier barrier WHERE barrier.cycleId=f.activeCycleId AND barrier.closedAt<=${new Date(asOf)})` : Prisma.empty;
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT f.id ${sql.joins} ${goals} ${sql.searchJoin} WHERE (${where}) ${openDeadline}
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
      const featuredSelections: NonNullable<SlipCohort["featuredSelections"]> = [];
      const batchSize = primaryOnly ? slipCohortRules.hydrationBatchSize : feedQueryRules.maximumPageSize;
      for (let offset = 0; offset < selected.length; offset += batchSize) {
        const ids = selected.slice(offset, offset + batchSize).map(({ id }) => id);
        const hydrated = await storedFeedFixtures(tx, ids, false, window, query.locale, { prices: false,
          preferRecommendation: primaryOnly });
        const batch = hydrated.map((record, index) => {
          if (record.fixtureId !== ids[index]) throw new MatchFeedError("unavailable");
          const date = record.kickoffAt === null ? null : getReportingDate(record.kickoffAt);
          record.partialCoverage = dates.find((entry) => entry.date === date)?.authoritative !== true;
          return storedMatchFeedRecordSchema.parse(record);
        });
        records.push(...batch);
        if (featured) {
          featuredSelections.push(...await readFeaturedSlipSelections(tx, batch, asOf, undefined, context.includeAdditionalFeaturedGoals));
          for (const { fixtureId } of batch) selectionPrices[fixtureId] = [];
        } else if (primaryOnly) Object.assign(selectionPrices, await storedSlipPricePools(tx, batch, asOf, { enabled, primaryBookmakerOnly: true }));
      }
      const goalForecasts = hasExtendedGoals ? await storedSlipGoalForecasts(tx, records, asOf, !!total15, additionalGoals?.keys ?? []) : {};
      const families = extendedOnly ? total15 ? ["total-goals" as const] : [] : query.markets;
      if (manualPrices) Object.assign(selectionPrices, await storedSlipPricePools(tx, records, asOf, { enabled, families,
        ...goalForecasts, ...(additionalGoals ? { additionalGoalKeys: additionalGoals.keys } : {}) }));
      return freezeEvidence(slipCohortSchema.parse({ records, selectionPrices, asOf, today, ...goalForecasts,
        ...(featured ? { featuredSelections } : {}),
        range: { from: range.startDate, to: range.endDate, ...range.window }, searchLimited: rows.length > selected.length, partialCoverage }));
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60_000 });
  };
}

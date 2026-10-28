import "server-only";

import { getPublicationDeadline, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock } from "../../domain/calendar.ts";
import { feedQueryRules, type FeedParameters } from "../../domain/feed-query.ts";
import { storedMatchFeedResponseSchema, type StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { buildSlips, hasJointProbabilityBounds, slipBuilderRules, type SlipCriteria, type SlipMatchRecord } from "../../domain/slip-builder.ts";
import { jointSlipBuilder } from "../../domain/joint-slip-model.ts";
import { slipPricePageSchema, type SlipPricePage } from "../../domain/slip-price-page.ts";
import { slipCohortRules, slipCohortSchema } from "../../domain/slip-cohort.ts";
import type { SlipBuildPageResult } from "../../domain/slip-page.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { approvedSlipJointModel, type SlipJointModelBinding } from "./joint-model.ts";
import type { SlipCohortReader } from "./slip-cohort.ts";
export type { SlipJointModelBinding } from "./joint-model.ts";

export const slipReadRules = Object.freeze({ pageSize: feedQueryRules.maximumPageSize, maximumRecords: slipCohortRules.maximumRecords });
export type { SlipBuildPageResult } from "../../domain/slip-page.ts";
export type SlipFeedReader = (parameters: FeedParameters, context: Readonly<{ locale?: string }>, clock: Clock) => Promise<StoredMatchFeedResponse | SlipPricePage>;
type SlipReadSource = { read: SlipFeedReader; readCohort?: SlipCohortReader } | { read?: undefined; readCohort: SlipCohortReader };

/** One bounded stored cohort, never a provider request. Feed bounds apply to its best displayed family;
 * per-selection odds/probability bounds therefore belong to the builder, which considers every chosen family. */
export function createSlipBuildService(options: Readonly<SlipReadSource & {
  consume: () => Promise<void>;
  clock?: Clock;
  /** Effective public odds policy. Tests alone override it to exercise priced stored projections. */
  providerOdds?: boolean;
  build?: typeof buildSlips;
  jointModel?: SlipJointModelBinding | (() => SlipJointModelBinding | null) | null;
}>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  return Object.freeze({ async query(criteria: SlipCriteria, locale = "en"): Promise<SlipBuildPageResult> {
    const asOf = clock.now(), pinnedClock: Clock = { now: () => asOf };
    const base: SlipBuildPageResult = { state: "data-unavailable", data: null, asOf, examined: 0,
      searchLimited: false, partialCoverage: false, retryAfterSeconds: null };
    // Check before any database, cache or limiter access: private prices cannot bypass the public policy.
    if (!(options.providerOdds ?? publicPolicy.features.providerOdds)) return { ...base, state: "odds-unavailable" };
    let joint: SlipJointModelBinding | null = null;
    try { if (!options.build) joint = typeof options.jointModel === "function" ? options.jointModel() : options.jointModel ?? null; }
    catch { return { ...base, state: "model-unavailable" }; }
    if (joint ? !approvedSlipJointModel(joint, asOf) : hasJointProbabilityBounds(criteria)) return { ...base, state: "model-unavailable" };
    let readStage = "rate-limit";
    try {
      await options.consume();
      const today = getReportingDate(asOf), range = validateReportingDateRange(criteria.dateFrom, criteria.dateTo, slipBuilderRules.maximumDays);
      const parameters = new URLSearchParams({ from: criteria.dateFrom, to: criteria.dateTo,
        status: "scheduled", market: criteria.markets.join(","), sort: "probability", dir: "desc", pageSize: String(slipReadRules.pageSize) });
      if (criteria.timeFrom !== "" || criteria.timeTo !== "") {
        parameters.set("timeFrom", criteria.timeFrom); parameters.set("timeTo", criteria.timeTo); parameters.set("tz", publicPolicy.reportingTimeZone);
      }
      const records: SlipMatchRecord[] = [], pages: SlipPricePage[] = [], seen = new Set<string>();
      let first: StoredMatchFeedResponse | null = null, partialCoverage = false, searchLimited = false;
      if (options.readCohort) {
        readStage = "read-cohort";
        const cohort = slipCohortSchema.parse(await options.readCohort(parameters, { locale }, pinnedClock));
        readStage = "validate-cohort";
        if (cohort.asOf !== asOf || cohort.today !== today || cohort.range.from !== range.startDate || cohort.range.to !== range.endDate
          || cohort.range.startInclusive !== range.window.startInclusive || cohort.range.endExclusive !== range.window.endExclusive) {
          throw new MatchFeedError("unavailable");
        }
        partialCoverage = cohort.partialCoverage; searchLimited = cohort.searchLimited;
        records.push(...cohort.records.map((record) => ({ ...record, selectionPrices: cohort.selectionPrices[record.fixtureId]! })));
      } else {
        const read = options.read;
        if (!read) throw new MatchFeedError("unavailable");
        const checked = async (pageNumber: number) => {
          readStage = `read-page-${pageNumber}`;
          const query = new URLSearchParams(parameters); query.set("page", String(pageNumber));
          const value = await read(query, { locale }, pinnedClock);
          readStage = `validate-prices-page-${pageNumber}`;
          // Production supplements the ordinary feed with full approved outcome prices. Legacy injected
          // readers remain useful with only selected-pick prices; the regular feed contract is unchanged.
          const source = "feed" in value ? slipPricePageSchema.parse(value) : (() => {
            const feed = storedMatchFeedResponseSchema.parse(value);
            return slipPricePageSchema.parse({ feed, selectionPrices: Object.fromEntries(feed.records.map((record) => [record.fixtureId, record.prices])) });
          })();
          const page = source.feed;
          const checks = { page: page.page === pageNumber, size: page.pageSize === slipReadRules.pageSize,
            generation: page.paginationVersion !== null, clock: page.asOf === asOf, today: page.today === today,
            dates: page.range.from === range.startDate && page.range.to === range.endDate,
            window: page.range.startInclusive === range.window.startInclusive && page.range.endExclusive === range.window.endExclusive,
            cohort: !first || page.paginationVersion === first.paginationVersion && page.total === first.total,
            available: page.state !== "data-unavailable" };
          const mismatches = Object.entries(checks).filter(([, valid]) => !valid).map(([key]) => key);
          if (mismatches.length) {
            readStage = `validate-page-${pageNumber}:${mismatches.join(",")}`;
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
          readStage = `recheck-page-${source.feed.page}`;
          if (JSON.stringify(latest.feed.records) !== JSON.stringify(source.feed.records)
            || JSON.stringify(latest.selectionPrices) !== JSON.stringify(source.selectionPrices)) throw new MatchFeedError("unavailable");
        }
      }
      readStage = "completion-clock";
      const completedAt = clock.now();
      if (completedAt < asOf || getReportingDate(completedAt) !== today) throw new MatchFeedError("unavailable");
      // The scan can take time. Retain the original observation cutoff, but exclude matches that
      // have entered the publication/kickoff cutoff by completion, even if their first page was valid.
      const current = records.filter((record) => record.kickoffAt === null || completedAt < getPublicationDeadline(record.kickoffAt));
      if (joint && !approvedSlipJointModel(joint, completedAt)) return { ...base, state: "model-unavailable" };
      readStage = "build";
      const data = (joint ? jointSlipBuilder(joint.model) : options.build ?? buildSlips)(criteria, current, asOf);
      // Estimator callbacks cannot retain approval or validity revoked during generation.
      const returnedAt = joint ? clock.now() : completedAt;
      if (joint && !approvedSlipJointModel(joint, returnedAt)) return { ...base, state: "model-unavailable" };
      if (returnedAt < completedAt || getReportingDate(returnedAt) !== today
        || data.slips.some((slip) => slip.selections.some((selection) => returnedAt >= getPublicationDeadline(utcInstantFromEpochMilliseconds(selection.kickoffAt))))) {
        throw new MatchFeedError("unavailable");
      }
      return { ...base, state: data.slips.length > 0 ? "generated" : data.qualifyingMatches === 0 ? "no-qualifying" : "no-combinations",
        data, asOf: returnedAt, examined: records.length, searchLimited: searchLimited || data.searchLimited, partialCoverage };
    } catch (error) {
      if (isDevelopmentDemo()) {
        const kind = error instanceof MatchFeedError ? error.code : error instanceof Error ? error.name : "unknown";
        process.stderr.write(`Development demo slip read failed at ${readStage}: ${kind}.\n`);
      }
      return { ...base, state: error instanceof MatchFeedError && error.code === "rate-limited" ? "rate-limited" : "data-unavailable",
        retryAfterSeconds: error instanceof MatchFeedError ? error.retryAfterSeconds : null };
    }
  } });
}

import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import type { FeedContinuationPrefix } from "../../domain/feed-continuation.ts";
import type { FeedParameters } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { getDatabase } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import type { CacheDescriptor } from "../cache/public-cache.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { createMatchFeedService, type MatchFeedReadContext } from "./feed-service.ts";
import { createMatchFeedSummaryService } from "./feed-summary-service.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";

export const publicMatchProjection = { publishedOnly: false, publishedForecasts: true } as const;
const publicMatchListProjection = { ...publicMatchProjection, predictedMatchesOnly: true } as const;

/** Pages and HTTP reads share the same stored projection, scope and cache. */
export function readPublicMatchFeed(parameters: FeedParameters, context: MatchFeedReadContext = {}, clock?: Clock) {
  return readStoredFeed(parameters, { ...context, ...publicMatchListProjection }, clock, true);
}

/** The offline snapshot contains fixtures and scores independently of forecast availability. */
export function readOfflineFixtureFeed(parameters: FeedParameters, context: MatchFeedReadContext = {}, clock?: Clock) {
  return readStoredFeed(parameters, { ...context, publishedOnly: false, publishedForecasts: false, predictedMatchesOnly: false }, clock, false, publicPolicy.features.providerOdds);
}

/** Match cards and their exact pagination do not wait for a historical audit. */
export function readPublicMatchFeedList(parameters: FeedParameters, context: MatchFeedReadContext = {}, clock?: Clock) {
  return readStoredFeed(parameters, { ...context, ...publicMatchListProjection }, clock, false);
}

/** One authoritative membership snapshot for a bounded continuation or history restore. */
export async function readPublicMatchFeedWindow(parameters: FeedParameters, through: number, context: MatchFeedReadContext = {}, clock?: Clock) {
  return storedFeedService(clock, false).queryWindow(parameters, through, { ...context, ...publicMatchListProjection });
}

/** Verify and continue or rebase the ordered list against one stored snapshot. */
export function readPublicMatchFeedContinuation(parameters: FeedParameters, prefix: FeedContinuationPrefix,
  context: MatchFeedReadContext = {}, clock?: Clock) {
  return storedFeedService(clock, false).queryContinuation(parameters, prefix, { ...context, ...publicMatchListProjection });
}

/** Independently bounded aggregate request; list navigation keeps its 30s limit. */
export function readPublicMatchFeedSummary(parameters: FeedParameters, context: MatchFeedReadContext = {}, clock?: Clock,
  scheduleCacheFill?: CacheDescriptor<unknown>["scheduleFill"]) {
  const database = getDatabase();
  return createMatchFeedSummaryService({ database, cache: createMysqlPublicResponseCache(database), ...(clock ? { clock } : {}),
    ...(scheduleCacheFill ? { scheduleCacheFill } : {}),
    providerOdds: publicOddsEnabled(), competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters, { ...context, ...publicMatchProjection });
}

function readStoredFeed(parameters: FeedParameters, context: MatchFeedReadContext, clock: Clock | undefined, includePerformance: boolean,
  providerOdds = publicOddsEnabled()) {
  return storedFeedService(clock, includePerformance, providerOdds).query(parameters, context);
}

function storedFeedService(clock: Clock | undefined, includePerformance: boolean, providerOdds = publicOddsEnabled()) {
  const database = getDatabase();
  return createMatchFeedService({ database, cache: createMysqlPublicResponseCache(database), includePerformance, providerOdds,
    allowInPlayOdds: providerOdds, ...(clock ? { clock } : {}),
    competitionIds: getRuntimePolicy().choices.competitionIds ?? [] });
}

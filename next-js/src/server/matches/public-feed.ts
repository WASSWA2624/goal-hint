import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import type { FeedParameters } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { getDatabase } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { createMatchFeedService, type MatchFeedReadContext } from "./feed-service.ts";
import { createMatchFeedSummaryService } from "./feed-summary-service.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";

/** Pages and HTTP reads share the same stored projection, scope and cache. */
export function readPublicMatchFeed(parameters: FeedParameters, context: MatchFeedReadContext = {}, clock?: Clock) {
  return readStoredFeed(parameters, { ...context, publishedOnly: true }, clock, true);
}

/** The offline snapshot contains fixtures and scores independently of forecast availability. */
export function readOfflineFixtureFeed(parameters: FeedParameters, context: MatchFeedReadContext = {}, clock?: Clock) {
  return readStoredFeed(parameters, { ...context, publishedOnly: false }, clock, false, publicPolicy.features.providerOdds);
}

/** Match cards and their exact pagination do not wait for a historical audit. */
export function readPublicMatchFeedList(parameters: FeedParameters, context: MatchFeedReadContext = {}, clock?: Clock) {
  return readStoredFeed(parameters, { ...context, publishedOnly: true }, clock, false);
}

/** Independently bounded aggregate request; list navigation keeps its 30s limit. */
export function readPublicMatchFeedSummary(parameters: FeedParameters, context: MatchFeedReadContext = {}, clock?: Clock) {
  const database = getDatabase();
  return createMatchFeedSummaryService({ database, cache: createMysqlPublicResponseCache(database), ...(clock ? { clock } : {}),
    providerOdds: publicOddsEnabled(), competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters, { ...context, publishedOnly: true });
}

function readStoredFeed(parameters: FeedParameters, context: MatchFeedReadContext, clock: Clock | undefined, includePerformance: boolean,
  providerOdds = publicOddsEnabled()) {
  const database = getDatabase();
  return createMatchFeedService({ database, cache: createMysqlPublicResponseCache(database), includePerformance, providerOdds, ...(clock ? { clock } : {}),
    competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters, context);
}

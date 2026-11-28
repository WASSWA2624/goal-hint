import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { FeedContinuationResult } from "../../domain/feed-continuation.ts";
import { matchDetailResponseSchema } from "../../domain/match-detail.ts";
import { matchFeedResponseSchema, type MatchFeedResponse, type StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import type { FeedParameters } from "../../domain/feed-query.ts";
import { matchInsightsSchema } from "../../domain/match-insights.ts";
import { isCompletedFixtureStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import { gateDetailResponse, gateFeedResponse, gateInsights, usesPremiumFeedOracle } from "../../domain/paywall.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { parseMatchFeedQuery, type MatchFeedReadContext } from "../matches/feed-service.ts";
import { readPublicMatchDetail } from "../matches/public-detail.ts";
import { readPublicMatchFeed, readPublicMatchFeedContinuation, readPublicMatchFeedWindow } from "../matches/public-feed.ts";
import { readPublicMatchInsights } from "../matches/public-insights.ts";
import { readPublicSlipBuild } from "../slips/public-slips.ts";
import { resolveViewerAccess, resolveViewerAccessFresh, resolveViewerContentAccess, resolveViewerContentAccessFresh,
  ViewerAccessUnavailable, type ViewerAccess } from "./viewer-access.ts";
import { readPublicMatchStatus } from "../matches/public-insights.ts";

export type AccessResolver = () => Promise<ViewerAccess>;
export async function contentAccess(resolve: AccessResolver): Promise<ViewerAccess> {
  try { return await resolve(); }
  catch (error) {
    if (error instanceof ViewerAccessUnavailable) throw new MatchFeedError("unavailable");
    return { tier: "free", signedIn: false, mode: "free" };
  }
}

/** Raw caches stay viewer-independent. Every page/API factory injects only raw readers into this boundary. */
export function createGatedReads({ resolveAccess = resolveViewerAccess, readFeed = readPublicMatchFeed, readDetail = readPublicMatchDetail,
  readInsights = readPublicMatchInsights, readSlips = readPublicSlipBuild, readStatus = readPublicMatchStatus,
  readWindow = readPublicMatchFeedWindow, readContinuation = readPublicMatchFeedContinuation }: {
  resolveAccess?: AccessResolver; readFeed?: typeof readPublicMatchFeed; readDetail?: typeof readPublicMatchDetail;
  readWindow?: typeof readPublicMatchFeedWindow;
  readContinuation?: typeof readPublicMatchFeedContinuation;
  readInsights?: typeof readPublicMatchInsights; readSlips?: typeof readPublicSlipBuild;
  readStatus?: (id: string) => Promise<SettlementStatus>;
} = {}) {
  const recheckAccess = resolveAccess === resolveViewerAccess ? resolveViewerAccessFresh
    : resolveAccess === resolveViewerContentAccess ? resolveViewerContentAccessFresh : resolveAccess;
  async function forViewer<T>(parameters: FeedParameters, context: MatchFeedReadContext, clock: Clock | undefined,
    read: (context: MatchFeedReadContext, clock: Clock) => Promise<T>) {
    const initial = await contentAccess(resolveAccess);
    const at = clock?.now() ?? utcInstantFromEpochMilliseconds(Date.now());
    const query = parseMatchFeedQuery(parameters, getReportingDate(at), { ...context,
      ...(initial.tier === "free" ? { providerOdds: true } : {}), asOf: at });
    if (initial.tier === "free" && usesPremiumFeedOracle(query)) throw new MatchFeedError("subscription-required");
    const result = await read({ ...context, completedOnly: false }, clock ?? { now: () => at });
    const access = await contentAccess(recheckAccess);
    if (access.tier === "free" && usesPremiumFeedOracle(query)) throw new MatchFeedError("subscription-required");
    return { result, access };
  }
  function projectFeed(response: StoredMatchFeedResponse, access: ViewerAccess) {
    const result = gateFeedResponse(response, access);
    try { return access.tier === "free" ? matchFeedResponseSchema.parse(result) : result; }
    catch { throw new MatchFeedError("unavailable"); }
  }
  return {
    async feed(...[parameters, context = {}, clock]: Parameters<typeof readPublicMatchFeed>) {
      const { result, access } = await forViewer(parameters, context, clock, (...options) => readFeed(parameters, ...options));
      return projectFeed(result, access);
    },
    async feedWindow(...[parameters, through, context = {}, clock]: Parameters<typeof readPublicMatchFeedWindow>) {
      const { result, access } = await forViewer(parameters, context, clock, (...options) => readWindow(parameters, through, ...options));
      return result.map(page => projectFeed(page, access));
    },
    async feedContinuation(...[parameters, prefix, context = {}, clock]: Parameters<typeof readPublicMatchFeedContinuation>):
      Promise<FeedContinuationResult<MatchFeedResponse>> {
      const { result, access } = await forViewer(parameters, context, clock, (...options) => readContinuation(parameters, prefix, ...options));
      return "pages" in result ? { pages: result.pages.map(page => projectFeed(page, access)) } : { page: projectFeed(result.page, access) };
    },
    async detail(...args: Parameters<typeof readPublicMatchDetail>) {
      const response = await readDetail(...args), access = await contentAccess(recheckAccess), result = gateDetailResponse(response, access);
      try { return access.tier === "free" ? matchDetailResponseSchema.parse(result) : result; }
      catch { throw new MatchFeedError("unavailable"); }
    },
    async insights(...[id, clock]: Parameters<typeof readPublicMatchInsights>) {
      if ((await contentAccess(resolveAccess)).tier === "free") {
        let finished = false;
        try { finished = isCompletedFixtureStatus(await readStatus(id)); } catch { /* Unverified details stay private. */ }
        if (!finished) throw new MatchFeedError("subscription-required");
      }
      const response = await readInsights(id, clock);
      const access = await contentAccess(recheckAccess);
      // Status comes from the current canonical fixture, never from a selected historical revision.
      let finished = false;
      if (access.tier === "free") {
        try { finished = isCompletedFixtureStatus(await readStatus(id)); } catch { /* Withhold analysis when status cannot be verified. */ }
        if (!finished) throw new MatchFeedError("subscription-required");
      }
      const result = gateInsights(response, access, finished);
      try { return access.tier === "free" ? matchInsightsSchema.parse(result) : result; }
      catch { throw new MatchFeedError("unavailable"); }
    },
    async slips(...args: Parameters<typeof readPublicSlipBuild>) {
      if ((await contentAccess(resolveAccess)).tier === "free") throw new MatchFeedError("subscription-required");
      const response = await readSlips(...args);
      if ((await contentAccess(recheckAccess)).tier === "free") throw new MatchFeedError("subscription-required");
      return response;
    },
  };
}
const reads = createGatedReads();
export const readGatedMatchFeed = reads.feed;
export const readGatedMatchDetail = reads.detail;
export const readGatedMatchInsights = reads.insights;
export const readGatedSlipBuild = reads.slips;

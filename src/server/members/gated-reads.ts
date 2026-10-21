import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { matchDetailResponseSchema } from "../../domain/match-detail.ts";
import { matchFeedResponseSchema } from "../../domain/match-feed.ts";
import { matchInsightsSchema } from "../../domain/match-insights.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import { gateDetailResponse, gateFeedResponse, gateInsights, usesSubscriberFeedOracle } from "../../domain/paywall.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { parseMatchFeedQuery } from "../matches/feed-service.ts";
import { readPublicMatchDetail } from "../matches/public-detail.ts";
import { readPublicMatchFeed } from "../matches/public-feed.ts";
import { readPublicMatchInsights } from "../matches/public-insights.ts";
import { readPublicSlipBuild } from "../slips/public-slips.ts";
import { resolveViewerAccess, type ViewerAccess } from "./viewer-access.ts";
import { readPublicMatchStatus } from "../matches/public-insights.ts";

export type AccessResolver = () => Promise<ViewerAccess>;
export async function contentAccess(resolve: AccessResolver): Promise<ViewerAccess> {
  try { return await resolve(); } catch { return { tier: "free", signedIn: false, mode: "free" }; }
}

/** Raw caches stay viewer-independent. Every page/API factory injects only raw readers into this boundary. */
export function createGatedReads({ resolveAccess = resolveViewerAccess, readFeed = readPublicMatchFeed, readDetail = readPublicMatchDetail,
  readInsights = readPublicMatchInsights, readSlips = readPublicSlipBuild, readStatus = readPublicMatchStatus }: {
  resolveAccess?: AccessResolver; readFeed?: typeof readPublicMatchFeed; readDetail?: typeof readPublicMatchDetail;
  readInsights?: typeof readPublicMatchInsights; readSlips?: typeof readPublicSlipBuild;
  readStatus?: (id: string) => Promise<SettlementStatus>;
} = {}) {
  return {
    async feed(...[parameters, context = {}, clock]: Parameters<typeof readPublicMatchFeed>) {
      const access = await contentAccess(resolveAccess), at = clock?.now() ?? utcInstantFromEpochMilliseconds(Date.now());
      const query = parseMatchFeedQuery(parameters, getReportingDate(at), { ...context,
        ...(access.tier === "free" ? { providerOdds: true } : {}), asOf: at });
      if (access.tier === "free" && usesSubscriberFeedOracle(query)) throw new MatchFeedError("subscription-required");
      const result = gateFeedResponse(await readFeed(parameters, context, clock ?? { now: () => at }), access);
      try { return access.tier === "free" ? matchFeedResponseSchema.parse(result) : result; }
      catch { throw new MatchFeedError("unavailable"); }
    },
    async detail(...args: Parameters<typeof readPublicMatchDetail>) {
      const access = await contentAccess(resolveAccess), result = gateDetailResponse(await readDetail(...args), access);
      try { return access.tier === "free" ? matchDetailResponseSchema.parse(result) : result; }
      catch { throw new MatchFeedError("unavailable"); }
    },
    async insights(...[id, clock]: Parameters<typeof readPublicMatchInsights>) {
      const access = await contentAccess(resolveAccess);
      const response = await readInsights(id, clock);
      // Status comes from the current canonical fixture, never from a selected historical revision.
      let finished = false;
      if (access.tier === "free") {
        try { finished = isPlayedFinalStatus(await readStatus(id)); } catch { /* Withhold analysis when status cannot be verified. */ }
      }
      const result = gateInsights(response, access, finished);
      try { return access.tier === "free" ? matchInsightsSchema.parse(result) : result; }
      catch { throw new MatchFeedError("unavailable"); }
    },
    async slips(...args: Parameters<typeof readPublicSlipBuild>) {
      if ((await contentAccess(resolveAccess)).tier === "free") throw new MatchFeedError("subscription-required");
      return readSlips(...args);
    },
  };
}
const reads = createGatedReads();
export const readGatedMatchFeed = reads.feed;
export const readGatedMatchDetail = reads.detail;
export const readGatedMatchInsights = reads.insights;
export const readGatedSlipBuild = reads.slips;

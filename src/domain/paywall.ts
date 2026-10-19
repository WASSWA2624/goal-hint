import type { FeedQuery } from "./feed-query.ts";
import type { FixtureSnapshot, StoredFixtureSnapshot } from "./fixture-snapshot.ts";
import type { MatchDetailResponse, StoredMatchDetailResponse } from "./match-detail.ts";
import type { MatchFeedResponse, StoredMatchFeedResponse } from "./match-feed.ts";
import type { MatchInsights, StoredMatchInsights } from "./match-insights.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "./market-settlement.ts";
import { publicPolicy } from "./public-policy.ts";

export type ContentAccess = Readonly<{ tier: "full" | "free"; signedIn: boolean }>;
export const isFreeFixture = (status: SettlementStatus) => isPlayedFinalStatus(status) || status === "canceled" || status === "awarded";
export const usesSubscriberFeedOracle = (query: FeedQuery) => query.probability.min !== 0 || query.probability.max !== 100 || query.sort.by === "probability" || query.picks === "only" || query.odds !== null;
export const withoutSubscriberFeedOracle = (query: FeedQuery): FeedQuery => ({ ...query, probability: { min: 0, max: 100 }, odds: null, picks: "all", sort: { by: "kickoff", direction: "desc" }, page: 1 });
const wireAccess = ({ tier, signedIn }: ContentAccess): ContentAccess => ({ tier, signedIn });
const families = (items: readonly { market: { family: (typeof publicPolicy.markets)[number] } }[]) =>
  publicPolicy.markets.filter((family) => items.some((item) => item.market.family === family));

export function gateFixture<T extends StoredFixtureSnapshot>(fixture: T, access: ContentAccess): Omit<T, "forecast"> & Pick<FixtureSnapshot, "forecast"> {
  if (access.tier === "full" || isFreeFixture(fixture.status)) return fixture;
  const forecast = fixture.forecast;
  return { ...fixture, prices: [], forecast: forecast ? { gated: true, runId: forecast.runId, revisionId: forecast.revisionId,
    publishedAt: forecast.publishedAt, families: families(forecast.markets),
    ...(forecast.runSequence !== undefined ? { runSequence: forecast.runSequence } : {}),
    ...(forecast.provisional !== undefined ? { provisional: forecast.provisional } : {}),
    ...(forecast.updateDelayed !== undefined ? { updateDelayed: forecast.updateDelayed } : {}) } : null };
}

export function gateFeedResponse(response: StoredMatchFeedResponse, access: ContentAccess): MatchFeedResponse {
  return { ...response, records: access.tier === "full" ? response.records : response.records.map((record) => gateFixture(record, access)), access: wireAccess(access) };
}

export function gateDetailResponse(response: StoredMatchDetailResponse, access: ContentAccess): MatchDetailResponse {
  if (access.tier === "full" || isFreeFixture(response.fixture.status)) return { ...response, access: wireAccess(access) };
  const { odds: _odds, ...rest } = response;
  void _odds;
  const snapshot = response.snapshot;
  return { ...rest, fixture: gateFixture(response.fixture, access), history: { gated: true },
    snapshot: snapshot ? { gated: true, revisionId: snapshot.revisionId, cycleId: snapshot.cycleId, historical: snapshot.historical,
      applicability: snapshot.applicability, publishedAt: snapshot.publishedAt, families: families(snapshot.markets) } : null, access: wireAccess(access) };
}

export function gateInsights(response: StoredMatchInsights, access: ContentAccess, status: SettlementStatus): MatchInsights {
  return { ...response, access: wireAccess(access), sections: access.tier === "full" || isFreeFixture(status) ? response.sections : {
    ...response.sections, news: { ...response.sections.news, items: response.sections.news.items.filter((item) => item.kind !== "analysis") },
  } };
}

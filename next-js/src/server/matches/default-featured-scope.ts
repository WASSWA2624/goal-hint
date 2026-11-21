import "server-only";

import type { FeedQuery } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";

/** Result and sort options keep the same featured selection. */
export function isDefaultFeaturedScope(query: FeedQuery): boolean {
  return query.markets.length === publicPolicy.markets.length && !query.marketPicks?.length && !query.odds &&
    query.probability.min === 0 && query.probability.max === 100 && !query.probability.minExclusive;
}

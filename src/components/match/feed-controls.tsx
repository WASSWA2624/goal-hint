"use client";

import { MutedText } from "@/components/ui/layout";
import type { FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";

/** Plain-text summary of an applied query, shown beside a retained earlier result. */
export function FeedAppliedSummary({ query, leagues }: { query: FeedQuery; leagues: MatchFeedResponse["leagues"] }) {
  const messages = createMessages(query.locale);
  const leagueNames = query.leagues.map((id) => leagues.find((item) => item.id === id)?.name ?? id);
  return <MutedText data-applied-filters>
    {messages.text("feed.filters.applied")}: {query.markets.map((family) => messages.text(`market.family.${family}`)).join(", ")}
    {" · "}{messages.text(`feed.status.${query.status}`)}
    {" · "}{messages.text(`feed.sort.${query.sort.by}-${query.sort.direction}`)}
    {leagueNames.length > 0 && <> · {leagueNames.join(", ")}</>}
    {query.countries.length > 0 && <> · {query.countries.join(", ")}</>}
    {(query.probability.min !== 0 || query.probability.max !== 100) && <> · {messages.text("feed.filters.percentRange",
      { min: messages.number(query.probability.min), max: messages.number(query.probability.max) })}</>}
    {query.search && <> · {messages.text("feed.filters.search")}: “{query.search}”</>}
  </MutedText>;
}

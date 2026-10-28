import "server-only";
import type { ReactNode } from "react";
import type { ReportingDate } from "@/domain/calendar";
import type { FeedQuery } from "@/domain/feed-query";
import type { FeedPageResult } from "@/server/matches/feed-page";
import { FeedSurface } from "./feed-surface";
import { PublicShell } from "./public-shell";

/** Server reads stay authoritative; the persistent surface owns UI transitions. */
export function MatchFeedPage(props: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode; showAccount?: boolean; subscriberOnly?: boolean;
  startingPriceUgx?: number | null | undefined;
}) {
  const { query, today } = props;
  return <PublicShell locale={query.locale} today={today} zone={query.zone ?? query.time?.zone ?? null} current="today" showAccount={props.showAccount === true} app compact>
    <FeedSurface key={`${props.subscriberOnly ?? props.result.data?.access.tier}:${props.result.data?.access.signedIn}`} {...props} />
  </PublicShell>;
}

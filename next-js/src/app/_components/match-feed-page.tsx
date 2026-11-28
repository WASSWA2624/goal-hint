import "server-only";
import type { ReactNode } from "react";
import type { ReportingDate } from "@/domain/calendar";
import type { FeedQuery } from "@/domain/feed-query";
import type { FeedPerformanceSeed } from "@/domain/feed-performance-summary";
import type { FeedPageResult, MatchFeedResponse } from "@/domain/match-feed";
import { FeedSurface } from "./feed-surface";
import { PublicShell } from "./public-shell";

/** Server reads stay authoritative; the persistent surface owns UI transitions. */
export function MatchFeedPage(props: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; access?: MatchFeedResponse["access"]; controls?: ReactNode; pagination?: ReactNode; showAccount?: boolean;
  summary?: Promise<FeedPerformanceSeed>; providerOdds?: boolean; retryInitial?: boolean;
}) {
  const { query, today, access = props.result.data?.access ?? { tier: "free", signedIn: false } } = props;
  return <PublicShell locale={query.locale} today={today} zone={query.zone ?? query.time?.zone ?? null} current="today" showAccount={props.showAccount === true} app compact>
    <FeedSurface {...props} access={access} />
  </PublicShell>;
}

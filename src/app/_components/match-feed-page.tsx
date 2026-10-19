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
}) {
  const { query, today } = props;
  const current = query.status === "finished" ? "results" : query.status === "live" ? "live" : "today";
  return <PublicShell locale={query.locale} today={today} zone={query.zone ?? query.time?.zone ?? null} current={current} showAccount={props.showAccount === true} app compact search={null}>
    <FeedSurface key={`${props.subscriberOnly ?? props.result.data?.access.tier}:${props.result.data?.access.signedIn}`} {...props} />
  </PublicShell>;
}

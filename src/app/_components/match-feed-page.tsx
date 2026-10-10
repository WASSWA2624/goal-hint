import "server-only";
import type { ReactNode } from "react";
import type { ReportingDate } from "@/domain/calendar";
import { feedQueryHref, type FeedQuery } from "@/domain/feed-query";
import type { FeedPageResult } from "@/server/matches/feed-page";
import { FeedSurface } from "./feed-surface";
import { PublicShell } from "./public-shell";

/** Server reads stay authoritative; the persistent surface owns UI transitions. */
export function MatchFeedPage(props: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode;
}) {
  const { query, today } = props;
  // The header search keeps dates and filters, restarting at page one.
  const [action, parameters = ""] = feedQueryHref({ ...query, search: "", page: 1 }, today).split("?");
  const search = { action: action!, hidden: [...new URLSearchParams(parameters)] as [string, string][], value: query.search };
  const current = query.status === "finished" ? "results" : query.status === "live" ? "live" : "today";
  return <PublicShell locale={query.locale} today={today} current={current} app search={search}>
    <FeedSurface {...props} />
  </PublicShell>;
}
